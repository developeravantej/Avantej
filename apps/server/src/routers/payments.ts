/**
 * Payments oRPC Router (Plan B Phase 2 — Direct Charge).
 *
 * Procedures:
 *   - createPaymentIntent(appointmentId):
 *       Server-side Stripe Direct Charge on the tenant's Connect account.
 *       Computes application_fee_amount from the tenant's SaaS tier.
 *       Returns clientSecret for the web to confirm via Stripe Elements.
 *
 *   - sendPaymentLink(appointmentId):
 *       Creates a Stripe Payment Link (Stripe-hosted checkout page) on the
 *       tenant's Connect account. URL is returned for staff to forward to
 *       the customer (SMS, email, paste). Customer doesn't need an account.
 *
 *   - getPaymentStatus(appointmentId):
 *       Returns the current paymentStatus + stripe_payment_intent_id from
 *       the appointments row (synced from webhooks).
 *
 * All procedures require an authenticated session + organizationId in input.
 *
 * Per ADR-0001 (Direct Charge via Stripe Connect Standard, MY platform),
 * ADR-0002 (per-tier application fee), ADR-0008 (account.updated drives
 * chargesEnabled gate).
 *
 * Phase 2 assumptions (deferred to later phases):
 *   - Single Connect acct per org (Phase 4: per-country branch acct).
 *   - One charge per appointment (Phase 3: partial pay, refunds, retries).
 *   - MYR-only (Phase 4: per-country currency).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { getStripeClient } from "@/lib/stripe";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { services } from "@avantej-core/db/schema/tenant/services";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import {
	getConnectAccountForOrg,
	getConnectAccountForOrgCountry,
	computeApplicationFee,
	type ResolvedConnectAccount,
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import { getOrCreateStripeCustomer } from "@/services/customer-stripe.service";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { createPackageInstance } from "@avantej-core/services";

/** Minimal Stripe surface — keeps the router DI-testable without the SDK. */
type StripeClientLike = {
	paymentIntents: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string; idempotencyKey?: string },
		) => Promise<{ id: string; client_secret: string | null; status: string }>;
	};
	paymentLinks: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; url: string }>;
	};
	prices: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string }>;
	};
	refunds: {
		create: (
			params: unknown,
			options?: { stripeAccount?: string; idempotencyKey?: string },
		) => Promise<{
			id: string;
			status: string | null;
			amount: number;
			currency: string;
		}>;
	};
	customers: {
		create: (
			params: { email?: string; name?: string; metadata?: Record<string, string> },
			options?: { stripeAccount?: string },
		) => Promise<{ id: string }>;
		retrieve: (
			id: string,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; deleted?: boolean }>;
	};
	setupIntents: {
		create: (
			params: { customer: string; payment_method_types?: string[]; usage?: "off_session" | "on_session"; metadata?: Record<string, string> },
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; client_secret: string | null; status: string }>;
	};
	paymentMethods: {
		list: (
			params: { customer: string; type?: string; limit?: number },
			options?: { stripeAccount?: string },
		) => Promise<{ data: Array<{ id: string; card?: { brand: string; last4: string; exp_month: number; exp_year: number } | null }> }>;
	};
};

function getEnvVar(key: string): string | undefined {
	try {
		const { env } = require("cloudflare:workers") as {
			env: Record<string, string | undefined>;
		};
		const v = env[key];
		if (v !== undefined) return v;
	} catch {
		// Not in Cloudflare Workers runtime.
	}
	const globalEnv = (globalThis as { env?: Record<string, string | undefined> }).env;
	if (globalEnv?.[key] !== undefined) return globalEnv[key];
	return process.env[key];
}

/** Pull the gross charge amount (in cents) from the appointment row. */
function resolveGrossAmount(appt: {
	sessionTotal: number | null;
	pricePerClient: number | null;
}): number {
	if (typeof appt.sessionTotal === "number" && appt.sessionTotal > 0) {
		return appt.sessionTotal;
	}
	if (typeof appt.pricePerClient === "number" && appt.pricePerClient > 0) {
		return appt.pricePerClient;
	}
	throw new ORPCError("BAD_REQUEST", {
		message: "Appointment has no priced session_total or price_per_client",
	});
}

export function createPaymentsRouter(stripeClientOverride?: StripeClientLike) {
	const resolveStripe = (): StripeClientLike =>
		stripeClientOverride ?? (getStripeClient() as unknown as StripeClientLike);

	return {
		createPaymentIntent: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					appointmentId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...args: unknown[]) => { from: (...a: unknown[]) => any };
							update: (...args: unknown[]) => { set: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Tenant DB unavailable",
					});
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);

				// Fetch appointment + service.
				const [appt] = await (tenantDb as any)
					.select()
					.from(appointments)
					.where(eq(appointments.id, input.appointmentId))
					.limit(1);
				if (!appt) {
					throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
				}
				if (appt.paymentStatus === "paid") {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Appointment is already paid",
					});
				}

				// Phase 4: resolve Connect account per the branch's country.
				const countryCode = await resolveBranchCountryCode(appt.branchId, tenantDb as never);
				const acct = countryCode
					? await getConnectAccountForOrgCountry(input.organizationId, countryCode, controlPanelDb)
					: await getConnectAccountForOrg(input.organizationId, controlPanelDb);

				const amount = resolveGrossAmount(appt);
				const currency = (appt.currency ?? "MYR").toLowerCase();
				const applicationFeeAmount = computeApplicationFee(amount, acct.appFeeBps);

				const stripe = resolveStripe();
				const pi = await stripe.paymentIntents.create(
					{
						amount,
						currency,
						application_fee_amount: applicationFeeAmount,
						automatic_payment_methods: { enabled: true },
						metadata: {
							appointmentId: appt.id,
							organizationId: input.organizationId,
							branchId: appt.branchId,
						},
					},
					{
						stripeAccount: acct.acctId,
						idempotencyKey: `pi:appt:${appt.id}`,
					},
				);

				// Persist snapshot fields so historical rows survive Phase 4 schema move.
				await (tenantDb as any)
					.update(appointments)
					.set({
						stripePaymentIntentId: pi.id,
						stripeConnectAccountIdSnapshot: acct.acctId,
						applicationFeeAmount,
						currency: currency.toUpperCase(),
						updatedAt: new Date(),
					})
					.where(eq(appointments.id, appt.id));

				return {
					clientSecret: pi.client_secret ?? "",
					paymentIntentId: pi.id,
					stripeAccountId: acct.acctId,
					amount,
					currency: currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),

		sendPaymentLink: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					appointmentId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...args: unknown[]) => { from: (...a: unknown[]) => any };
							update: (...args: unknown[]) => { set: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Tenant DB unavailable",
					});
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);

				const [appt] = await (tenantDb as any)
					.select()
					.from(appointments)
					.where(eq(appointments.id, input.appointmentId))
					.limit(1);
				if (!appt) {
					throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
				}
				if (appt.paymentStatus === "paid") {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Appointment is already paid",
					});
				}

				// Phase 4: resolve Connect account per the branch's country.
				const countryCode = await resolveBranchCountryCode(appt.branchId, tenantDb as never);
				const acct = countryCode
					? await getConnectAccountForOrgCountry(input.organizationId, countryCode, controlPanelDb)
					: await getConnectAccountForOrg(input.organizationId, controlPanelDb);

				// Fetch service name for the line item.
				let productName = "Appointment payment";
				if (appt.serviceId) {
					const [svc] = await (tenantDb as any)
						.select({ name: services.name })
						.from(services)
						.where(eq(services.id, appt.serviceId))
						.limit(1);
					if (svc?.name) productName = String(svc.name);
				}

				const amount = resolveGrossAmount(appt);
				const currency = (appt.currency ?? "MYR").toLowerCase();
				const applicationFeeAmount = computeApplicationFee(amount, acct.appFeeBps);

				const stripe = resolveStripe();
				// Payment Links require an inline Price on the connected account.
				const price = await stripe.prices.create(
					{
						unit_amount: amount,
						currency,
						product_data: { name: productName },
					},
					{ stripeAccount: acct.acctId },
				);

				const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
				const sharedMetadata = {
					appointmentId: appt.id,
					organizationId: input.organizationId,
					branchId: appt.branchId,
				};
				const link = await stripe.paymentLinks.create(
					{
						line_items: [{ price: price.id, quantity: 1 }],
						application_fee_amount: applicationFeeAmount,
						after_completion: {
							type: "redirect",
							redirect: { url: `${webAppUrl}/appointment/view?paid=1&id=${appt.id}` },
						},
						metadata: sharedMetadata,
						// Propagate to PaymentIntent so payment_intent.succeeded webhook
						// (on connect endpoint) can resolve the appointment row. Link/session
						// metadata does NOT auto-flow to PI; this is required.
						payment_intent_data: { metadata: sharedMetadata },
					},
					{ stripeAccount: acct.acctId },
				);

				await (tenantDb as any)
					.update(appointments)
					.set({
						stripePaymentLinkId: link.id,
						paymentLinkUrl: link.url,
						stripeConnectAccountIdSnapshot: acct.acctId,
						applicationFeeAmount,
						currency: currency.toUpperCase(),
						updatedAt: new Date(),
					})
					.where(eq(appointments.id, appt.id));

				return {
					paymentLinkId: link.id,
					paymentLinkUrl: link.url,
					amount,
					currency: currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),

		getPaymentStatus: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					appointmentId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...args: unknown[]) => { from: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Tenant DB unavailable",
					});
				}

				const [appt] = await (tenantDb as any)
					.select({
						id: appointments.id,
						paymentStatus: appointments.paymentStatus,
						stripePaymentIntentId: appointments.stripePaymentIntentId,
						stripePaymentLinkId: appointments.stripePaymentLinkId,
						paymentLinkUrl: appointments.paymentLinkUrl,
						currency: appointments.currency,
						sessionTotal: appointments.sessionTotal,
						applicationFeeAmount: appointments.applicationFeeAmount,
						paidAt: appointments.paidAt,
						paymentFailureReason: appointments.paymentFailureReason,
						paymentMethodType: appointments.paymentMethodType,
					})
					.from(appointments)
					.where(eq(appointments.id, input.appointmentId))
					.limit(1);
				if (!appt) {
					throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
				}
				return appt;
			}),

		refund: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					appointmentId: z.string().uuid(),
					reason: z
						.enum(["duplicate", "fraudulent", "requested_by_customer"])
						.optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...args: unknown[]) => { from: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Tenant DB unavailable",
					});
				}

				const [appt] = await (tenantDb as any)
					.select()
					.from(appointments)
					.where(eq(appointments.id, input.appointmentId))
					.limit(1);
				if (!appt) {
					throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
				}
				if (appt.paymentStatus !== "paid") {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: `Cannot refund: appointment payment_status is "${appt.paymentStatus}", not "paid"`,
					});
				}
				if (!appt.stripePaymentIntentId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Appointment has no stripe_payment_intent_id",
					});
				}
				// Use snapshot acct from appointment (Phase 4 migration safety).
				const stripeAccountId = appt.stripeConnectAccountIdSnapshot as
					| string
					| null
					| undefined;
				if (!stripeAccountId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message:
							"Appointment has no stripe_connect_account_id_snapshot — cannot route refund",
					});
				}

				const stripe = resolveStripe();
				const refund = await stripe.refunds.create(
					{
						payment_intent: appt.stripePaymentIntentId,
						refund_application_fee: true,
						reverse_transfer: false,
						...(input.reason ? { reason: input.reason } : {}),
					},
					{
						stripeAccount: stripeAccountId,
						idempotencyKey: `refund:appt:${appt.id}`,
					},
				);

				// Webhook (charge.refunded) flips appointments.payment_status to "refunded".
				// We don't write the row here.
				return {
					refundId: refund.id,
					status: refund.status ?? "pending",
					amount: refund.amount,
					currency: (refund.currency ?? "myr").toUpperCase(),
				};
			}),

		// === Plan B Phase 3d — Card-on-file ===

		createSetupIntent: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					customerProfileId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...a: unknown[]) => { from: (...a: unknown[]) => any };
							update: (...a: unknown[]) => { set: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant DB unavailable" });
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);

				const [profile] = await (tenantDb as any)
					.select()
					.from(customerProfiles)
					.where(eq(customerProfiles.id, input.customerProfileId))
					.limit(1);
				if (!profile) {
					throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
				}

				// Phase 4: customer's stripeConnectAccountIdSnapshot anchors the
				// acct for already-provisioned customers. fee% comes from legacy
				// (org-level) resolver — we don't yet know the country here so
				// can't call the country-specific resolver for the snapshot acct.
				// v1 follow-up: derive primary country from the customer's branch
				// or from organizations.primaryCountryCode and use the country
				// resolver consistently. For now, legacy provides the fee bps
				// (tier-only, country-agnostic), which is correct.
				const acct = await getConnectAccountForOrg(input.organizationId, controlPanelDb);
				const snapshotAcctId = profile.stripeConnectAccountIdSnapshot as
					| string
					| null
					| undefined;
				const stripeAccountId = snapshotAcctId ?? acct.acctId;

				const stripe = resolveStripe();
				const { customerId } = await getOrCreateStripeCustomer({
					tenantDb: tenantDb as never,
					stripe,
					customerProfileId: input.customerProfileId,
					connectAccountId: stripeAccountId,
					organizationId: input.organizationId,
				});

				const setupIntent = await stripe.setupIntents.create(
					{
						customer: customerId,
						usage: "off_session",
						metadata: {
							customerProfileId: input.customerProfileId,
							organizationId: input.organizationId,
						},
					},
					{ stripeAccount: stripeAccountId },
				);

				return {
					clientSecret: setupIntent.client_secret ?? "",
					setupIntentId: setupIntent.id,
					stripeAccountId,
					stripeCustomerId: customerId,
				};
			}),

		listSavedCards: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					customerProfileId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| { select: (...a: unknown[]) => { from: (...a: unknown[]) => any } }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant DB unavailable" });
				}

				const [profile] = await (tenantDb as any)
					.select()
					.from(customerProfiles)
					.where(eq(customerProfiles.id, input.customerProfileId))
					.limit(1);
				if (!profile?.stripeCustomerId) {
					return { cards: [] as Array<{ id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean }> };
				}

				const stripe = resolveStripe();
				const list = await stripe.paymentMethods.list(
					{ customer: profile.stripeCustomerId, type: "card", limit: 20 },
					{ stripeAccount: profile.stripeConnectAccountIdSnapshot ?? undefined },
				);
				const defaultId = profile.defaultPaymentMethodId ?? null;
				return {
					cards: list.data
						.filter((p): p is { id: string; card: NonNullable<typeof p.card> } =>
							p.card != null,
						)
						.map((p) => ({
							id: p.id,
							brand: p.card.brand,
							last4: p.card.last4,
							expMonth: p.card.exp_month,
							expYear: p.card.exp_year,
							isDefault: p.id === defaultId,
						})),
				};
			}),

		chargeSavedCard: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					customerProfileId: z.string().uuid(),
					appointmentId: z.string().uuid().nullable().optional(),
					paymentMethodId: z.string().min(1).nullable().optional(),
					amount: z.number().int().positive(),
					currency: z.string().min(3).max(3).default("MYR"),
					description: z.string().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...a: unknown[]) => { from: (...a: unknown[]) => any };
							update: (...a: unknown[]) => { set: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant DB unavailable" });
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);

				const [profile] = await (tenantDb as any)
					.select()
					.from(customerProfiles)
					.where(eq(customerProfiles.id, input.customerProfileId))
					.limit(1);
				if (!profile?.stripeCustomerId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Customer has no saved card",
					});
				}
				const pmId = input.paymentMethodId ?? profile.defaultPaymentMethodId;
				if (!pmId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "No payment method on file",
					});
				}

				// Phase 4: pick the Connect acct by appointment branch country when
				// possible. Fall back to customer's snapshot (acct that owns the
				// saved card) when there's no appointment. Final fallback: legacy
				// org-level acct. fee% is country-agnostic (tier-only), so legacy
				// is fine to provide it whenever we override only acctId.
				let acct: ResolvedConnectAccount;
				let stripeAccountId: string;
				if (input.appointmentId) {
					const [appt] = await (tenantDb as any)
						.select()
						.from(appointments)
						.where(eq(appointments.id, input.appointmentId))
						.limit(1);
					if (!appt) {
						throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
					}
					const countryCode = await resolveBranchCountryCode(
						appt.branchId,
						tenantDb as never,
					);
					acct = countryCode
						? await getConnectAccountForOrgCountry(
								input.organizationId,
								countryCode,
								controlPanelDb,
							)
						: await getConnectAccountForOrg(input.organizationId, controlPanelDb);
					// Saved card lives on the customer's snapshot acct — if it
					// disagrees with the country resolution, the snapshot wins
					// (the card isn't shared across Connect accts).
					stripeAccountId =
						(profile.stripeConnectAccountIdSnapshot as string | null | undefined) ??
						acct.acctId;
				} else if (profile.stripeConnectAccountIdSnapshot) {
					acct = await getConnectAccountForOrg(input.organizationId, controlPanelDb);
					stripeAccountId = profile.stripeConnectAccountIdSnapshot as string;
				} else {
					acct = await getConnectAccountForOrg(input.organizationId, controlPanelDb);
					stripeAccountId = acct.acctId;
				}

				const applicationFeeAmount = computeApplicationFee(input.amount, acct.appFeeBps);
				const currency = input.currency.toLowerCase();
				const stripe = resolveStripe();
				const pi = await stripe.paymentIntents.create(
					{
						amount: input.amount,
						currency,
						customer: profile.stripeCustomerId,
						payment_method: pmId,
						confirm: true,
						off_session: true,
						application_fee_amount: applicationFeeAmount,
						description: input.description,
						metadata: {
							customerProfileId: input.customerProfileId,
							organizationId: input.organizationId,
							...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
						},
					},
					{
						stripeAccount: stripeAccountId,
						idempotencyKey: input.appointmentId
							? `pi:appt:offsession:${input.appointmentId}`
							: undefined,
					},
				);

				return {
					paymentIntentId: pi.id,
					status: pi.status,
					amount: input.amount,
					currency: currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),

		// === Plan B Phase 3c.1 — POS online checkout (Payment Link for a sale) ===

		createSalesOrderPaymentLink: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					salesOrderId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| {
							select: (...args: unknown[]) => { from: (...a: unknown[]) => any };
							update: (...args: unknown[]) => { set: (...a: unknown[]) => any };
					  }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", {
						message: "Tenant DB unavailable",
					});
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);

				// 1. Sales order.
				const [salesOrder] = await (tenantDb as any)
					.select()
					.from(salesOrders)
					.where(eq(salesOrders.id, input.salesOrderId))
					.limit(1);
				if (!salesOrder) {
					throw new ORPCError("NOT_FOUND", { message: "Sales order not found" });
				}

				// 2. Invoice (via salesOrderId).
				const [invoice] = await (tenantDb as any)
					.select()
					.from(invoices)
					.where(eq(invoices.salesOrderId, input.salesOrderId))
					.limit(1);
				if (!invoice) {
					throw new ORPCError("NOT_FOUND", {
						message: "Invoice not found for sales order",
					});
				}
				if (!invoice.paymentId) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Invoice has no payment_id",
					});
				}

				// 3. Payment row.
				const [payment] = await (tenantDb as any)
					.select()
					.from(payments)
					.where(eq(payments.id, invoice.paymentId))
					.limit(1);
				if (!payment) {
					throw new ORPCError("NOT_FOUND", { message: "Payment not found" });
				}
				if (payment.status === "succeeded") {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Payment already succeeded",
					});
				}

				// 4. Resolve Connect acct via the sale's branch country (Phase 4).
				const countryCode = await resolveBranchCountryCode(
					salesOrder.branchId,
					tenantDb as never,
				);
				const acct = countryCode
					? await getConnectAccountForOrgCountry(
							input.organizationId,
							countryCode,
							controlPanelDb,
						)
					: await getConnectAccountForOrg(input.organizationId, controlPanelDb);

				// 5. Build Stripe Price for the total. v1: single inline price using
				// the sales-order number as product name; line items kept simple.
				const amount = payment.totalAmount as number;
				const currency = String(payment.currency ?? "myr").toLowerCase();
				const applicationFeeAmount = computeApplicationFee(amount, acct.appFeeBps);

				const stripe = resolveStripe();
				const price = await stripe.prices.create(
					{
						unit_amount: amount,
						currency,
						product_data: {
							name: `Sale ${salesOrder.salesOrderNumber ?? salesOrder.id}`,
						},
					},
					{ stripeAccount: acct.acctId },
				);

				const sharedMetadata = {
					type: "sales_order",
					salesOrderId: salesOrder.id,
					paymentId: payment.id,
					organizationId: input.organizationId,
				};
				const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";

				const link = await stripe.paymentLinks.create(
					{
						line_items: [{ price: price.id, quantity: 1 }],
						application_fee_amount: applicationFeeAmount,
						after_completion: {
							type: "redirect",
							redirect: {
								url: `${webAppUrl}/dashboard/sales/${salesOrder.id}?paid=1`,
							},
						},
						metadata: sharedMetadata,
						// Propagate to PaymentIntent so payment_intent.succeeded webhook
						// can resolve the sale (Link/session metadata doesn't auto-flow).
						payment_intent_data: { metadata: sharedMetadata },
					},
					{ stripeAccount: acct.acctId },
				);

				// 6. Persist link + acct snapshot on the payment row.
				await (tenantDb as any)
					.update(payments)
					.set({
						paymentLinkUrl: link.url,
						stripePaymentLinkId: link.id,
						stripeConnectAccountIdSnapshot: acct.acctId,
						updatedAt: new Date(),
					})
					.where(eq(payments.id, payment.id));

				return {
					paymentLinkId: link.id,
					paymentLinkUrl: link.url,
					paymentId: payment.id as string,
					amount,
					currency: currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),

		// === Plan B Phase 3c — Package purchase ===

		purchasePackage: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					serviceId: z.string().uuid(),
					clientId: z.string().min(1).nullable().optional(), // member userId for registered clients
					walkInCustomerId: z.string().uuid().nullable().optional(),
					creditsTotal: z.number().int().positive(),
					totalPrice: z.number().int().positive(), // cents
					currency: z.string().min(3).max(3).default("MYR"),
					validityDays: z.number().int().positive().default(180),
					remark: z.string().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				const tenantDb = (context as { tenantDb?: unknown }).tenantDb as
					| { update: (...a: unknown[]) => { set: (...a: unknown[]) => any } }
					| undefined;
				if (!tenantDb) {
					throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant DB unavailable" });
				}
				if (!input.clientId && !input.walkInCustomerId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Either clientId or walkInCustomerId is required",
					});
				}

				const controlPanelDb = getControlPanelDb(
					context as unknown as Parameters<typeof getControlPanelDb>[0],
				);
				// Phase 4 follow-up: derive branch country from service-prices or
				// from customer's primary branch — currently uses legacy org-level acct.
				const acct = await getConnectAccountForOrg(input.organizationId, controlPanelDb);

				// Create package_instance in pending state.
				const now = new Date();
				const expiresAt = new Date(now.getTime() + input.validityDays * 24 * 60 * 60 * 1000);
				const ownerFields = input.clientId
					? { clientId: input.clientId }
					: { walkInCustomerId: input.walkInCustomerId! };
				const pkg = await createPackageInstance(tenantDb as never, {
					serviceId: input.serviceId,
					...(ownerFields as { clientId: string } | { walkInCustomerId: string }),
					source: "purchased",
					totalPrice: input.totalPrice,
					paymentStatus: "pending",
					creditsTotal: input.creditsTotal,
					startsAt: now,
					expiresAt,
					status: "pending",
					remark: input.remark ?? null,
				});

				const applicationFeeAmount = computeApplicationFee(input.totalPrice, acct.appFeeBps);
				const currency = input.currency.toLowerCase();
				const stripe = resolveStripe();

				// Inline price on the connected acct, link metadata carries packageInstanceId
				// so webhook can flip status on payment_intent.succeeded.
				const price = await stripe.prices.create(
					{
						unit_amount: input.totalPrice,
						currency,
						product_data: {
							name: `Package (${input.creditsTotal} sessions)`,
						},
					},
					{ stripeAccount: acct.acctId },
				);
				const sharedMetadata = {
					type: "package",
					packageInstanceId: pkg.id,
					organizationId: input.organizationId,
				};
				const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
				const link = await stripe.paymentLinks.create(
					{
						line_items: [{ price: price.id, quantity: 1 }],
						application_fee_amount: applicationFeeAmount,
						after_completion: {
							type: "redirect",
							redirect: { url: `${webAppUrl}/dashboard/customers/v2?packagePaid=${pkg.id}` },
						},
						metadata: sharedMetadata,
						payment_intent_data: { metadata: sharedMetadata },
					},
					{ stripeAccount: acct.acctId },
				);

				return {
					packageInstanceId: pkg.id,
					paymentLinkId: link.id,
					paymentLinkUrl: link.url,
					amount: input.totalPrice,
					currency: input.currency.toUpperCase(),
					applicationFeeAmount,
				};
			}),
	};
}

export const paymentsRouter = createPaymentsRouter();
