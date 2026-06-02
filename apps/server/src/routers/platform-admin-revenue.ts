/**
 * Platform Admin — Revenue Aggregator (Plan F.2 — Agent V).
 *
 * Read-only rollups over `subscriptions` + `organizations` for the
 * /dashboard/platform-admin/revenue page. Mirrors mission-control's
 * pattern: parallel reads, real-time (no cache), tens-of-ms latency.
 *
 * No new schema. MRR derived from `subscriptions.tier ×
 * TIER_PRICES_USD_CENTS` (placeholder prices until Stripe is wired in).
 * Source of truth for billing remains Stripe.
 *
 * Gated behind requirePlatformAdmin — any role (super_admin, support,
 * billing) can read.
 *
 * Procs:
 *   - getKpis              MRR/ARR/active/trialing/cancelled30d/churn%/netNewMrr30d
 *   - getCohortRetention   signup-month × month-index retention matrix
 *   - getRecentChurn       recent cancelled subs joined to org names
 *
 * Org ↔ subscription link: `organizations.subscription_id → subscriptions.id`
 * (subscriptions has no `organizationId` column).
 */

import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { getTierPriceUsdCents, type Tier } from "@avantej-core/types";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (
		context as { honoContext?: { get: (k: string) => unknown } }
	).honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function isoDate(d: Date): string {
	return d.toISOString();
}

function monthKey(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonthsUtc(d: Date, k: number): Date {
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
}

export const platformAdminRevenueRouter = {
	// ─────────────────────────────────────────────────────────────────────
	// getKpis — top-line KPIs for the /revenue page.
	// ─────────────────────────────────────────────────────────────────────
	getKpis: adminProcedure
		.input(z.object({}).default({}))
		.handler(async ({ context }) => {
			const cpDb = cpDbFrom(context);

			const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

			const [activeTrialingRows, cancelledLast30dRows, newSubsLast30dRows] =
				await Promise.all([
					// All active/trialing subs — tiers feed MRR estimate + counts.
					cpDb
						.select({ tier: subscriptions.tier, status: subscriptions.status })
						.from(subscriptions)
						.where(inArray(subscriptions.status, ["active", "trialing"])),

					// Subs cancelled in last 30 days — tiers feed churned MRR.
					cpDb
						.select({
							tier: subscriptions.tier,
							canceledAt: subscriptions.canceledAt,
						})
						.from(subscriptions)
						.where(
							and(
								isNotNull(subscriptions.canceledAt),
								gte(subscriptions.canceledAt, thirtyDaysAgo),
							),
						),

					// Subs created in last 30 days — tiers feed new MRR.
					cpDb
						.select({
							tier: subscriptions.tier,
							createdAt: subscriptions.createdAt,
						})
						.from(subscriptions)
						.where(gte(subscriptions.createdAt, thirtyDaysAgo)),
				]);

			let activeSubsCount = 0;
			let trialingSubsCount = 0;
			let mrrCents = 0;
			for (const r of activeTrialingRows) {
				if (r.status === "active") activeSubsCount += 1;
				else if (r.status === "trialing") trialingSubsCount += 1;
				mrrCents += getTierPriceUsdCents(r.tier as Tier);
			}

			const cancelledLast30d = cancelledLast30dRows.length;
			const churnedMrrCents = cancelledLast30dRows.reduce(
				(sum, r) => sum + getTierPriceUsdCents(r.tier as Tier),
				0,
			);
			const newMrrCents = newSubsLast30dRows.reduce(
				(sum, r) => sum + getTierPriceUsdCents(r.tier as Tier),
				0,
			);

			const denom = cancelledLast30d + activeSubsCount;
			const churnRatePct =
				denom === 0 ? 0 : Math.round((cancelledLast30d / denom) * 10000) / 100;

			return {
				mrr: { cents: mrrCents, estimateAvailable: true },
				arr: { cents: mrrCents * 12, estimateAvailable: true },
				activeSubsCount,
				trialingSubsCount,
				cancelledLast30d,
				churnRatePct,
				newMrrLast30dCents: newMrrCents,
				churnedMrrLast30dCents: churnedMrrCents,
				netNewMrrLast30dCents: newMrrCents - churnedMrrCents,
			};
		}),

	// ─────────────────────────────────────────────────────────────────────
	// getCohortRetention — signup-month × month-index retention.
	//
	// N+1 loop per cohort month (≤24 round-trips, monthly granularity).
	// Picked over a single SQL with generate_series for correctness +
	// clear semantics around the `retained[0] === cohortSize` invariant.
	// ─────────────────────────────────────────────────────────────────────
	getCohortRetention: adminProcedure
		.input(
			z.object({
				monthsBack: z.number().int().min(3).max(24).default(12),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);

			// Build cohort window: starting from `monthsBack` months ago, first
			// of each month in UTC.
			const now = new Date();
			const currentMonthStart = new Date(
				Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
			);
			const cohortStarts: Date[] = [];
			for (let i = input.monthsBack - 1; i >= 0; i--) {
				cohortStarts.push(addMonthsUtc(currentMonthStart, -i));
			}

			const oldestCohortStart = cohortStarts[0]!;

			// Single read: orgs in the window, joined to their current
			// subscription (if any). Compute cohorts + retention in JS.
			const orgsInWindow = await cpDb
				.select({
					orgId: organizations.id,
					orgCreatedAt: organizations.createdAt,
					subCanceledAt: subscriptions.canceledAt,
				})
				.from(organizations)
				.leftJoin(
					subscriptions,
					eq(subscriptions.id, organizations.subscriptionId),
				)
				.where(gte(organizations.createdAt, oldestCohortStart));

			// Group orgs by cohort month.
			const byMonth = new Map<
				string,
				Array<{ orgCreatedAt: Date; subCanceledAt: Date | null }>
			>();
			for (const row of orgsInWindow) {
				const createdAt =
					row.orgCreatedAt instanceof Date
						? row.orgCreatedAt
						: new Date(row.orgCreatedAt as unknown as string);
				const key = monthKey(createdAt);
				const arr = byMonth.get(key) ?? [];
				arr.push({
					orgCreatedAt: createdAt,
					subCanceledAt: row.subCanceledAt
						? row.subCanceledAt instanceof Date
							? row.subCanceledAt
							: new Date(row.subCanceledAt as unknown as string)
						: null,
				});
				byMonth.set(key, arr);
			}

			const cohorts: Array<{
				cohortMonth: string;
				cohortSize: number;
				retained: number[];
			}> = [];

			for (const cohortStart of cohortStarts) {
				const key = monthKey(cohortStart);
				const orgsInCohort = byMonth.get(key) ?? [];
				const cohortSize = orgsInCohort.length;

				// How many month-buckets fit between this cohort and "now"?
				// retained.length = monthsSinceCohort + 1, so the latest entry
				// is the current partial month.
				const monthsSinceCohort =
					(currentMonthStart.getUTCFullYear() - cohortStart.getUTCFullYear()) *
						12 +
					(currentMonthStart.getUTCMonth() - cohortStart.getUTCMonth());
				const retained: number[] = new Array(monthsSinceCohort + 1).fill(0);

				// Invariant: every org in the cohort is retained at k=0 by
				// definition (they signed up that month).
				retained[0] = cohortSize;

				for (let k = 1; k <= monthsSinceCohort; k++) {
					const bucketStart = addMonthsUtc(cohortStart, k);
					let count = 0;
					for (const o of orgsInCohort) {
						// Active sub (no row, or not cancelled, or cancelled
						// after the bucket start) → retained at month k.
						if (o.subCanceledAt === null || o.subCanceledAt >= bucketStart) {
							count += 1;
						}
					}
					retained[k] = count;
				}

				cohorts.push({ cohortMonth: key, cohortSize, retained });
			}

			return { cohorts };
		}),

	// ─────────────────────────────────────────────────────────────────────
	// getRecentChurn — last N days of cancellations, joined to org names.
	// ─────────────────────────────────────────────────────────────────────
	getRecentChurn: adminProcedure
		.input(
			z.object({
				days: z.number().int().min(7).max(180).default(30),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

			const rows = await cpDb
				.select({
					orgId: organizations.id,
					orgName: organizations.name,
					tier: subscriptions.tier,
					canceledAt: subscriptions.canceledAt,
				})
				.from(subscriptions)
				.innerJoin(
					organizations,
					eq(organizations.subscriptionId, subscriptions.id),
				)
				.where(
					and(
						isNotNull(subscriptions.canceledAt),
						gte(subscriptions.canceledAt, since),
					),
				)
				.orderBy(desc(subscriptions.canceledAt))
				.limit(100);

			return {
				events: rows.map((r) => ({
					orgId: r.orgId,
					orgName: r.orgName,
					tier: r.tier,
					mrrCentsLost: getTierPriceUsdCents(r.tier as Tier),
					canceledAt:
						r.canceledAt instanceof Date
							? isoDate(r.canceledAt)
							: String(r.canceledAt),
				})),
			};
		}),
};
