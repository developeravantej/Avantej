import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";

export const statusProcedures = {
	getPaymentStatus: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				appointmentId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);

			const [appt] = await context.tenantDb
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
