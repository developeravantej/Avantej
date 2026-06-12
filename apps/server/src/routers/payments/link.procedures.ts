import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { services } from "@avantej-core/db/schema/tenant/services";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import {
	getConnectAccountForOrg,
	getConnectAccountForOrgCountry,
	computeApplicationFee,
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import {
	type StripeClientLike,
	resolveGrossAmount,
	getEnvVar,
} from "./_shared";

export function createLinkProcedures(resolveStripe: () => StripeClientLike) {
	return {
		sendPaymentLink: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					appointmentId: z.string().uuid(),
					// Phase 4.5+ idempotency: when false (default), reuse the
					// stored paymentLinkUrl if one exists. When true, generate
					// a new Stripe Payment Link (orphaning the old one — Stripe
					// has no delete API, only deactivate which we don't yet wire).
					regenerate: z.boolean().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const controlPanelDb = getControlPanelDb(context);

				const [appt] = await context.tenantDb
					.select()
					.from(appointments)
					.where(eq(appointments.id, input.appointmentId))
					.limit(1);
				if (!appt) {
					throw new ORPCError("NOT_FOUND", {
						message: "Appointment not found",
					});
				}
				if (appt.paymentStatus === "paid") {
					throw new ORPCError("PRECONDITION_FAILED", {
						message: "Appointment is already paid",
					});
				}

				// Idempotency: reuse existing link unless caller asked to regenerate.
				if (
					!input.regenerate &&
					appt.paymentLinkUrl &&
					appt.stripePaymentLinkId &&
					typeof appt.applicationFeeAmount === "number"
				) {
					return {
						paymentLinkId: String(appt.stripePaymentLinkId),
						paymentLinkUrl: String(appt.paymentLinkUrl),
						amount: resolveGrossAmount(appt),
						currency: String(appt.currency ?? "MYR").toUpperCase(),
						applicationFeeAmount: Number(appt.applicationFeeAmount),
					};
				}

				// Phase 4: resolve Connect account per the branch's country.
				const countryCode = await resolveBranchCountryCode(
					appt.branchId,
					context.tenantDb,
				);
				const acct = countryCode
					? await getConnectAccountForOrgCountry(
							input.organizationId,
							countryCode,
							controlPanelDb,
						)
					: await getConnectAccountForOrg(input.organizationId, controlPanelDb);

				// Fetch service name for the line item.
				let productName = "Appointment payment";
				if (appt.serviceId) {
					const [svc] = await context.tenantDb
						.select({ name: services.name })
						.from(services)
						.where(eq(services.id, appt.serviceId))
						.limit(1);
					if (svc?.name) productName = String(svc.name);
				}

				const amount = resolveGrossAmount(appt);
				const currency = (appt.currency ?? "MYR").toLowerCase();
				const applicationFeeAmount = computeApplicationFee(
					amount,
					acct.appFeeBps,
				);

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

				// Regenerate: deactivate the orphaned old link first — Payment Links
				// are multi-use by default, so a stale-but-payable link lets the
				// appointment be charged twice. Best-effort (no delete API).
				if (
					input.regenerate &&
					appt.stripePaymentLinkId &&
					appt.stripeConnectAccountIdSnapshot
				) {
					try {
						await stripe.paymentLinks.update(
							String(appt.stripePaymentLinkId),
							{ active: false },
							{ stripeAccount: String(appt.stripeConnectAccountIdSnapshot) },
						);
					} catch (err) {
						console.error(
							`[payments] failed to deactivate old link ${appt.stripePaymentLinkId}:`,
							err,
						);
					}
				}

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
							redirect: {
								url: `${webAppUrl}/appointment/view?paid=1&id=${appt.id}`,
							},
						},
						// Single-use: an appointment must be payable exactly once.
						restrictions: { completed_sessions: { limit: 1 } },
						metadata: sharedMetadata,
						// Propagate to PaymentIntent so payment_intent.succeeded webhook
						// (on connect endpoint) can resolve the appointment row. Link/session
						// metadata does NOT auto-flow to PI; this is required.
						payment_intent_data: { metadata: sharedMetadata },
					},
					{ stripeAccount: acct.acctId },
				);

				await context.tenantDb
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

		createSalesOrderPaymentLink: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					salesOrderId: z.string().uuid(),
					regenerate: z.boolean().optional(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const controlPanelDb = getControlPanelDb(context);

				// 1. Sales order.
				const [salesOrder] = await context.tenantDb
					.select()
					.from(salesOrders)
					.where(eq(salesOrders.id, input.salesOrderId))
					.limit(1);
				if (!salesOrder) {
					throw new ORPCError("NOT_FOUND", {
						message: "Sales order not found",
					});
				}

				// 2. Invoice (via salesOrderId).
				const [invoice] = await context.tenantDb
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
				const [payment] = await context.tenantDb
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

				// Idempotency: reuse existing link unless caller asked to regenerate.
				if (
					!input.regenerate &&
					payment.paymentLinkUrl &&
					payment.stripePaymentLinkId
				) {
					return {
						paymentLinkId: String(payment.stripePaymentLinkId),
						paymentLinkUrl: String(payment.paymentLinkUrl),
						paymentId: payment.id as string,
						amount: payment.totalAmount as number,
						currency: String(payment.currency ?? "myr").toUpperCase(),
						applicationFeeAmount: Number(payment.platformFeeAmount ?? 0),
					};
				}

				// 4. Resolve Connect acct via the sale's branch country (Phase 4).
				const countryCode = await resolveBranchCountryCode(
					salesOrder.branchId,
					context.tenantDb,
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
				const applicationFeeAmount = computeApplicationFee(
					amount,
					acct.appFeeBps,
				);

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

				// Regenerate: the old link must stop accepting payments — Payment
				// Links are multi-use by default, and a stale-but-payable link means
				// the same sale can be charged twice. Best-effort (no delete API).
				if (input.regenerate && payment.stripePaymentLinkId) {
					try {
						await stripe.paymentLinks.update(
							String(payment.stripePaymentLinkId),
							{ active: false },
							{ stripeAccount: acct.acctId },
						);
					} catch (err) {
						console.error(
							`[payments] failed to deactivate old link ${payment.stripePaymentLinkId}:`,
							err,
						);
					}
				}

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
						// Single-use: a sale must be payable exactly once. Without this
						// the link stays open after payment and the customer can pay
						// the same order twice.
						restrictions: { completed_sessions: { limit: 1 } },
						metadata: sharedMetadata,
						// Propagate to PaymentIntent so payment_intent.succeeded webhook
						// can resolve the sale (Link/session metadata doesn't auto-flow).
						payment_intent_data: { metadata: sharedMetadata },
					},
					{ stripeAccount: acct.acctId },
				);

				// 6. Persist link + acct snapshot on the payment row.
				await context.tenantDb
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

		// Deactivate the Stripe Payment Link for a sales order (e.g. after the
		// sale was cancelled) so the customer can no longer pay it. Best-effort
		// companion to the webhook's cancelled-order guard. Stripe has no link
		// delete API — `active: false` disables the hosted page.
		deactivateSalesOrderPaymentLink: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					salesOrderId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const [invoice] = await context.tenantDb
					.select()
					.from(invoices)
					.where(eq(invoices.salesOrderId, input.salesOrderId))
					.limit(1);
				if (!invoice?.paymentId) return { deactivated: false };

				const [payment] = await context.tenantDb
					.select()
					.from(payments)
					.where(eq(payments.id, invoice.paymentId))
					.limit(1);
				if (!payment?.stripePaymentLinkId) return { deactivated: false };

				// Account snapshot was stored when the link was created.
				let acctId = payment.stripeConnectAccountIdSnapshot as string | null;
				if (!acctId) {
					const controlPanelDb = getControlPanelDb(context);
					const acct = await getConnectAccountForOrg(
						input.organizationId,
						controlPanelDb,
					);
					acctId = acct.acctId;
				}

				const stripe = resolveStripe();
				await stripe.paymentLinks.update(
					String(payment.stripePaymentLinkId),
					{ active: false },
					{ stripeAccount: acctId },
				);

				// Clear the URL so UI surfaces stop offering a dead link; keep the
				// link id for audit. A later (unlikely) re-link creates a fresh one.
				await context.tenantDb
					.update(payments)
					.set({ paymentLinkUrl: null, updatedAt: new Date() })
					.where(eq(payments.id, payment.id));

				return {
					deactivated: true,
					paymentLinkId: String(payment.stripePaymentLinkId),
				};
			}),
	};
}
