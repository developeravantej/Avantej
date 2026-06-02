import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { type StripeClientLike } from "./_shared";

export function createRefundProcedures(resolveStripe: () => StripeClientLike) {
	return {
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
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

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
	};
}
