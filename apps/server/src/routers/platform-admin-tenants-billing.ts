/**
 * Platform Admin — Tenant Billing router (Plan F.3-A).
 *
 * Per-tenant Stripe invoice history + refund action for the ops team.
 * Mounted under `platformAdminTenants.billing.*`.
 *
 * Procedures:
 *   - listInvoices({ organizationId, limit, startingAfter? })
 *       Cursor-paged list of Stripe invoices for the tenant's customer.
 *       Empty array if the tenant has no Stripe customer yet (trialing).
 *   - getInvoice({ organizationId, invoiceId })
 *       Detail view (with line items) for a single invoice.
 *   - refundInvoice({ organizationId, invoiceId, amountCents?, reason, notes? })
 *       Super-admin only. Issues a real Stripe refund against the invoice's
 *       payment_intent. Writes one `tenant_invoice_refund` audit row on
 *       success only.
 *   - getCustomerSummary({ organizationId })
 *       Stripe customer summary card (default payment method, balance).
 *
 * Stripe access is via the shared `getStripeClient()` singleton OR an
 * injected stub (factory pattern mirrors `subscriptions.ts` so tests can
 * swap the SDK without touching env).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	platformAdminProcedure as adminProcedure,
	superAdminProcedure,
} from "@avantej-core/api";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getStripeClient } from "@/lib/stripe";
import { getTierStripePriceId, type Tier } from "@avantej-core/types";

// ── Stripe surface used by this router. Kept minimal for testability. ──────
type StripeInvoice = {
	id: string;
	number: string | null;
	status: string | null;
	amount_paid: number;
	amount_due: number;
	amount_remaining?: number;
	currency: string;
	created: number;
	hosted_invoice_url: string | null;
	invoice_pdf: string | null;
	payment_intent: string | { id: string } | null;
	charge:
		| string
		| {
				id: string;
				refunded: boolean;
				amount_refunded: number;
		  }
		| null;
	lines?: {
		data: Array<{
			id: string;
			description: string | null;
			amount: number;
			currency: string;
			quantity: number | null;
		}>;
	};
};

type StripePaymentMethod = {
	id: string;
	card?: { brand: string; last4: string } | null;
};

type StripeCustomer = {
	id: string;
	balance?: number;
	currency?: string | null;
	invoice_settings?: { default_payment_method?: string | StripePaymentMethod | null } | null;
	default_source?: string | null;
} | {
	deleted: true;
	id: string;
};

type StripeRefund = {
	id: string;
	status: string | null;
	amount: number;
};

// Stripe Subscription Item — minimal shape needed for tier swap.
type StripeSubscriptionItem = {
	id: string;
	price?: { id: string } | null;
};

type StripeSubscription = {
	id: string;
	items: { data: StripeSubscriptionItem[] };
};

type StripeUpcomingInvoice = {
	id?: string | null;
	amount_due?: number;
	total?: number;
	currency?: string;
};

export type StripeClientLike = {
	invoices: {
		list: (params: {
			customer: string;
			limit?: number;
			starting_after?: string;
			expand?: string[];
		}) => Promise<{ data: StripeInvoice[]; has_more: boolean }>;
		retrieve: (
			id: string,
			params?: { expand?: string[] },
		) => Promise<StripeInvoice>;
		// Stripe SDK 19+: `createPreview` replaces `retrieveUpcoming`. Best-effort
		// — wrapped in try/catch so a missing/failed preview never blocks a swap.
		createPreview?: (params: {
			subscription?: string;
			customer?: string;
		}) => Promise<StripeUpcomingInvoice>;
	};
	refunds: {
		create: (params: {
			payment_intent: string;
			amount?: number;
			reason?: string;
		}) => Promise<StripeRefund>;
	};
	customers: {
		retrieve: (
			id: string,
			params?: { expand?: string[] },
		) => Promise<StripeCustomer>;
	};
	subscriptions: {
		retrieve: (id: string) => Promise<StripeSubscription>;
		update: (
			id: string,
			params: {
				items: Array<{ id: string; price: string }>;
				proration_behavior?: "create_prorations" | "none" | "always_invoice";
			},
		) => Promise<StripeSubscription>;
	};
};

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id) throw new ORPCError("UNAUTHORIZED", { message: "No admin user in session" });
	return id;
}

async function resolveStripeCustomerId(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
): Promise<{ customerId: string | null; orgFound: boolean }> {
	const [org] = await cpDb
		.select({
			id: organizations.id,
			subscriptionId: organizations.subscriptionId,
		})
		.from(organizations)
		.where(eq(organizations.id, organizationId))
		.limit(1);
	if (!org) return { customerId: null, orgFound: false };
	if (!org.subscriptionId) return { customerId: null, orgFound: true };
	const [sub] = await cpDb
		.select({ stripeCustomerId: subscriptions.stripeCustomerId })
		.from(subscriptions)
		.where(eq(subscriptions.id, org.subscriptionId))
		.limit(1);
	return { customerId: sub?.stripeCustomerId ?? null, orgFound: true };
}

function normalizeChargeRefund(
	charge: StripeInvoice["charge"],
): { refunded: boolean; refundedAmount: number } {
	if (!charge || typeof charge === "string") {
		return { refunded: false, refundedAmount: 0 };
	}
	return {
		refunded: Boolean(charge.refunded),
		refundedAmount: Number(charge.amount_refunded ?? 0),
	};
}

function normalizePaymentIntentId(
	pi: StripeInvoice["payment_intent"],
): string | null {
	if (!pi) return null;
	if (typeof pi === "string") return pi;
	return pi.id ?? null;
}

function projectInvoice(inv: StripeInvoice) {
	const { refunded, refundedAmount } = normalizeChargeRefund(inv.charge);
	return {
		id: inv.id,
		number: inv.number,
		status: inv.status,
		amountPaid: Number(inv.amount_paid ?? 0),
		amountDue: Number(inv.amount_due ?? 0),
		currency: (inv.currency ?? "usd").toLowerCase(),
		createdAt: new Date((inv.created ?? 0) * 1000),
		hostedInvoiceUrl: inv.hosted_invoice_url,
		invoicePdf: inv.invoice_pdf,
		paymentIntent: normalizePaymentIntentId(inv.payment_intent),
		refunded,
		refundedAmount,
	};
}

// ── Router factory ──────────────────────────────────────────────────────────
export function createPlatformAdminTenantsBillingRouter(
	stripeOverride?: StripeClientLike,
) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

	return {
		listInvoices: adminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					limit: z.number().int().min(1).max(100).default(20),
					startingAfter: z.string().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = cpDbFrom(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					return {
						invoices: [] as ReturnType<typeof projectInvoice>[],
						hasMore: false,
						nextCursor: undefined as string | undefined,
					};
				}
				const stripe = resolveStripe();
				let resp: { data: StripeInvoice[]; has_more: boolean };
				try {
					resp = await stripe.invoices.list({
						customer: customerId,
						limit: input.limit,
						starting_after: input.startingAfter,
						expand: ["data.charge"],
					});
				} catch (err) {
					throw new ORPCError("BAD_REQUEST", {
						message: `Stripe invoice list failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				const invoices = resp.data.map(projectInvoice);
				const last = invoices[invoices.length - 1];
				return {
					invoices,
					hasMore: Boolean(resp.has_more),
					nextCursor: resp.has_more && last ? last.id : undefined,
				};
			}),

		getInvoice: adminProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					invoiceId: z.string().min(1),
				}),
			)
			.handler(async ({ context, input }) => {
				const cpDb = cpDbFrom(context);
				const { customerId, orgFound } = await resolveStripeCustomerId(
					cpDb,
					input.organizationId,
				);
				if (!orgFound) {
					throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
				}
				if (!customerId) {
					throw new ORPCError("NOT_FOUND", {
						message: "Tenant has no Stripe customer record",
					});
				}
				const stripe = resolveStripe();
				let inv: StripeInvoice;
				try {
					inv = await stripe.invoices.retrieve(input.invoiceId, {
						expand: ["charge", "lines"],
					});
				} catch (err) {
					throw new ORPCError("NOT_FOUND", {
						message: `Stripe invoice retrieve failed: ${
							err instanceof Error ? err.message : "unknown"
						}`,
					});
				}
				const projected = projectInvoice(inv);
				const lines =
					inv.lines?.data.map((l) => ({
						id: l.id,
						description: l.description,
						amount: Number(l.amount ?? 0),
						currency: (l.currency ?? "usd").toLowerCase(),
						quantity: l.quantity,
					})) ?? [];
				return { invoice: projected, lines };
			}),

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
				const cpDb = cpDbFrom(context);
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

				const paymentIntentId = normalizePaymentIntentId(invoice.payment_intent);
				if (!paymentIntentId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Invoice has no payment_intent — cannot refund",
					});
				}

				let refund: StripeRefund;
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
				const cpDb = cpDbFrom(context);
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
				if (dpm && typeof dpm !== "string" && dpm.card) {
					pm = { brand: dpm.card.brand, last4: dpm.card.last4 };
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
				const cpDb = cpDbFrom(context);
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

export const platformAdminTenantsBillingRouter =
	createPlatformAdminTenantsBillingRouter();
