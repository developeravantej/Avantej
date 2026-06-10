/**
 * Platform Admin — Tenant Health (Plan F.1.5 — Agent H).
 *
 * Read-only access to the composite health-score + risk-flag columns
 * the daily cron writes on tenant_usage_snapshots.
 *
 * Procedures:
 *   - get({ organizationId })             — most-recent snapshot's score/flags
 *   - history({ organizationId, days })   — last N days score series (sparkline)
 *   - listAtRisk({ limit })               — top-N orgs by lowest current score
 *
 * Gated behind requirePlatformAdmin (any role — same pattern as
 * platform-admin-tenants.ts).
 */

import { z } from "zod";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import {
	tenantUsageSnapshots,
	type RiskFlag,
} from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export const platformAdminTenantsHealthRouter = {
	get: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const [row] = await cpDb
				.select({
					snapshotDate: tenantUsageSnapshots.snapshotDate,
					healthScore: tenantUsageSnapshots.healthScore,
					riskFlags: tenantUsageSnapshots.riskFlags,
				})
				.from(tenantUsageSnapshots)
				.where(eq(tenantUsageSnapshots.organizationId, input.organizationId))
				.orderBy(desc(tenantUsageSnapshots.snapshotDate))
				.limit(1);

			if (!row) {
				return {
					snapshotDate: null,
					healthScore: null,
					riskFlags: null as RiskFlag[] | null,
				};
			}
			return {
				snapshotDate: row.snapshotDate,
				healthScore: row.healthScore,
				riskFlags: (row.riskFlags ?? null) as RiskFlag[] | null,
			};
		}),

	history: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				days: z.number().int().min(7).max(90).default(30),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const rows = await cpDb
				.select({
					snapshotDate: tenantUsageSnapshots.snapshotDate,
					healthScore: tenantUsageSnapshots.healthScore,
				})
				.from(tenantUsageSnapshots)
				.where(
					and(
						eq(tenantUsageSnapshots.organizationId, input.organizationId),
						isNotNull(tenantUsageSnapshots.healthScore),
					),
				)
				.orderBy(desc(tenantUsageSnapshots.snapshotDate))
				.limit(input.days);

			return {
				series: rows
					.map((r) => ({
						snapshotDate: r.snapshotDate,
						healthScore: r.healthScore,
					}))
					.reverse(),
			};
		}),

	listAtRisk: adminProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(50).default(10),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);

			// Subquery: most-recent snapshot per org (latest date), restricted
			// to rows that have a non-null health_score (i.e. F.1.5-onward).
			const latest = cpDb
				.select({
					organizationId: tenantUsageSnapshots.organizationId,
					maxDate: sql<string>`MAX(${tenantUsageSnapshots.snapshotDate})`.as(
						"max_date",
					),
				})
				.from(tenantUsageSnapshots)
				.where(isNotNull(tenantUsageSnapshots.healthScore))
				.groupBy(tenantUsageSnapshots.organizationId)
				.as("latest");

			const rows = await cpDb
				.select({
					orgId: organizations.id,
					orgName: organizations.name,
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
				)
				.where(isNotNull(tenantUsageSnapshots.healthScore))
				.orderBy(tenantUsageSnapshots.healthScore)
				.limit(input.limit);

			return {
				orgs: rows.map((r) => {
					const flags = (r.riskFlags ?? []) as RiskFlag[];
					const criticalFlagCount = flags.filter(
						(f) => f.severity === "critical",
					).length;
					return {
						orgId: r.orgId,
						orgName: r.orgName,
						healthScore: r.healthScore,
						criticalFlagCount,
					};
				}),
			};
		}),
};
