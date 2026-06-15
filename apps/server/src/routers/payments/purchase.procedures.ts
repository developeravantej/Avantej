import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	assertOrgContextMatch,
	assertTenantContext,
} from "@avantej-core/api/guards";
import {
	getConnectAccountForOrg,
	computeApplicationFee,
} from "@/services/connect-account.service";
import { createPackageInstance } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { type StripeClientLike, getEnvVar } from "./_shared";

export function createPurchaseProcedures(
	resolveStripe: () => StripeClientLike,
) {
	return {
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
				assertOrgContextMatch(context, input);
				assertTenantContext(context);

				if (!input.clientId && !input.walkInCustomerId) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Either clientId or walkInCustomerId is required",
					});
				}

				const controlPanelDb = getControlPanelDb(context);
				// Phase 4 follow-up: derive branch country from service-prices or
				// from customer's primary branch — currently uses legacy org-level acct.
				const acct = await getConnectAccountForOrg(
					input.organizationId,
					controlPanelDb,
				);

				// Create package_instance in pending state.
				const now = new Date();
				const expiresAt = new Date(
					now.getTime() + input.validityDays * 24 * 60 * 60 * 1000,
				);
				const ownerFields = input.clientId
					? { clientId: input.clientId }
					: { walkInCustomerId: input.walkInCustomerId! };

				// Snapshot the customer's name at create time (read-scaling). Best-effort.
				let customerNameSnapshot: string | null = null;
				if (input.clientId) {
					try {
						const nameRow = await controlPanelDb
							.select({ name: cpUsers.name })
							.from(cpUsers)
							.where(eq(cpUsers.id, input.clientId))
							.limit(1);
						customerNameSnapshot = nameRow[0]?.name || null;
					} catch {
						customerNameSnapshot = null;
					}
				}

				const pkg = await createPackageInstance(context.tenantDb, {
					serviceId: input.serviceId,
					...(ownerFields as
						| { clientId: string }
						| { walkInCustomerId: string }),
					customerName: customerNameSnapshot,
					source: "purchased",
					totalPrice: input.totalPrice,
					paymentStatus: "pending",
					creditsTotal: input.creditsTotal,
					startsAt: now,
					expiresAt,
					status: "pending",
					remark: input.remark ?? null,
				});

				const applicationFeeAmount = computeApplicationFee(
					input.totalPrice,
					acct.appFeeBps,
				);
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
							redirect: {
								url: `${webAppUrl}/dashboard/customers/v2?packagePaid=${pkg.id}`,
							},
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
