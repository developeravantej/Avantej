/**
 * Webhook Routes
 *
 * Handles external webhook events from Stripe for payment processing.
 *
 * Routes:
 * - POST /webhooks/stripe - Handle Stripe webhook events
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { getStripeClient, verifyWebhookSignature } from "@/lib/stripe";
import { onAppointmentPaid } from "@/services/payment-side-effects.service";
import {
	projectStripeEventToLedger,
	recordLedgerEvent,
} from "@/services/platform-ledger.service";
import { onDisputeEvent } from "@/services/dispute.service";
import type Stripe from "stripe";
import {
	claimWebhookEvent,
	markEventProcessed,
	markEventFailed,
} from "@/services/webhook-dedupe.service";
import {
	upsertSubscriptionFromStripe,
	markPastDue,
	markActive,
} from "@/services/saas-subscription.service";
import { authMiddleware } from "@/middleware/auth.middleware";
import { getControlPanelDb, getTenantDb } from "@/lib/db";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { and, desc, eq, sql } from "drizzle-orm";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import {
	GhlWebhookError,
	markGhlWebhookFailed,
	processGhlWebhook,
} from "@/services/gohighlevel.service";

export const webhookRoutes = new Hono();

function parseLimit(rawLimit: string | undefined, fallback = 20): number {
	if (!rawLimit) {
		return fallback;
	}
	const parsed = Number.parseInt(rawLimit, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(parsed, 100);
}

async function getAccessibleLocationIds(c: Context) {
	const controlPanelDb = getControlPanelDb(c);
	const user = c.get("user");
	const memberships = await controlPanelDb
		.select({ organizationId: organizationMembers.organizationId })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, user.id),
				eq(organizationMembers.status, "active"),
			),
		);

	return memberships.map((item) => item.organizationId);
}

async function ensureLocationAccess(c: Context, locationId: string) {
	const controlPanelDb = getControlPanelDb(c);
	const [location] = await controlPanelDb
		.select({
			id: ghlBranchLinks.id,
			locationId: ghlBranchLinks.ghlLocationId,
			organizationId: ghlBranchLinks.organizationId,
			isActive: ghlBranchLinks.isActive,
			createdAt: ghlBranchLinks.createdAt,
			updatedAt: ghlBranchLinks.updatedAt,
		})
		.from(ghlBranchLinks)
		.where(eq(ghlBranchLinks.ghlLocationId, locationId))
		.limit(1);

	if (!location || !location.isActive) {
		return { error: "Location not found", status: 404 as const };
	}

	const organizationIds = await getAccessibleLocationIds(c);
	if (!organizationIds.includes(location.organizationId)) {
		return { error: "Forbidden", status: 403 as const };
	}

	return { location, status: 200 as const };
}

/**
 * POST /webhooks/stripe/platform
 *
 * Handles Stripe Billing events (subscription lifecycle + invoice events).
 * Verifies the platform webhook secret, deduplicates via processedWebhookEvents,
 * and dispatches to the saas-subscription service.
 */
webhookRoutes.post("/stripe/platform", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("stripe-signature");
	if (!signature) {
		return c.json({ error: "Missing Stripe-Signature header" }, 400);
	}

	let event: Stripe.Event;
	try {
		event = await verifyWebhookSignature(body, signature, "platform");
	} catch (e) {
		return c.json(
			{ error: e instanceof Error ? e.message : "Invalid signature" },
			400,
		);
	}

	const cpDb = getControlPanelDb(c);
	const claim = await claimWebhookEvent(
		{
			eventId: event.id,
			eventType: event.type,
			source: "platform",
			stripeAccount: null,
		},
		cpDb,
	);
	if (claim.status === "already_processed") {
		return c.json({ received: true, deduped: true }, 200);
	}

	try {
		switch (event.type) {
			case "customer.subscription.created":
			case "customer.subscription.updated":
			case "customer.subscription.deleted": {
				const sub = event.data.object as Stripe.Subscription;
				await upsertSubscriptionFromStripe(sub, cpDb);
				break;
			}
			case "invoice.payment_failed": {
				const inv = event.data.object as Stripe.Invoice;
				// Stripe API 2025-10-29.clover removed the typed `subscription` field from
				// Stripe.Invoice; the property is still present on the wire payload.
				const subRef = (
					inv as unknown as { subscription?: string | { id: string } }
				).subscription;
				if (subRef) {
					const subId = typeof subRef === "string" ? subRef : subRef.id;
					await markPastDue(subId, cpDb);
				}
				break;
			}
			case "invoice.paid": {
				const inv = event.data.object as Stripe.Invoice;
				// Stripe API 2025-10-29.clover removed the typed `subscription` field from
				// Stripe.Invoice; the property is still present on the wire payload.
				const subRef = (
					inv as unknown as { subscription?: string | { id: string } }
				).subscription;
				if (subRef) {
					const subId = typeof subRef === "string" ? subRef : subRef.id;
					await markActive(subId, cpDb);
				}
				// Plan C C.7: platform-level ledger row for SaaS revenue audit.
				// Independent try/catch — a failed ledger write must not block the
				// webhook ack (drift is fixable via reconciliation / backfill).
				try {
					const projected = projectStripeEventToLedger(event);
					if (projected) {
						await recordLedgerEvent({
							...projected,
							controlPanelDb: cpDb,
							organizationId: null,
							stripeAccount: null,
						});
					}
				} catch (e) {
					console.error("[platform webhook] ledger write failed:", e);
				}
				break;
			}
			default:
				// No-op for unhandled platform events in v1.
				console.log(`[platform webhook] unhandled event ${event.type}`);
				break;
		}
		await markEventProcessed(event.id, cpDb);
		return c.json({ received: true }, 200);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await markEventFailed(event.id, msg, cpDb);
		console.error(`Platform webhook handler failed for ${event.id}:`, e);
		return c.json({ error: "Handler failed" }, 500);
	}
});

/**
 * POST /webhooks/stripe/connect
 *
 * Stub handler for Stripe Connect events (Plan B/C).
 * Verifies the connect webhook secret, deduplicates, and acks 200.
 * No business logic is dispatched in v1.
 */
webhookRoutes.post("/stripe/connect", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("stripe-signature");
	if (!signature) {
		return c.json({ error: "Missing Stripe-Signature header" }, 400);
	}

	let event: Stripe.Event;
	try {
		event = await verifyWebhookSignature(body, signature, "connect");
	} catch (e) {
		return c.json(
			{ error: e instanceof Error ? e.message : "Invalid signature" },
			400,
		);
	}

	const cpDb = getControlPanelDb(c);
	const claim = await claimWebhookEvent(
		{
			eventId: event.id,
			eventType: event.type,
			source: "connect",
			stripeAccount: event.account ?? null,
		},
		cpDb,
	);
	if (claim.status === "already_processed") {
		return c.json({ received: true, deduped: true }, 200);
	}

	try {
		const controlPanelDb = cpDb;

		// Plan C C.2: dispatch dispute events to the dispute service. Tenant DB
		// is resolved inside the service (it walks org_country_stripe_accounts).
		// We pass null tenantDb here for v1 — the service will skip the tenant
		// notifications row if it can't fetch one, but the platform_dispute_queue
		// write + email still fire. (Phase C.2.1 wires tenantDb pickup later.)
		if (event.type.startsWith("charge.dispute.")) {
			try {
				await onDisputeEvent({ controlPanelDb, tenantDb: null, event });
			} catch (e) {
				console.error(
					`[connect webhook] dispute service threw for ${event.id}:`,
					e,
				);
			}
		}

		// Plan C C.7: platform_payment_ledger writes for Connect-side audit.
		// Independent try/catch — ledger drift is fixable via reconciliation
		// (Phase C.5), so a failed write here must not block the webhook ack.
		if (
			event.type === "payment_intent.succeeded" ||
			event.type === "charge.refunded"
		) {
			try {
				const obj = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
				const metadata =
					(obj as { metadata?: Record<string, string> }).metadata ?? {};
				const orgIdFromMeta = metadata.organizationId ?? null;
				const projected = projectStripeEventToLedger(event);
				if (projected) {
					await recordLedgerEvent({
						...projected,
						controlPanelDb,
						organizationId: orgIdFromMeta,
						stripeAccount: event.account ?? null,
					});
				}
			} catch (e) {
				console.error(
					`[connect webhook] ledger write failed for ${event.id}:`,
					e,
				);
			}
		}

		// Plan C C.7: ledger row for raw application_fee.created (paid out to platform).
		if (event.type === "application_fee.created") {
			try {
				const orgFromAcct = event.account
					? ((
							await controlPanelDb
								.select({
									organizationId: orgCountryStripeAccounts.organizationId,
								})
								.from(orgCountryStripeAccounts)
								.where(
									eq(orgCountryStripeAccounts.stripeAccountId, event.account),
								)
								.limit(1)
						)[0]?.organizationId ?? null)
					: null;
				const projected = projectStripeEventToLedger(event);
				if (projected) {
					await recordLedgerEvent({
						...projected,
						controlPanelDb,
						organizationId: orgFromAcct,
						stripeAccount: event.account ?? null,
					});
				}
			} catch (e) {
				console.error(
					`[connect webhook] application_fee ledger write failed:`,
					e,
				);
			}
		}

		if (event.type === "account.updated") {
			const account = event.data.object as Stripe.Account;
			const orgId = (account.metadata?.organizationId ?? null) as string | null;
			const chargesEnabled = !!account.charges_enabled;
			const payoutsEnabled = !!account.payouts_enabled;
			const detailsSubmitted = !!account.details_submitted;
			const status = chargesEnabled ? "active" : "pending";

			// Phase 4.5: legacy organizations.stripe_connect_account_id is gone.
			// Look up org by metadata.organizationId (preferred) OR by joining
			// against org_country_stripe_accounts.stripe_account_id.
			let resolvedOrgId: string | null = orgId;
			if (!resolvedOrgId) {
				const [hit] = await controlPanelDb
					.select({ organizationId: orgCountryStripeAccounts.organizationId })
					.from(orgCountryStripeAccounts)
					.where(eq(orgCountryStripeAccounts.stripeAccountId, account.id))
					.limit(1);
				resolvedOrgId = hit?.organizationId ?? null;
			}
			const org = resolvedOrgId ? { id: resolvedOrgId } : null;

			if (org) {
				// Mirror into org_country_stripe_accounts. Country comes from the
				// comes from the Stripe Account itself (acct.country). Currency
				// best-effort mapped; falls back to country code if unknown.
				const country = (account.country ?? null) as string | null;
				if (country) {
					const COUNTRY_TO_CURRENCY: Record<string, string> = {
						MY: "MYR",
						SG: "SGD",
						TH: "THB",
						ID: "IDR",
						PH: "PHP",
						VN: "VND",
						HK: "HKD",
						AU: "AUD",
						NZ: "NZD",
						US: "USD",
						GB: "GBP",
						JP: "JPY",
						CN: "CNY",
					};
					const currency =
						COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? country.toUpperCase();
					await controlPanelDb
						.insert(orgCountryStripeAccounts)
						.values({
							organizationId: org.id,
							countryCode: country.toUpperCase(),
							stripeAccountId: account.id,
							stripeConnectStatus: status,
							chargesEnabled,
							payoutsEnabled,
							detailsSubmitted,
							currency,
							stripeConnectOnboardingCompletedAt: detailsSubmitted
								? new Date()
								: null,
							connectAccountUpdatedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: [
								orgCountryStripeAccounts.organizationId,
								orgCountryStripeAccounts.countryCode,
							],
							set: {
								stripeAccountId: account.id,
								stripeConnectStatus: status,
								chargesEnabled,
								payoutsEnabled,
								detailsSubmitted,
								connectAccountUpdatedAt: new Date(),
								updatedAt: new Date(),
							},
						});
					console.log(
						`[connect webhook] account.updated mirrored to org_country_stripe_accounts org=${org.id} country=${country} acct=${account.id}`,
					);
				}

				console.log(
					`[connect webhook] account.updated synced for org=${org.id} acct=${account.id} charges=${chargesEnabled} payouts=${payoutsEnabled} details=${detailsSubmitted}`,
				);
			} else {
				console.warn(
					`[connect webhook] account.updated for acct=${account.id} — no matching org (metadata.organizationId=${orgId})`,
				);
			}
		} else if (event.type === "checkout.session.completed") {
			// Phase E2 — installment_setup: customer completed the hosted Checkout
			// Session that saves their card for auto-charge. Capture the Stripe
			// Customer id and the PaymentMethod from the SetupIntent on the session,
			// then write them onto the package_instance row.
			const session = event.data.object as Stripe.Checkout.Session;
			const metadata = (session.metadata ?? {}) as Record<string, string>;

			if (metadata.type === "installment_setup") {
				const packageInstanceId = metadata.packageInstanceId;
				const organizationId = metadata.organizationId;

				if (!packageInstanceId || !organizationId) {
					console.warn(
						`[connect webhook] checkout.session.completed installment_setup missing metadata — session=${session.id}`,
					);
				} else {
					try {
						// The session may carry the customer id directly; fall back to the
						// setup_intent's payment_method when we need to retrieve it.
						const customerId =
							typeof session.customer === "string"
								? session.customer
								: (session.customer?.id ?? null);

						// Resolve the payment_method id from the SetupIntent on the session.
						const setupIntentRef = session.setup_intent;
						let paymentMethodId: string | null = null;
						if (setupIntentRef) {
							const siId =
								typeof setupIntentRef === "string"
									? setupIntentRef
									: setupIntentRef.id;
							const stripe = getStripeClient();
							const si = await stripe.setupIntents.retrieve(
								siId,
								{},
								{ stripeAccount: event.account ?? undefined },
							);
							paymentMethodId =
								typeof si.payment_method === "string"
									? si.payment_method
									: (si.payment_method?.id ?? null);
						}

						if (!customerId || !paymentMethodId) {
							console.warn(
								`[connect webhook] checkout.session.completed installment_setup incomplete — session=${session.id} customer=${customerId} pm=${paymentMethodId}`,
							);
						} else {
							const tenantDb = await getTenantDb(organizationId, c);
							const { packageInstances: pkgSchema } = await import(
								"@avantej-core/db/schema/tenant/package-instances"
							);
							const result = await tenantDb
								.update(pkgSchema)
								.set({
									stripeCustomerId: customerId,
									defaultPaymentMethodId: paymentMethodId,
									autoChargeEnabled: true,
									updatedAt: new Date(),
								})
								.where(eq(pkgSchema.id, packageInstanceId))
								.returning({ id: pkgSchema.id });

							console.log(
								`[connect webhook] installment_setup saved card pkg=${packageInstanceId} customer=${customerId} pm=${paymentMethodId} rowsUpdated=${result.length}`,
							);
						}
					} catch (setupErr) {
						// Best-effort — never throw out of webhook.
						console.error(
							`[connect webhook] installment_setup handler threw for session=${session.id}:`,
							setupErr,
						);
					}
				}
			}
			// Non-installment_setup checkout sessions are not handled here; fall through.
		} else if (event.type === "setup_intent.succeeded") {
			// Plan B Phase 3d — card saved. Persist the PM id as the customer's
			// default so future chargeSavedCard calls can use it without UI prompts.
			const si = event.data.object as Stripe.SetupIntent;
			const metadata = (si.metadata ?? {}) as Record<string, string>;
			const customerProfileId = metadata.customerProfileId;
			const organizationId = metadata.organizationId;
			const paymentMethodId =
				typeof si.payment_method === "string"
					? si.payment_method
					: (si.payment_method?.id ?? null);

			if (!customerProfileId || !organizationId || !paymentMethodId) {
				console.warn(
					`[connect webhook] setup_intent.succeeded missing metadata or PM — si=${si.id} customerProfileId=${customerProfileId} pm=${paymentMethodId}`,
				);
			} else {
				const tenantDb = await getTenantDb(organizationId, c);
				const result = await tenantDb
					.update(customerProfiles)
					.set({
						defaultPaymentMethodId: paymentMethodId,
						updatedAt: new Date(),
					})
					.where(eq(customerProfiles.id, customerProfileId))
					.returning({ id: customerProfiles.id });
				console.log(
					`[connect webhook] setup_intent.succeeded synced for customerProfile=${customerProfileId} pm=${paymentMethodId} rowsUpdated=${result.length}`,
				);
			}
		} else if (
			event.type === "payment_intent.succeeded" ||
			event.type === "payment_intent.payment_failed" ||
			event.type === "charge.refunded"
		) {
			const pi = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
			const metadata =
				(pi as { metadata?: Record<string, string> }).metadata ?? {};
			const appointmentId = metadata.appointmentId;
			const organizationId = metadata.organizationId;
			const packageInstanceId = metadata.packageInstanceId;
			const isPackagePurchase =
				metadata.type === "package" && !!packageInstanceId;
			const salesOrderId = metadata.salesOrderId;
			const paymentRowId = metadata.paymentId;
			const isSalesOrderPayment =
				metadata.type === "sales_order" && !!salesOrderId && !!paymentRowId;

			// Phase E1 — per-installment Stripe payment link. Match BEFORE
			// sales_order/package branches so it doesn't fall through.
			if (
				metadata.type === "installment" &&
				metadata.installmentId &&
				organizationId &&
				event.type === "payment_intent.succeeded"
			) {
				const piObj = pi as Stripe.PaymentIntent;
				const installmentId = metadata.installmentId;
				try {
					const tenantDb = await getTenantDb(organizationId, c);

					// Same-PI replay guard: if this installment row already recorded
					// this PI id, the event is a Stripe retry — skip silently.
					const { installments: installmentsSchema } = await import(
						"@avantej-core/db/schema/tenant/installments"
					);
					const [existingRow] = await tenantDb
						.select({
							stripePaymentIntentId:
								installmentsSchema.stripePaymentIntentId,
							stripePaymentLinkId: installmentsSchema.stripePaymentLinkId,
							status: installmentsSchema.status,
						})
						.from(installmentsSchema)
						.where(eq(installmentsSchema.id, installmentId))
						.limit(1);

					if (
						existingRow?.status === "paid" &&
						existingRow.stripePaymentIntentId === piObj.id
					) {
						console.log(
							`[connect webhook] installment replay (same PI) ignored installmentId=${installmentId} pi=${piObj.id}`,
						);
					} else if (
						existingRow?.status === "paid" &&
						existingRow.stripePaymentIntentId !== piObj.id
					) {
						// Second/duplicate payment — installment already settled by a
						// different PI. Log loudly; do not double-confirm.
						console.error(
							`[connect webhook] DUPLICATE payment for already-paid installment installmentId=${installmentId} firstPi=${existingRow.stripePaymentIntentId} duplicatePi=${piObj.id} amount=${piObj.amount} — not reprocessed; refund required`,
						);
					} else {
						const { confirmInstallmentPayment } = await import(
							"@avantej-core/services"
						);
						// Resolve link id from the stored row (link creates it there).
						const paymentLinkId =
							existingRow?.stripePaymentLinkId ??
							metadata.paymentLinkId ??
							null;

						await confirmInstallmentPayment(tenantDb, {
							installmentId,
							paymentMethod: "stripe",
							amount: piObj.amount_received ?? piObj.amount,
							stripePaymentIntentId: piObj.id,
							...(paymentLinkId
								? { stripePaymentLinkId: String(paymentLinkId) }
								: {}),
							confirmedBy: "system",
							notes: `Stripe payment link — PI ${piObj.id}`,
						});

						console.log(
							`[connect webhook] installment confirmed installmentId=${installmentId} pi=${piObj.id} amount=${piObj.amount_received ?? piObj.amount}`,
						);

						// Belt-and-braces: deactivate the single-use link now that it's
						// paid. Links are created with completed_sessions.limit=1 which
						// Stripe enforces, but explicit deactivation prevents stale UI.
						if (paymentLinkId && event.account) {
							try {
								const stripe = getStripeClient();
								await stripe.paymentLinks.update(
									String(paymentLinkId),
									{ active: false },
									{ stripeAccount: event.account },
								);
							} catch (linkErr) {
								console.error(
									`[connect webhook] failed to deactivate installment link ${paymentLinkId}:`,
									linkErr,
								);
							}
						}
					}
				} catch (instErr) {
					// Best-effort — never throw out of webhook (Stripe would retry forever).
					console.error(
						`[connect webhook] installment PI handler threw for installmentId=${installmentId} pi=${piObj.id}:`,
						instErr,
					);
				}

				await markEventProcessed(event.id, cpDb);
				return c.json({ received: true }, 200);
			}

			// Plan B Phase 3c.1 — POS online checkout fast-path. Match BEFORE
			// the package + appointment branches so we don't fall through.
			if (isSalesOrderPayment && organizationId) {
				const tenantDb = await getTenantDb(organizationId, c);
				const succeeded = event.type === "payment_intent.succeeded";
				const failed = event.type === "payment_intent.payment_failed";
				const refunded = event.type === "charge.refunded";

				if (succeeded) {
					const piObj = pi as Stripe.PaymentIntent;
					const latestCharge = piObj.latest_charge;
					const chargeId =
						typeof latestCharge === "string"
							? latestCharge
							: latestCharge && typeof latestCharge === "object"
								? ((latestCharge as { id?: string }).id ?? null)
								: null;

					// Same-PI replay guard (distinct from the event-id dedupe above:
					// Stripe can re-send the same PI under a NEW event id). Without
					// this, the installment confirmation below would advance to
					// installment #2 on a replay.
					const [payRow] = await tenantDb
						.select({
							status: payments.status,
							stripePaymentIntentId: payments.stripePaymentIntentId,
							stripePaymentLinkId: payments.stripePaymentLinkId,
							stripeConnectAccountIdSnapshot:
								payments.stripeConnectAccountIdSnapshot,
						})
						.from(payments)
						.where(eq(payments.id, paymentRowId))
						.limit(1);
					const isPiReplay =
						payRow?.status === "succeeded" &&
						payRow.stripePaymentIntentId === piObj.id;

					// Second-payment guard: a DIFFERENT PI succeeded for a payment row
					// that already succeeded — the customer paid twice (multi-use or
					// stale regenerated link). Never reprocess (it would confirm
					// installment #2 with installment #1's money); keep the original
					// PI on the row and tell admins to refund the duplicate.
					const isSecondPayment =
						payRow?.status === "succeeded" &&
						payRow.stripePaymentIntentId !== piObj.id;

					// Cancelled-order guard: the payment link is not always deactivated
					// in time — a customer can pay AFTER staff cancelled the sale. Money
					// moved, so record it on the payment row for reconciliation/refund,
					// but never resurrect the cancelled order/invoice/package.
					const [orderStatusRow] = await tenantDb
						.select({ status: salesOrders.status })
						.from(salesOrders)
						.where(eq(salesOrders.id, salesOrderId))
						.limit(1);
					const isCancelledOrder = orderStatusRow?.status === "cancelled";

					if (isPiReplay) {
						console.log(
							`[connect webhook] sales_order replay (same PI) ignored so=${salesOrderId} pi=${piObj.id}`,
						);
					} else if (isSecondPayment) {
						console.error(
							`[connect webhook] DUPLICATE payment for already-paid order so=${salesOrderId} pay=${paymentRowId} firstPi=${payRow?.stripePaymentIntentId} duplicatePi=${piObj.id} amount=${piObj.amount} — not reprocessed; refund required`,
						);
						try {
							const { notifyAdminsOfCancelledOrderPayment } = await import(
								"@avantej-core/services"
							);
							await notifyAdminsOfCancelledOrderPayment(tenantDb, {
								salesOrderId,
								amountCents: piObj.amount_received ?? piObj.amount ?? 0,
								paymentIntentId: piObj.id,
								kind: "duplicate_payment",
							});
						} catch (notifyErr) {
							console.error(
								`[connect webhook] duplicate-payment notification failed for so=${salesOrderId}:`,
								notifyErr,
							);
						}
					} else if (isCancelledOrder) {
						await tenantDb
							.update(payments)
							.set({
								status: "succeeded",
								stripePaymentIntentId: piObj.id,
								...(chargeId ? { stripeChargeId: chargeId } : {}),
								refundedAt: null,
								updatedAt: new Date(),
							})
							.where(eq(payments.id, paymentRowId));
						console.error(
							`[connect webhook] payment received for CANCELLED order so=${salesOrderId} pay=${paymentRowId} pi=${piObj.id} amount=${piObj.amount} — order NOT completed; refund required`,
						);
						// Surface to humans: fan out an in-app "refund_required"
						// notification to every active org admin. Best-effort — the
						// payment row + log above are the source of truth.
						try {
							const { notifyAdminsOfCancelledOrderPayment } = await import(
								"@avantej-core/services"
							);
							await notifyAdminsOfCancelledOrderPayment(tenantDb, {
								salesOrderId,
								amountCents: piObj.amount_received ?? piObj.amount ?? 0,
								paymentIntentId: piObj.id,
							});
						} catch (notifyErr) {
							console.error(
								`[connect webhook] refund_required notification failed for so=${salesOrderId}:`,
								notifyErr,
							);
						}
					} else {
						await tenantDb
							.update(payments)
							.set({
								status: "succeeded",
								stripePaymentIntentId: piObj.id,
								...(chargeId ? { stripeChargeId: chargeId } : {}),
								refundedAt: null,
								updatedAt: new Date(),
							})
							.where(eq(payments.id, paymentRowId));

						// Package instances on this payment. Installment-plan packages must
						// NOT be blanket-marked "paid": the link only charged the first
						// installment. They activate + confirm installment #1 instead.
						const pkgRows = await tenantDb
							.select({
								id: packageInstances.id,
								installmentsTotal: packageInstances.installmentsTotal,
							})
							.from(packageInstances)
							.where(eq(packageInstances.paymentId, paymentRowId));
						const hasInstallmentPkg = pkgRows.some(
							(p) => (p.installmentsTotal ?? 1) > 1,
						);

						// Invoice: full payment → paid in full. Installment sale → the link
						// charged only the due-now amount; record that and stay partial.
						if (hasInstallmentPkg) {
							const received = piObj.amount_received ?? piObj.amount ?? 0;
							await tenantDb
								.update(invoices)
								.set({
									status: "partially_paid",
									amountPaid: sql`LEAST(${invoices.totalAmount}, ${received})`,
									updatedAt: new Date(),
								})
								.where(eq(invoices.salesOrderId, salesOrderId));
						} else {
							// Set amountPaid = totalAmount via sql expression to avoid re-fetch.
							await tenantDb
								.update(invoices)
								.set({
									status: "paid",
									amountPaid: sql`${invoices.totalAmount}`,
									updatedAt: new Date(),
								})
								.where(eq(invoices.salesOrderId, salesOrderId));
						}

						await tenantDb
							.update(salesOrders)
							.set({ status: "completed", updatedAt: new Date() })
							.where(eq(salesOrders.id, salesOrderId));

						for (const pkg of pkgRows) {
							if ((pkg.installmentsTotal ?? 1) > 1) {
								// Activate; paymentStatus stays partially_paid (synced by
								// confirmInstallmentPayment below).
								await tenantDb
									.update(packageInstances)
									.set({ status: "active", updatedAt: new Date() })
									.where(eq(packageInstances.id, pkg.id));

								// Confirm installment #1 — the money for it just arrived.
								// (recordPosSale skips the at-counter auto-confirm for
								// online sales; this is its webhook-side counterpart.)
								try {
									const { confirmInstallmentPayment } = await import(
										"@avantej-core/services"
									);
									// Include "overdue": installment #1 is due at purchase, so
									// the lock evaluator may flag it before the payment lands.
									const firstPending =
										await tenantDb.query.installments.findFirst({
											where: (
												inst,
												{ and: andFn, eq: eqFn, inArray: inArrayFn },
											) =>
												andFn(
													eqFn(inst.packageInstanceId, pkg.id),
													inArrayFn(inst.status, ["pending", "overdue"]),
												),
											orderBy: (inst, { asc: ascFn }) => [
												ascFn(inst.installmentNumber),
											],
										});
									if (firstPending) {
										await confirmInstallmentPayment(tenantDb, {
											installmentId: firstPending.id,
											paymentMethod: "stripe",
											confirmedBy: "system",
											notes: `Stripe payment link — PI ${piObj.id}`,
										});
									}
								} catch (instErr) {
									// Best-effort — money is recorded on the payment row; a
									// failed confirm is recoverable from the admin overview.
									console.error(
										`[connect webhook] installment #1 confirm failed for pkg=${pkg.id}:`,
										instErr,
									);
								}
							} else {
								await tenantDb
									.update(packageInstances)
									.set({
										paymentStatus: "paid",
										status: "active",
										updatedAt: new Date(),
									})
									.where(eq(packageInstances.id, pkg.id));
							}
						}

						console.log(
							`[connect webhook] sales_order succeeded so=${salesOrderId} pay=${paymentRowId} pi=${piObj.id}`,
						);

						// Phase 3 — Origination commission for Stripe-paid orders.
						// Fired here (not at recordPosSale time) so unpaid online orders
						// never pay origination. Idempotency: (sales_order_id, track_id, staff_id,
						// installment_id) unique index + 23505 skip ensures exactly one split per
						// (order, track, staff, installment).
						//
						// Phase D guard: multi-installment packages (hasInstallmentPkg) skip the
						// front-load path here. The installment confirm path (confirmInstallmentPayment
						// called below for installment #1) calls distributeInstallmentOriginationCommission
						// instead, ensuring commission distributes proportionally across all installments.
						if (!hasInstallmentPkg) {
							try {
								const { calculateOriginationCommission } = await import(
									"@avantej-core/services"
								);
								// Load soldBy + leadSourceUserId from the order row to resolve attribution
								const [orderRow] = await tenantDb
									.select({
										soldBy: salesOrders.soldBy,
										leadSourceUserId: salesOrders.leadSourceUserId,
									})
									.from(salesOrders)
									.where(eq(salesOrders.id, salesOrderId))
									.limit(1);
								if (orderRow && (orderRow.soldBy || orderRow.leadSourceUserId)) {
									await calculateOriginationCommission(tenantDb, {
										salesOrderId,
										soldByUserId: orderRow.soldBy ?? null,
										leadSourceUserId: orderRow.leadSourceUserId ?? null,
										actor: {
											// memberId is a uuid column — system actor has no member row
											userId: "system",
											memberId: null,
											role: "system",
										},
									});
								}
							} catch (originationErr) {
								// Best-effort — never let commission failure fail the webhook ack
								console.error(
									`[connect webhook] origination commission failed for so=${salesOrderId}:`,
									originationErr,
								);
							}
						}
						// Belt-and-braces: deactivate the payment link now that it's paid.
						// Links are created single-use (restrictions.completed_sessions),
						// but links created before that change are multi-use — kill them.
						if (payRow?.stripePaymentLinkId) {
							try {
								const stripe = getStripeClient();
								await stripe.paymentLinks.update(
									String(payRow.stripePaymentLinkId),
									{ active: false },
									{
										stripeAccount:
											(payRow.stripeConnectAccountIdSnapshot as
												| string
												| null) ??
											event.account ??
											undefined,
									},
								);
							} catch (linkErr) {
								console.error(
									`[connect webhook] failed to deactivate paid link ${payRow.stripePaymentLinkId}:`,
									linkErr,
								);
							}
						}
					} // end normal (non-replay, non-cancelled) processing
				} else if (failed) {
					const piObj = pi as Stripe.PaymentIntent;
					const reason = piObj.last_payment_error?.message ?? "Payment failed";
					await tenantDb
						.update(payments)
						.set({
							status: "failed",
							failureReason: reason,
							updatedAt: new Date(),
						})
						.where(eq(payments.id, paymentRowId));
					console.log(
						`[connect webhook] sales_order failed so=${salesOrderId} pay=${paymentRowId} reason=${reason}`,
					);
				} else if (refunded) {
					const charge = pi as Stripe.Charge;
					await tenantDb
						.update(payments)
						.set({
							status: "refunded",
							refundedAt: new Date(),
							refundAmount: charge.amount_refunded ?? null,
							updatedAt: new Date(),
						})
						.where(eq(payments.id, paymentRowId));
					console.log(
						`[connect webhook] sales_order refunded so=${salesOrderId} pay=${paymentRowId} amount=${charge.amount_refunded}`,
					);
				}

				await markEventProcessed(event.id, cpDb);
				return c.json({ received: true }, 200);
			}

			if (isPackagePurchase && organizationId) {
				// Plan B Phase 3c — package purchase. Flip package_instance from
				// pending -> active on success; failed/refunded paths handled below
				// (we leave package in pending state on failure so staff can retry).
				const tenantDb = await getTenantDb(organizationId, c);
				const succeeded = event.type === "payment_intent.succeeded";
				const refunded = event.type === "charge.refunded";
				const set: Record<string, unknown> = { updatedAt: new Date() };
				if (succeeded) {
					set.paymentStatus = "paid";
					set.status = "active";
				} else if (refunded) {
					set.paymentStatus = "refunded";
					set.status = "cancelled";
				}
				if (succeeded || refunded) {
					const r = await tenantDb
						.update(packageInstances)
						.set(set)
						.where(eq(packageInstances.id, packageInstanceId))
						.returning({ id: packageInstances.id });
					console.log(
						`[connect webhook] ${event.type} package pkg=${packageInstanceId} status=${set.status ?? "?"} rowsUpdated=${r.length}`,
					);
				}
				await markEventProcessed(event.id, cpDb);
				return c.json({ received: true }, 200);
			}

			if (!appointmentId || !organizationId) {
				console.warn(
					`[connect webhook] ${event.type} missing metadata.appointmentId/organizationId — pi=${pi.id} acct=${event.account}`,
				);
			} else {
				const tenantDb = await getTenantDb(organizationId, c);

				const succeeded = event.type === "payment_intent.succeeded";
				const failed = event.type === "payment_intent.payment_failed";
				const refunded = event.type === "charge.refunded";

				const update: Record<string, unknown> = { updatedAt: new Date() };
				if (succeeded) {
					update.paymentStatus = "paid";
					update.paidAt = new Date();
					update.paymentFailureReason = null;
					const pmTypes = (pi as Stripe.PaymentIntent).payment_method_types;
					if (Array.isArray(pmTypes) && pmTypes.length > 0 && pmTypes[0]) {
						update.paymentMethodType = pmTypes[0];
					}
				} else if (failed) {
					update.paymentStatus = "failed";
					const err = (pi as Stripe.PaymentIntent).last_payment_error;
					update.paymentFailureReason = err?.message ?? "Payment failed";
				} else if (refunded) {
					update.paymentStatus = "refunded";
				}

				// For payment_intent.* events, pi.id is the PI; for charge.refunded,
				// pi is a Charge with payment_intent property.
				const intentId =
					event.type === "charge.refunded"
						? ((pi as Stripe.Charge).payment_intent?.toString() ?? null)
						: pi.id;
				if (intentId) {
					update.stripePaymentIntentId = intentId;
				}

				// Lookup by metadata.appointmentId — Payment Link path doesn't
				// pre-populate stripe_payment_intent_id (PI is created lazily
				// when the customer hits the link). Charge-dialog path does
				// pre-populate via createPaymentIntent, but either way the
				// metadata key is the authoritative join.
				const result = await tenantDb
					.update(appointments)
					.set(update)
					.where(eq(appointments.id, appointmentId))
					.returning({ id: appointments.id });
				console.log(
					`[connect webhook] ${event.type} synced for appt=${appointmentId} pi=${intentId} status=${update.paymentStatus} rowsUpdated=${result.length}`,
				);

				// Plan B Phase 3a: drive post-payment workflow only when a
				// payment_intent.succeeded actually flipped the row to paid.
				if (succeeded && result.length > 0) {
					const piForSideEffects =
						event.type === "payment_intent.succeeded"
							? (pi as Stripe.PaymentIntent)
							: null;
					const amountCents =
						piForSideEffects?.amount_received ??
						piForSideEffects?.amount ??
						null;
					const currencyForSideEffects = piForSideEffects?.currency ?? null;
					try {
						await onAppointmentPaid({
							tenantDb,
							controlPanelDb: cpDb,
							appointmentId,
							organizationId,
							paymentIntentId: intentId ?? null,
							amountCents,
							currency: currencyForSideEffects,
						});
					} catch (sideErr) {
						// Defensive: never let a side-effect failure fail the
						// webhook ack — Stripe would retry forever.
						console.error(
							`[connect webhook] onAppointmentPaid threw for appt=${appointmentId}:`,
							sideErr,
						);
					}
				}
			}
		} else {
			console.log(
				`[connect webhook] unhandled event ${event.type} acct=${event.account}`,
			);
		}
		await markEventProcessed(event.id, cpDb);
		return c.json({ received: true }, 200);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await markEventFailed(event.id, msg, cpDb);
		console.error(`Connect webhook handler failed for ${event.id}:`, e);
		return c.json({ error: "Handler failed" }, 500);
	}
});

/**
 * Handle GoHighLevel custom workflow webhooks
 *
 * URL locationId is the primary tenant routing key.
 */
webhookRoutes.post("/gohighlevel/:locationId", async (c) => {
	const locationId = c.req.param("locationId");
	const rawBody = await c.req.text();
	const signature = c.req.header("x-wh-signature") || undefined;
	const authorization = c.req.header("authorization") || undefined;
	const headerSecret =
		c.req.header("x-webhook-secret") ||
		c.req.header("x-ghl-webhook-secret") ||
		undefined;
	const querySecret =
		c.req.query("token") || c.req.query("secret") || undefined;

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(rawBody) as Record<string, unknown>;
	} catch {
		return c.json({ error: "Invalid JSON payload" }, 400);
	}

	try {
		const result = await processGhlWebhook({
			c,
			locationId,
			rawBody,
			signature,
			authorization,
			headerSecret,
			querySecret,
			payload,
		});
		const { responseData, ...meta } = result;

		return c.json({
			received: true,
			locationId,
			...meta,
			...responseData,
		});
	} catch (error) {
		const status = (error instanceof GhlWebhookError ? error.status : 500) as
			| 400
			| 401
			| 403
			| 404
			| 500;
		const code =
			error instanceof GhlWebhookError ? error.code : "internal_error";
		const message =
			error instanceof Error ? error.message : "Failed to process GHL webhook";

		await markGhlWebhookFailed({
			c,
			locationId,
			payload,
			rawBody,
			errorMessage: message,
		});

		return c.json(
			{
				error: message,
				code,
				locationId,
			},
			status,
		);
	}
});

/**
 * Demo endpoint: list sync events for a location
 */
webhookRoutes.get(
	"/gohighlevel/:locationId/events",
	authMiddleware,
	async (c) => {
		try {
			const locationId = c.req.param("locationId");
			const access = await ensureLocationAccess(c, locationId);
			if ("error" in access) {
				return c.json({ error: access.error }, access.status);
			}

			const limit = parseLimit(c.req.query("limit"), 25);
			const tenantDb = await getTenantDb(access.location.organizationId, c);
			const events = await tenantDb
				.select({
					id: ghlSyncEvents.id,
					eventKey: ghlSyncEvents.eventKey,
					eventType: ghlSyncEvents.eventType,
					ghlContactId: ghlSyncEvents.ghlContactId,
					email: ghlSyncEvents.email,
					status: ghlSyncEvents.status,
					errorMessage: ghlSyncEvents.errorMessage,
					rawPayload: ghlSyncEvents.rawPayload,
					createdAt: ghlSyncEvents.createdAt,
				})
				.from(ghlSyncEvents)
				.orderBy(desc(ghlSyncEvents.createdAt))
				.limit(limit);

			return c.json({
				locationId,
				organizationId: access.location.organizationId,
				events,
			});
		} catch (error) {
			console.error("Failed to fetch GHL sync events:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to fetch GHL sync events",
				},
				500,
			);
		}
	},
);

/**
 * Demo endpoint: list contact links for a location
 */
webhookRoutes.get(
	"/gohighlevel/:locationId/links",
	authMiddleware,
	async (c) => {
		try {
			const locationId = c.req.param("locationId");
			const access = await ensureLocationAccess(c, locationId);
			if ("error" in access) {
				return c.json({ error: access.error }, access.status);
			}

			const limit = parseLimit(c.req.query("limit"), 50);
			const tenantDb = await getTenantDb(access.location.organizationId, c);
			const links = await tenantDb
				.select({
					id: ghlContactLinks.id,
					ghlContactId: ghlContactLinks.ghlContactId,
					userId: ghlContactLinks.userId,
					customerProfileId: ghlContactLinks.customerProfileId,
					syncStatus: ghlContactLinks.syncStatus,
					lastSyncedAt: ghlContactLinks.lastSyncedAt,
					createdAt: ghlContactLinks.createdAt,
					updatedAt: ghlContactLinks.updatedAt,
					profileIsDeleted: customerProfiles.isDeleted,
					profileDeletedAt: customerProfiles.deletedAt,
				})
				.from(ghlContactLinks)
				.leftJoin(
					customerProfiles,
					eq(customerProfiles.id, ghlContactLinks.customerProfileId),
				)
				.orderBy(desc(ghlContactLinks.updatedAt))
				.limit(limit);

			return c.json({
				locationId,
				organizationId: access.location.organizationId,
				links,
			});
		} catch (error) {
			console.error("Failed to fetch GHL contact links:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to fetch GHL contact links",
				},
				500,
			);
		}
	},
);
