import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import { installments } from "@avantej-core/db/schema/tenant/installments";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { services } from "@avantej-core/db/schema/tenant/services";
import {
	getConnectAccountForOrg,
	getConnectAccountForOrgCountry,
	computeApplicationFee,
} from "@/services/connect-account.service";
import { resolveBranchCountryCode } from "@/services/branch-country.service";
import type { StripeClientLike } from "./_shared";
import { getEnvVar } from "./_shared";

export function createInstallmentLinkProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
		createInstallmentPaymentLink: protectedProcedure
			.input(
				z.object({
					organizationId: z.string().uuid(),
					installmentId: z.string().uuid(),
				}),
			)
			.handler(async ({ context, input }) => {
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				const controlPanelDb = getControlPanelDb(context);

				// 1. Load the installment row.
				const [installment] = await context.tenantDb
					.select()
					.from(installments)
					.where(eq(installments.id, input.installmentId))
					.limit(1);
				if (!installment) {
					throw new ORPCError("NOT_FOUND", {
						message: "Installment not found",
					});
				}

				// 2. Guard: only pending or overdue installments can be linked.
				if (
					installment.status === "paid" ||
					installment.status === "cancelled" ||
					installment.status === "waived"
				) {
					throw new ORPCError("CONFLICT", {
						message: `Installment is already ${installment.status}`,
					});
				}

				const remainingDue =
					installment.amount +
					(installment.taxAmount ?? 0) -
					(installment.amountPaid ?? 0);
				if (remainingDue <= 0) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Installment has no remaining balance to collect",
					});
				}

				// 3. Load package instance for context (service name, sales order link).
				const [pkg] = await context.tenantDb
					.select()
					.from(packageInstances)
					.where(eq(packageInstances.id, installment.packageInstanceId))
					.limit(1);
				if (!pkg) {
					throw new ORPCError("NOT_FOUND", {
						message: "Package instance not found",
					});
				}

				// 4. Resolve service name for the line item label.
				let serviceName = "Package";
				if (pkg.serviceId) {
					const [svc] = await context.tenantDb
						.select({ name: services.name })
						.from(services)
						.where(eq(services.id, pkg.serviceId))
						.limit(1);
					if (svc?.name) serviceName = String(svc.name);
				}

				// 5. Resolve sales order for redirect URL + package instance count context.
				const salesOrderId =
					installment.salesOrderId ?? pkg.salesOrderId ?? null;
				const [salesOrder] = salesOrderId
					? await context.tenantDb
							.select({ id: salesOrders.id, branchId: salesOrders.branchId })
							.from(salesOrders)
							.where(eq(salesOrders.id, salesOrderId))
							.limit(1)
					: [null];

				// 6. SP-01: Resolve Connect account (requires charges_enabled).
				const branchId = salesOrder?.branchId ?? null;
				const countryCode = branchId
					? await resolveBranchCountryCode(branchId, context.tenantDb)
					: null;
				const acct = countryCode
					? await getConnectAccountForOrgCountry(
							input.organizationId,
							countryCode,
							controlPanelDb,
						)
					: await getConnectAccountForOrg(
							input.organizationId,
							controlPanelDb,
						);

				if (!acct.chargesEnabled) {
					throw new ORPCError("PRECONDITION_FAILED", {
						message:
							"Stripe Connect account is not yet charges-enabled for this organisation",
					});
				}

				const stripe = resolveStripe();

				// 7. Deactivate any existing payment link for this installment to
				// prevent double-payment from a stale link. Best-effort.
				if (installment.stripePaymentLinkId) {
					try {
						await stripe.paymentLinks.update(
							String(installment.stripePaymentLinkId),
							{ active: false },
							{ stripeAccount: acct.acctId },
						);
					} catch (err) {
						console.error(
							`[payments] failed to deactivate old installment link ${installment.stripePaymentLinkId}:`,
							err,
						);
					}
				}

				// 8. Build Stripe Price inline on the connected account.
				const currency = "myr"; // Malaysia — same convention as createSalesOrderPaymentLink
				const applicationFeeAmount = computeApplicationFee(
					remainingDue,
					acct.appFeeBps,
				);
				const lineItemName = `Installment #${installment.installmentNumber} of ${pkg.installmentsTotal} — ${serviceName}`;

				const price = await stripe.prices.create(
					{
						unit_amount: remainingDue,
						currency,
						product_data: { name: lineItemName },
					},
					{ stripeAccount: acct.acctId },
				);

				// 9. Shared metadata propagated to both the link AND the PI so the
				// payment_intent.succeeded webhook can resolve the installment row.
				const sharedMetadata = {
					type: "installment",
					installmentId: installment.id,
					packageInstanceId: installment.packageInstanceId,
					salesOrderId: salesOrderId ?? "",
					organizationId: input.organizationId,
				};

				const webAppUrl = getEnvVar("WEB_APP_URL") ?? "http://localhost:3001";
				const redirectUrl = salesOrderId
					? `${webAppUrl}/dashboard/sales/${salesOrderId}?installmentPaid=1`
					: `${webAppUrl}/dashboard/packages/view`;

				const link = await stripe.paymentLinks.create(
					{
						line_items: [{ price: price.id, quantity: 1 }],
						application_fee_amount: applicationFeeAmount,
						after_completion: {
							type: "redirect",
							redirect: { url: redirectUrl },
						},
						// Single-use: an installment must be paid exactly once per link.
						restrictions: { completed_sessions: { limit: 1 } },
						metadata: sharedMetadata,
						// Propagate to PaymentIntent — link/session metadata does NOT
						// auto-flow to PI; this explicit copy is required for the webhook.
						payment_intent_data: { metadata: sharedMetadata },
					},
					{ stripeAccount: acct.acctId },
				);

				// 10. Persist the new link id on the installment row.
				await context.tenantDb
					.update(installments)
					.set({
						stripePaymentLinkId: link.id,
						updatedAt: new Date(),
					})
					.where(eq(installments.id, installment.id));

				return {
					url: link.url,
					paymentLinkId: link.id,
				};
			}),
	};
}
