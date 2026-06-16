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
import { verifyWebhookSignature } from "@/lib/stripe";
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
import { Webhook as SvixWebhook } from "svix";
import {
	getEmailDomainByResendId,
	updateEmailDomainStatus,
	upsertEmailLogFromWebhook,
	type EmailLogStatus,
} from "@avantej-core/services/email-domain.service";

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
				eq(organizationMembers.status, "active")
			)
		);

	return memberships.map((item) => item.organizationId);
}

async function ensureLocationAccess(
	c: Context,
	locationId: string
) {
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
				const subRef = (inv as unknown as { subscription?: string | { id: string } }).subscription;
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
				const subRef = (inv as unknown as { subscription?: string | { id: string } }).subscription;
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
		if (event.type === "payment_intent.succeeded" || event.type === "charge.refunded") {
			try {
				const obj = event.data.object as Stripe.PaymentIntent | Stripe.Charge;
				const metadata = (obj as { metadata?: Record<string, string> }).metadata ?? {};
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
				console.error(`[connect webhook] ledger write failed for ${event.id}:`, e);
			}
		}

		// Plan C C.7: ledger row for raw application_fee.created (paid out to platform).
		if (event.type === "application_fee.created") {
			try {
				const orgFromAcct = event.account
					? (
							await controlPanelDb
								.select({ organizationId: orgCountryStripeAccounts.organizationId })
								.from(orgCountryStripeAccounts)
								.where(eq(orgCountryStripeAccounts.stripeAccountId, event.account))
								.limit(1)
						)[0]?.organizationId ?? null
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
				console.error(`[connect webhook] application_fee ledger write failed:`, e);
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
						MY: "MYR", SG: "SGD", TH: "THB", ID: "IDR", PH: "PHP",
						VN: "VND", HK: "HKD", AU: "AUD", NZ: "NZD", US: "USD",
						GB: "GBP", JP: "JPY", CN: "CNY",
					};
					const currency = COUNTRY_TO_CURRENCY[country.toUpperCase()] ?? country.toUpperCase();
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
							stripeConnectOnboardingCompletedAt:
								detailsSubmitted ? new Date() : null,
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
					: si.payment_method?.id ?? null;

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
			const metadata = (pi as { metadata?: Record<string, string> }).metadata ?? {};
			const appointmentId = metadata.appointmentId;
			const organizationId = metadata.organizationId;
			const packageInstanceId = metadata.packageInstanceId;
			const isPackagePurchase = metadata.type === "package" && !!packageInstanceId;
			const salesOrderId = metadata.salesOrderId;
			const paymentRowId = metadata.paymentId;
			const isSalesOrderPayment =
				metadata.type === "sales_order" && !!salesOrderId && !!paymentRowId;

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
								? (latestCharge as { id?: string }).id ?? null
								: null;

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

					// Set amountPaid = totalAmount via sql expression to avoid re-fetch.
					await tenantDb
						.update(invoices)
						.set({
							status: "paid",
							amountPaid: sql`${invoices.totalAmount}`,
							updatedAt: new Date(),
						})
						.where(eq(invoices.salesOrderId, salesOrderId));

					await tenantDb
						.update(salesOrders)
						.set({ status: "completed", updatedAt: new Date() })
						.where(eq(salesOrders.id, salesOrderId));

					await tenantDb
						.update(packageInstances)
						.set({
							paymentStatus: "paid",
							status: "active",
							updatedAt: new Date(),
						})
						.where(eq(packageInstances.paymentId, paymentRowId));

					console.log(
						`[connect webhook] sales_order succeeded so=${salesOrderId} pay=${paymentRowId} pi=${piObj.id}`,
					);
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
						? (pi as Stripe.Charge).payment_intent?.toString() ?? null
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
			console.log(`[connect webhook] unhandled event ${event.type} acct=${event.account}`);
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
		c.req.header("x-webhook-secret") || c.req.header("x-ghl-webhook-secret") || undefined;
	const querySecret = c.req.query("token") || c.req.query("secret") || undefined;

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
		const status = (
			error instanceof GhlWebhookError ? error.status : 500
		) as 400 | 401 | 403 | 404 | 500;
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
			status
		);
	}
});

/**
 * Demo endpoint: list sync events for a location
 */
webhookRoutes.get("/gohighlevel/:locationId/events", authMiddleware, async (c) => {
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
			500
		);
	}
});

/**
 * Demo endpoint: list contact links for a location
 */
webhookRoutes.get("/gohighlevel/:locationId/links", authMiddleware, async (c) => {
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
				eq(customerProfiles.id, ghlContactLinks.customerProfileId)
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
			500
		);
	}
});

/**
 * POST /webhooks/resend
 *
 * Resend webhook receiver. Verifies the svix signature against
 * RESEND_WEBHOOK_SECRET, dedupes by svix-id (the `id` field of the parsed
 * envelope), routes status events to email_logs and domain.* events to
 * email_domains. Always returns 200 even on downstream failure — Resend
 * retries forever otherwise.
 */
function getResendWebhookSecret(): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as { env?: Record<string, string> };
		if (env?.RESEND_WEBHOOK_SECRET) return env.RESEND_WEBHOOK_SECRET;
	} catch {
		// not in Workers
	}
	return process.env.RESEND_WEBHOOK_SECRET;
}

export function mapResendEventToLogStatus(eventType: string): EmailLogStatus | null {
	switch (eventType) {
		case "email.sent":
			return "sent";
		case "email.delivered":
			return "delivered";
		case "email.delivery_delayed":
			return "queued";
		case "email.bounced":
			return "bounced";
		case "email.complained":
			return "complained";
		case "email.opened":
			return "opened";
		case "email.clicked":
			return "clicked";
		case "email.failed":
			return "failed";
		default:
			return null;
	}
}

export function mapResendDomainStatus(
	resendStatus: string | undefined,
): "pending" | "verifying" | "verified" | "failed" | null {
	if (!resendStatus) return null;
	switch (resendStatus) {
		case "verified":
			return "verified";
		case "failed":
		case "temporary_failure":
			return "failed";
		case "pending":
		case "not_started":
			return "pending";
		default:
			return "verifying";
	}
}

webhookRoutes.post("/resend", async (c) => {
	const body = await c.req.text();

	const secret = getResendWebhookSecret();
	if (!secret) {
		console.error("[resend webhook] RESEND_WEBHOOK_SECRET not configured");
		return c.json({ error: "Webhook not configured" }, 500);
	}

	const svixId = c.req.header("svix-id");
	const svixTimestamp = c.req.header("svix-timestamp");
	const svixSignature = c.req.header("svix-signature");
	if (!svixId || !svixTimestamp || !svixSignature) {
		return c.json({ error: "Missing svix headers" }, 400);
	}

	let event: { type: string; data: Record<string, unknown>; created_at?: string };
	try {
		const wh = new SvixWebhook(secret);
		event = wh.verify(body, {
			"svix-id": svixId,
			"svix-timestamp": svixTimestamp,
			"svix-signature": svixSignature,
		}) as { type: string; data: Record<string, unknown>; created_at?: string };
	} catch (e) {
		return c.json(
			{ error: e instanceof Error ? e.message : "Invalid signature" },
			400,
		);
	}

	const cpDb = getControlPanelDb(c);
	const eventAt = event.created_at ? new Date(event.created_at) : new Date();

	// Dedup by svix-id (envelope id, NOT data.email_id — message id repeats
	// across delivered/bounced/opened events for the same email and would
	// silently collapse status tracking).
	const claim = await claimWebhookEvent(
		{
			eventId: svixId,
			eventType: event.type,
			source: "resend",
			stripeAccount: null,
		},
		cpDb,
	);
	if (claim.status === "already_processed") {
		return c.json({ received: true, svixId, deduped: true }, 200);
	}

	try {
		if (event.type.startsWith("email.")) {
			const data = event.data as {
				email_id?: string;
				to?: string | string[];
				from?: string;
				subject?: string;
				tags?: Array<{ name: string; value: string }>;
				bounce?: { message?: string };
				click?: unknown;
			};
			const messageId = data.email_id;
			const mapped = mapResendEventToLogStatus(event.type);
			const orgIdTag = data.tags?.find((t) => t.name === "organization_id")?.value;
			const toAddr = Array.isArray(data.to) ? data.to.join(", ") : data.to;
			if (messageId && mapped) {
				await upsertEmailLogFromWebhook(cpDb, {
					resendMessageId: messageId,
					status: mapped,
					eventType: event.type,
					eventAt,
					errorMessage: data.bounce?.message ?? null,
					payload: event,
					organizationId: orgIdTag ?? null,
					fromAddress: data.from ?? null,
					toAddress: toAddr ?? null,
					subject: data.subject ?? null,
				});
			}
		} else if (event.type.startsWith("domain.")) {
			const data = event.data as {
				id?: string;
				status?: string;
				records?: unknown;
			};
			const resendDomainId = data.id;
			if (resendDomainId) {
				const row = await getEmailDomainByResendId(cpDb, resendDomainId);
				if (row) {
					const mappedStatus = mapResendDomainStatus(data.status);
					if (mappedStatus) {
						await updateEmailDomainStatus(cpDb, {
							id: row.id,
							status: mappedStatus,
							dnsRecords: data.records ?? row.dnsRecords,
						});
					}
				}
			}
		}
		await markEventProcessed(svixId, cpDb);
		// Always 200 — Resend retries forever on non-2xx.
		return c.json({ received: true, svixId }, 200);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		await markEventFailed(svixId, msg, cpDb);
		console.error(`[resend webhook] handler failed for ${event.type}:`, e);
		// Still 200 — let our own monitoring catch failures.
		return c.json({ received: true, svixId, handler_error: true }, 200);
	}
});
