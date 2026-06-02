/**
 * Platform Admin — Renewals Calendar (Plan F.4 — Agent Re).
 *
 * Read-only view of upcoming subscription renewals across all tenants in a
 * configurable forward window (default 90 days). Helps ops anticipate which
 * tenants need outreach before they auto-renew (or fail to).
 *
 * Pure DB read against `subscriptions` + `organizations` in the control-panel
 * DB — no Stripe API call, no audit row (read-only). MRR derived from
 * `subscriptions.tier × TIER_PRICES_USD_CENTS` (placeholder prices).
 *
 * Gated behind requirePlatformAdmin — any role can read (read-only).
 *
 * Procs:
 *   - getCalendar  weekly buckets in [now, now + daysAhead] + past-due list
 *                  + summary totals.
 *
 * Bucket boundary: ISO weeks, Monday 00:00 UTC start.
 */

import { z } from "zod";
import { and, asc, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getTierPriceUsdCents, type Tier } from "@avantej-core/types";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformAdminProcedure as adminProcedure } from "@avantej-core/api";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

function cpDbFrom(
	context: unknown,
): NeonDatabase<typeof controlPanelSchema> {
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

/**
 * Compute the start of the ISO week (Monday 00:00 UTC) for a given date.
 * Exposed for unit testing.
 */
export function getISOWeekStart(date: Date): Date {
	const d = new Date(date.getTime());
	const dow = d.getUTCDay(); // 0=Sun … 6=Sat
	// Monday-based: Sunday → -6, Mon → 0, Tue → -1, …
	const diff = dow === 0 ? -6 : 1 - dow;
	const monday = new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff),
	);
	return monday;
}

function addDaysUtc(d: Date, k: number): Date {
	return new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + k),
	);
}

function toIso(d: Date | null): string {
	if (!d) return new Date(0).toISOString();
	return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function daysBetween(from: Date, to: Date): number {
	const ms = to.getTime() - from.getTime();
	return Math.round(ms / (24 * 60 * 60 * 1000));
}

const PAST_DUE_STATUSES = ["past_due", "unpaid"] as const;
const RENEWAL_STATUSES = ["active", "trialing", "past_due", "unpaid"] as const;

export const platformAdminRenewalsRouter = {
	// ─────────────────────────────────────────────────────────────────────
	// getCalendar — weekly buckets of upcoming renewals + past-due list.
	// ─────────────────────────────────────────────────────────────────────
	getCalendar: adminProcedure
		.input(
			z.object({
				daysAhead: z.number().int().min(7).max(180).default(90),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);

			const now = new Date();
			const windowEnd = addDaysUtc(now, input.daysAhead);

			// Upcoming renewals: subs with currentPeriodEnd inside the window,
			// excluding fully-cancelled subs (we still want past_due/unpaid in
			// case they recover — but those also appear in the pastDue list).
			const upcomingRows = await cpDb
				.select({
					orgId: organizations.id,
					orgName: organizations.name,
					tier: subscriptions.tier,
					status: subscriptions.status,
					currentPeriodEnd: subscriptions.currentPeriodEnd,
					cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
				})
				.from(subscriptions)
				.innerJoin(
					organizations,
					eq(organizations.subscriptionId, subscriptions.id),
				)
				.where(
					and(
						isNotNull(subscriptions.currentPeriodEnd),
						gte(subscriptions.currentPeriodEnd, now),
						lte(subscriptions.currentPeriodEnd, windowEnd),
						inArray(
							subscriptions.status,
							RENEWAL_STATUSES as unknown as string[],
						),
					),
				)
				.orderBy(asc(subscriptions.currentPeriodEnd));

			// Past-due / unpaid subs — surfaced regardless of period-end (they
			// need attention now). Ordered oldest first.
			const pastDueRows = await cpDb
				.select({
					orgId: organizations.id,
					orgName: organizations.name,
					tier: subscriptions.tier,
					status: subscriptions.status,
					currentPeriodEnd: subscriptions.currentPeriodEnd,
				})
				.from(subscriptions)
				.innerJoin(
					organizations,
					eq(organizations.subscriptionId, subscriptions.id),
				)
				.where(
					inArray(
						subscriptions.status,
						PAST_DUE_STATUSES as unknown as string[],
					),
				)
				.orderBy(asc(subscriptions.currentPeriodEnd));

			// Bucket by ISO week (Monday-start, UTC). Pre-seed every week in
			// the window so the UI gets a contiguous list (empty weeks render
			// "No renewals this week" rather than disappear).
			const weeksMap = new Map<
				string,
				{
					weekStartISO: string;
					weekEndISO: string;
					renewals: Array<{
						orgId: string;
						orgName: string;
						tier: string;
						mrrCents: number;
						currentPeriodEnd: string;
						status: string;
						cancelAtPeriodEnd: boolean;
						daysUntil: number;
					}>;
					totalMrrAtRiskCents: number;
					totalMrrPassingCents: number;
				}
			>();

			const firstWeekStart = getISOWeekStart(now);
			for (
				let weekStart = firstWeekStart;
				weekStart.getTime() <= windowEnd.getTime();
				weekStart = addDaysUtc(weekStart, 7)
			) {
				const weekEnd = addDaysUtc(weekStart, 7);
				weeksMap.set(weekStart.toISOString(), {
					weekStartISO: weekStart.toISOString(),
					weekEndISO: weekEnd.toISOString(),
					renewals: [],
					totalMrrAtRiskCents: 0,
					totalMrrPassingCents: 0,
				});
			}

			for (const row of upcomingRows) {
				const periodEnd =
					row.currentPeriodEnd instanceof Date
						? row.currentPeriodEnd
						: new Date(row.currentPeriodEnd as unknown as string);
				const weekStart = getISOWeekStart(periodEnd);
				const key = weekStart.toISOString();
				const bucket = weeksMap.get(key);
				if (!bucket) continue; // Outside seeded window — defensive.

				const mrrCents = getTierPriceUsdCents(row.tier as Tier);
				const cancelAtPeriodEnd = row.cancelAtPeriodEnd === true;
				bucket.renewals.push({
					orgId: row.orgId,
					orgName: row.orgName,
					tier: row.tier,
					mrrCents,
					currentPeriodEnd: toIso(periodEnd),
					status: row.status,
					cancelAtPeriodEnd,
					daysUntil: daysBetween(now, periodEnd),
				});
				if (cancelAtPeriodEnd) bucket.totalMrrAtRiskCents += mrrCents;
				else bucket.totalMrrPassingCents += mrrCents;
			}

			const weeks = Array.from(weeksMap.values()).sort((a, b) =>
				a.weekStartISO.localeCompare(b.weekStartISO),
			);

			const pastDue = pastDueRows.map((r) => ({
				orgId: r.orgId,
				orgName: r.orgName,
				tier: r.tier,
				mrrCents: getTierPriceUsdCents(r.tier as Tier),
				currentPeriodEnd: toIso(
					r.currentPeriodEnd instanceof Date
						? r.currentPeriodEnd
						: r.currentPeriodEnd
							? new Date(r.currentPeriodEnd as unknown as string)
							: null,
				),
				status: r.status,
			}));

			const totalRenewalsInWindow = upcomingRows.length;
			const totalMrrAtRiskCents = weeks.reduce(
				(sum, w) => sum + w.totalMrrAtRiskCents,
				0,
			);
			const totalMrrPassingCents = weeks.reduce(
				(sum, w) => sum + w.totalMrrPassingCents,
				0,
			);

			return {
				weeks,
				pastDue,
				summary: {
					totalRenewalsInWindow,
					totalMrrAtRiskCents,
					totalMrrPassingCents,
					pastDueCount: pastDue.length,
				},
			};
		}),
};
