import { z } from "zod";
import { and, eq, gte, inArray } from "drizzle-orm";
import { adminProcedure } from "@/lib/admin-procedure";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getStripeClient } from "@/lib/stripe";
import { getTierPriceUsdCents, type Tier } from "@avantej-core/types";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import {
	type StripeClientLike,
	readMetaNumber,
	fetchRecentRefunds,
	fetchCrossTenantInvoices,
	fetchActiveCoupons,
} from "./_shared";

export function createOverviewProcedures(stripeOverride?: StripeClientLike) {
	const resolveStripe = (): StripeClientLike =>
		stripeOverride ?? (getStripeClient() as unknown as StripeClientLike);

	return {
		getOverview: adminProcedure
			.input(z.object({}).default({}))
			.handler(async ({ context }) => {
				const cpDb = getControlPanelDb(context);
				const stripe = resolveStripe();
				const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

				const [
					activeTrialingRows,
					refundRowsAll30d,
					recentRefunds,
					invoicesResult,
					couponsResult,
				] = await Promise.all([
					cpDb
						.select({
							tier: subscriptions.tier,
							status: subscriptions.status,
						})
						.from(subscriptions)
						.where(inArray(subscriptions.status, ["active", "trialing"])),
					// For KPI math we need ALL refunds in last 30d (count + total).
					cpDb
						.select({
							id: adminSessionActions.id,
							metadata: adminSessionActions.metadata,
						})
						.from(adminSessionActions)
						.where(
							and(
								eq(adminSessionActions.actionType, "tenant_invoice_refund"),
								gte(adminSessionActions.createdAt, thirtyDaysAgo),
							),
						),
					// For UI list — top 20, joined to org + actor.
					fetchRecentRefunds(cpDb, null, 20),
					fetchCrossTenantInvoices(cpDb, stripe, 20, 5, null),
					fetchActiveCoupons(stripe, 20),
				]);

				let activeSubsCount = 0;
				let mrrCents = 0;
				for (const r of activeTrialingRows) {
					if (r.status === "active") activeSubsCount += 1;
					mrrCents += getTierPriceUsdCents(r.tier as Tier);
				}

				const refundsLast30dCount = refundRowsAll30d.length;
				let refundsLast30dAmountCents = 0;
				for (const row of refundRowsAll30d) {
					const refundAmount = readMetaNumber(row.metadata, "refundAmount");
					refundsLast30dAmountCents +=
						refundAmount > 0
							? refundAmount
							: readMetaNumber(row.metadata, "amountCents");
				}

				return {
					kpis: {
						activeSubsCount,
						mrr: { cents: mrrCents, estimateAvailable: true },
						refundsLast30dCount,
						refundsLast30dAmountCents,
						couponsCount: couponsResult.coupons.length,
					},
					recentInvoices: invoicesResult.invoices,
					recentRefunds,
					activeCoupons: couponsResult.coupons,
					stripeAvailable:
						invoicesResult.stripeAvailable && couponsResult.stripeAvailable,
				};
			}),
	};
}
