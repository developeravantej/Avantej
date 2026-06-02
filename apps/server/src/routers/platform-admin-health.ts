/**
 * Platform Admin — Health Scoreboard (Plan F.4 — Agent He).
 *
 * Cross-tenant aggregator that complements the per-tenant
 * `platformAdminTenants.health` router (F.1.5, Agent H) with a global
 * read-only scoreboard:
 *
 *   - 5-band histogram of current health scores (0-19, 20-39, 40-59,
 *     60-79, 80-100 → red, red, amber, amber, green).
 *   - Top-N at-risk tenants (latest snapshot per org, ordered by score
 *     ASC) including snapshot date so ops can spot stale signals.
 *   - Per-flag-code rollup ("X tenants have webhook_failures, Y have
 *     payment_stale", …) counted from each org's latest snapshot's
 *     risk_flags jsonb.
 *   - 30-day trend: daily average score across all scored orgs.
 *
 * Pure DB read against `tenant_usage_snapshots` + `organizations` in the
 * control-panel DB. No audit row (read-only). Gated behind
 * requirePlatformAdmin — any role can read.
 *
 * Mounted as a top-level router (NOT under platformAdminTenants) because
 * the rollups are cross-tenant, not tenant-scoped.
 */

import { z } from "zod";
import { and, asc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import {
	tenantUsageSnapshots,
	type RiskFlag,
} from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";

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

// 5 fixed histogram bands. Boundary rule (uniform): score >= min && score <= max.
// Min/max are strictly monotonically increasing across the array.
export type Band = {
	label: string;
	min: number;
	max: number;
	count: number;
	color: "red" | "amber" | "green";
};

function emptyBands(): Band[] {
	return [
		{ label: "0-19", min: 0, max: 19, count: 0, color: "red" },
		{ label: "20-39", min: 20, max: 39, count: 0, color: "red" },
		{ label: "40-59", min: 40, max: 59, count: 0, color: "amber" },
		{ label: "60-79", min: 60, max: 79, count: 0, color: "amber" },
		{ label: "80-100", min: 80, max: 100, count: 0, color: "green" },
	];
}

/**
 * Bucket a score into one of the 5 bands. Exposed for unit testing the
 * 80/100 boundary edge.
 */
export function bandIndexForScore(score: number): number {
	const s = Math.max(0, Math.min(100, Math.round(score)));
	if (s <= 19) return 0;
	if (s <= 39) return 1;
	if (s <= 59) return 2;
	if (s <= 79) return 3;
	return 4;
}

export const platformAdminHealthRouter = {
	// ─────────────────────────────────────────────────────────────────────
	// getScoreboard — cross-tenant histogram + top at-risk + flag rollup
	//                 + 30-day daily trend.
	// ─────────────────────────────────────────────────────────────────────
	getScoreboard: adminProcedure
		.input(
			z.object({
				topAtRiskLimit: z.number().int().min(1).max(50).default(20),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);

			// Subquery: most-recent snapshot date per org. Includes orgs whose
			// latest score might be NULL (treated as unscored).
			const latest = cpDb
				.select({
					organizationId: tenantUsageSnapshots.organizationId,
					maxDate: sql<string>`MAX(${tenantUsageSnapshots.snapshotDate})`.as(
						"max_date",
					),
				})
				.from(tenantUsageSnapshots)
				.groupBy(tenantUsageSnapshots.organizationId)
				.as("latest");

			const latestRows = await cpDb
				.select({
					orgId: organizations.id,
					orgName: organizations.name,
					snapshotDate: tenantUsageSnapshots.snapshotDate,
					healthScore: tenantUsageSnapshots.healthScore,
					riskFlags: tenantUsageSnapshots.riskFlags,
				})
				.from(tenantUsageSnapshots)
				.innerJoin(
					latest,
					and(
						eq(tenantUsageSnapshots.organizationId, latest.organizationId),
						eq(tenantUsageSnapshots.snapshotDate, latest.maxDate),
					),
				)
				.innerJoin(
					organizations,
					eq(organizations.id, tenantUsageSnapshots.organizationId),
				);

			// Total orgs in the control plane (denominator for unscoredOrgs).
			const [orgCountRow] = await cpDb
				.select({ c: sql<number>`COUNT(*)::int` })
				.from(organizations);
			const totalOrgs = orgCountRow?.c ?? 0;

			// Histogram aggregation (latest snapshot per org with non-null score).
			const bands = emptyBands();
			let totalScoredOrgs = 0;
			for (const row of latestRows) {
				if (typeof row.healthScore === "number") {
					const idx = bandIndexForScore(row.healthScore);
					bands[idx]!.count++;
					totalScoredOrgs++;
				}
			}
			const unscoredOrgs = Math.max(0, totalOrgs - totalScoredOrgs);

			// Top at-risk: lowest score wins, ties broken alphabetically.
			const scored = latestRows.filter(
				(r): r is typeof r & { healthScore: number } =>
					typeof r.healthScore === "number",
			);
			scored.sort((a, b) => {
				if (a.healthScore !== b.healthScore)
					return a.healthScore - b.healthScore;
				return a.orgName.localeCompare(b.orgName);
			});
			const topAtRisk = scored.slice(0, input.topAtRiskLimit).map((r) => {
				const flags = (r.riskFlags ?? []) as RiskFlag[];
				const criticalFlagCount = flags.filter(
					(f) => f.severity === "critical",
				).length;
				return {
					orgId: r.orgId,
					orgName: r.orgName,
					healthScore: r.healthScore,
					criticalFlagCount,
					snapshotDate: toISODate(r.snapshotDate),
				};
			});

			// Flag rollup: count (flagCode → count, uniqueOrgs). uniqueOrgs ===
			// count here because we already take latest snapshot per org and
			// each org-flag pair is counted once.
			const flagAgg = new Map<
				string,
				{ flagCode: string; severity: RiskFlag["severity"]; orgs: Set<string> }
			>();
			for (const row of latestRows) {
				const flags = (row.riskFlags ?? []) as RiskFlag[];
				if (!Array.isArray(flags)) continue;
				const seenInRow = new Set<string>();
				for (const f of flags) {
					if (!f || typeof f.code !== "string") continue;
					// De-dup within a single snapshot (defensive — shouldn't repeat).
					if (seenInRow.has(f.code)) continue;
					seenInRow.add(f.code);
					const existing = flagAgg.get(f.code);
					if (existing) {
						existing.orgs.add(row.orgId);
						// Promote severity to the most severe seen.
						if (sevWeight(f.severity) > sevWeight(existing.severity)) {
							existing.severity = f.severity;
						}
					} else {
						flagAgg.set(f.code, {
							flagCode: f.code,
							severity: f.severity ?? "info",
							orgs: new Set([row.orgId]),
						});
					}
				}
			}
			const flagRollup = Array.from(flagAgg.values())
				.map((v) => ({
					flagCode: v.flagCode,
					severity: v.severity,
					count: v.orgs.size,
					uniqueOrgs: v.orgs.size,
				}))
				.sort((a, b) => {
					if (b.count !== a.count) return b.count - a.count;
					return a.flagCode.localeCompare(b.flagCode);
				});

			// 30-day daily trend: AVG(score) per snapshot_date.
			const since = new Date();
			since.setUTCHours(0, 0, 0, 0);
			since.setUTCDate(since.getUTCDate() - 29); // 30-day window inclusive.
			const trendRows = await cpDb
				.select({
					snapshotDate: tenantUsageSnapshots.snapshotDate,
					avg: sql<string>`AVG(${tenantUsageSnapshots.healthScore})`.as("avg"),
					n: sql<number>`COUNT(${tenantUsageSnapshots.healthScore})::int`.as(
						"n",
					),
				})
				.from(tenantUsageSnapshots)
				.where(
					and(
						isNotNull(tenantUsageSnapshots.healthScore),
						gte(
							tenantUsageSnapshots.snapshotDate,
							since.toISOString().slice(0, 10),
						),
					),
				)
				.groupBy(tenantUsageSnapshots.snapshotDate)
				.orderBy(asc(tenantUsageSnapshots.snapshotDate));

			const avgScoreLast30dByDay = trendRows.map((r) => ({
				date: toISODate(r.snapshotDate),
				avgScore: r.avg === null ? 0 : Math.round(Number(r.avg) * 10) / 10,
				sampleSize: Number(r.n ?? 0),
			}));

			return {
				histogram: {
					bands,
					totalScoredOrgs,
					unscoredOrgs,
				},
				topAtRisk,
				flagRollup,
				trend: {
					avgScoreLast30dByDay,
				},
			};
		}),
};

function toISODate(d: unknown): string {
	if (d instanceof Date) return d.toISOString().slice(0, 10);
	if (typeof d === "string") return d.slice(0, 10);
	return "";
}

function sevWeight(s: RiskFlag["severity"]): number {
	switch (s) {
		case "critical":
			return 3;
		case "warn":
			return 2;
		case "info":
		default:
			return 1;
	}
}
