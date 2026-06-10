import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getStripeClient } from "@/lib/stripe";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { superAdminProcedure, adminUserIdFrom } from "./_shared";

export const billingProcedures = {
	issueTenantCredit: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				amountMinor: z.number().int().positive().max(10_000_000),
				currency: z.string().length(3),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			const [org] = await cpDb
				.select({ subscriptionId: organizations.subscriptionId })
				.from(organizations)
				.where(eq(organizations.id, input.organizationId));

			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}
			if (!org.subscriptionId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Tenant has no subscription — cannot issue credit",
				});
			}

			const [sub] = await cpDb
				.select({ stripeCustomerId: subscriptions.stripeCustomerId })
				.from(subscriptions)
				.where(eq(subscriptions.id, org.subscriptionId));

			if (!sub?.stripeCustomerId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Subscription is missing a Stripe customer id",
				});
			}

			// Negative amount = credit to customer balance.
			const tx = await getStripeClient().customers.createBalanceTransaction(
				sub.stripeCustomerId,
				{
					amount: -input.amountMinor,
					currency: input.currency.toLowerCase(),
					description: `Platform-admin credit (${input.reason})`,
				},
			);

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_issue_credit",
				targetOrganizationId: input.organizationId,
				metadata: {
					reason: input.reason,
					amountMinor: input.amountMinor,
					currency: input.currency.toLowerCase(),
					stripeBalanceTxId: tx.id,
				},
			});

			return { ok: true, stripeBalanceTxId: tx.id };
		}),
};
