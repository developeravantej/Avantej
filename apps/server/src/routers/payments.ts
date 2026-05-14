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
import {
	getConnectAccountForOrg,
	computeApplicationFee,
} from "@/services/connect-account.service";

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
				const acct = await getConnectAccountForOrg(input.organizationId, controlPanelDb);

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
				const acct = await getConnectAccountForOrg(input.organizationId, controlPanelDb);

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
				const link = await stripe.paymentLinks.create(
					{
						line_items: [{ price: price.id, quantity: 1 }],
						application_fee_amount: applicationFeeAmount,
						after_completion: {
							type: "redirect",
							redirect: { url: `${webAppUrl}/appointments/${appt.id}?paid=1` },
						},
						metadata: {
							appointmentId: appt.id,
							organizationId: input.organizationId,
							branchId: appt.branchId,
						},
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
	};
}

export const paymentsRouter = createPaymentsRouter();
