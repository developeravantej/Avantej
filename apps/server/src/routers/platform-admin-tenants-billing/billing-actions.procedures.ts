import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { adminProcedure } from "@/lib/admin-procedure";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { getTierStripePriceId, type Tier } from "@avantej-core/types";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	type StripeClientLike,
	type StripeCustomer,
	type StripeInvoice,
	type StripePaymentMethod,
	type StripeSubscription,
	superAdminProcedure,
	adminUserIdFrom,
	resolveStripeCustomerId,
	normalizePaymentIntentId,
} from "./_shared";

export function createBillingActionsProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
		refundInvoice: superAdminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					invoiceId: z.string().min(1),
					amountCents: z.number().int().min(1).optional(),
					reason: z
						.enum(["duplicate", "fraudulent", "requested_by_customer"])
						.default("requested_by_customer"),
					notes: z.string().max(1000).optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const adminUserId = adminUserIdFrom(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Tenant has no Stripe customer — nothing to refund",
					});
				}

				const stripe = resolveStripe();
				let invoice: StripeInvoice;
				try {
					invoice = await stripe.invoices.retrieve(input.invoiceId, {
						expand: ["charge"],
					});
				} catch (err) {
					throw new ORPCError("NOT_FOUND", {
						message: `Stripe invoice retrieve failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				const paymentIntentId = normalizePaymentIntentId(
					invoice.payment_intent,
				);
				if (!paymentIntentId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Invoice has no payment_intent — cannot refund",
					});
				}

				let refund: { id: string; status: string | null; amount: number };
				try {
					refund = await stripe.refunds.create({
						payment_intent: paymentIntentId,
						...(input.amountCents !== undefined
							? { amount: input.amountCents }
							: {}),
						reason: input.reason,
					});
				} catch (err) {
					// NO audit row on Stripe failure.
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe refund failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				// Audit success only.
				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "tenant_invoice_refund",
					targetOrganizationId: input.organizationId,
					metadata: {
						invoiceId: input.invoiceId,
						paymentIntentId,
						amountCents: input.amountCents ?? null,
						reason: input.reason,
						notes: input.notes ?? null,
						refundId: refund.id,
						status: refund.status,
						refundAmount: refund.amount,
					},
				});

				return {
					ok: true as const,
					refundId: refund.id,
					amountCents: Number(refund.amount ?? input.amountCents ?? 0),
					status: refund.status ?? "pending",
				};
			}),

		getCustomerSummary: adminProcedure
			.input(z.object({ organizationId: z.string().uuid() }))
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					return {
						stripeCustomerId: null as string | null,
						defaultPaymentMethod: null as {
							brand: string;
							last4: string;
						} | null,
						currency: "usd",
						balance: 0,
					};
				}
				const stripe = resolveStripe();
				let cust: StripeCustomer;
				try {
					cust = await stripe.customers.retrieve(customerId, {
						expand: ["invoice_settings.default_payment_method"],
					});
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe customer retrieve failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				if ((cust as { deleted?: true }).deleted) {
					return {
						stripeCustomerId: customerId,
						defaultPaymentMethod: null,
						currency: "usd",
						balance: 0,
					};
				}
				const c = cust as Exclude<StripeCustomer, { deleted: true }>;
				const dpm = c.invoice_settings?.default_payment_method;
				let pm: { brand: string; last4: string } | null = null;
				if (
					dpm &&
					typeof dpm !== "string" &&
					(dpm as StripePaymentMethod).card
				) {
					pm = {
						brand: (dpm as StripePaymentMethod).card!.brand,
						last4: (dpm as StripePaymentMethod).card!.last4,
					};
				}
				return {
					stripeCustomerId: customerId,
					defaultPaymentMethod: pm,
					currency: (c.currency ?? "usd").toLowerCase(),
					balance: Number(c.balance ?? 0),
				};
			}),

		// ── Plan F.3.5 (Agent T2) — Tier change mid-period ─────────────────
		// Swap a tenant's subscription tier. Stripe handles proration via
		// `proration_behavior`. Writes one `tenant_tier_change` audit row on
		// success only (matches the refundInvoice pattern). NO schema change.
		changeTier: superAdminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					toTier: z.enum(["basic", "professional", "enterprise"]),
					prorationBehavior: z
						.enum(["create_prorations", "none", "always_invoice"])
						.default("create_prorations"),
					notes: z.string().max(1000).optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = getControlPanelDb(context);
				const adminUserId = adminUserIdFrom(context);

				// Resolve org → subscription row.
				const [org] = await cpDb
					.select({
						id: organizations.id,
						subscriptionId: organizations.subscriptionId,
					})
					.from(organizations)
					.where(eq(organizations.id, input.organizationId))
					.limit(1);
				if (!org) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!org.subscriptionId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Tenant has no subscription — cannot change tier",
					});
				}
				const [sub] = await cpDb
					.select()
					.from(subscriptions)
					.where(eq(subscriptions.id, org.subscriptionId))
					.limit(1);
				if (!sub) {
					throw new ORPCError("NOT_FOUND", {
						message: "Subscription record not found",
					});
				}

				const fromTier = sub.tier as Tier;
				if (fromTier === input.toTier) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Already on this tier",
					});
				}

				const stripe = resolveStripe();
				const newPriceId = getTierStripePriceId(input.toTier);

				// Fetch Stripe subscription to read the current item id.
				let stripeSub: StripeSubscription;
				try {
					stripeSub = await stripe.subscriptions.retrieve(
						sub.stripeSubscriptionId,
					);
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe subscription retrieve failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				const currentItemId = stripeSub.items?.data?.[0]?.id;
				if (!currentItemId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Stripe subscription has no items — cannot swap price",
					});
				}

				// Perform the tier swap.
				try {
					await stripe.subscriptions.update(sub.stripeSubscriptionId, {
						items: [{ id: currentItemId, price: newPriceId }],
						proration_behavior: input.prorationBehavior,
					});
				} catch (err) {
					// NO audit row on Stripe failure.
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe tier change failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}

				// Best-effort: read proration preview. Tier change must not fail
				// because of preview retrieval errors. NOTE: organizationCountLimit
				// + applicationFeeBps are NOT updated here — those are synced from
				// Stripe via webhooks. We only touch tier + stripePriceId, which
				// is enough for the UI surface and audit trail.
				let prorationInvoiceId: string | null = null;
				let prorationAmountCents: number | null = null;
				if (stripe.invoices.createPreview) {
					try {
						const preview = await stripe.invoices.createPreview({
							subscription: sub.stripeSubscriptionId,
						});
						prorationInvoiceId = preview.id ?? null;
						prorationAmountCents =
							typeof preview.amount_due === "number"
								? preview.amount_due
								: typeof preview.total === "number"
									? preview.total
									: null;
					} catch {
						// best-effort — swallow.
					}
				}

				// Update local subscription tier + price id.
				await cpDb
					.update(subscriptions)
					.set({
						tier: input.toTier,
						stripePriceId: newPriceId,
						updatedAt: new Date(),
					})
					.where(eq(subscriptions.id, sub.id));

				// Audit success.
				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "tenant_tier_change",
					targetOrganizationId: input.organizationId,
					metadata: {
						fromTier,
						toTier: input.toTier,
						stripeSubscriptionId: sub.stripeSubscriptionId,
						prorationBehavior: input.prorationBehavior,
						notes: input.notes ?? null,
						prorationInvoiceId,
						prorationAmountCents,
					},
				});

				return {
					ok: true as const,
					fromTier,
					toTier: input.toTier,
					prorationInvoiceId,
					prorationAmountCents,
				};
			}),
	};
}
