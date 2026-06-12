import { z } from "zod";
import { eq } from "drizzle-orm";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { invoices } from "@avantej-core/db/schema/tenant/invoices";
import { payments } from "@avantej-core/db/schema/tenant/payments";
import { getConnectAccountForOrg } from "@/services/connect-account.service";
import type { StripeClientLike } from "./_shared";

export function createLinkDeactivateProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
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
