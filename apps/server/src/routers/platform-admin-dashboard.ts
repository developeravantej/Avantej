/**
 * Platform Admin — Mission Control Dashboard (Plan F.1.5 — Agent M).
 *
 * Aggregator for the platform-admin home page. Single proc, parallel
 * reads, real-time (no cache). Targets tens-of-ms latency.
 *
 * Reads:
 *   - organizations counts grouped by payment_status
 *   - subscriptions counts (active + trialing)
 *   - MRR estimate (deferred — no TIER_PRICES constant in code → flag
 *     `mrrEstimateAvailable: false` and return 0)
 *   - recent admin actions (top 10 from admin_session_actions, joined
 *     with users for actor email + organizations for target name)
 *   - at-risk top 5 (mirrors platform-admin-tenants-health.listAtRisk)
 *   - recent signups (top 5 organizations by created_at DESC)
 *
 * Gated behind requirePlatformAdmin — any role (super_admin, support,
 * billing) can read.
 */

import { z } from "zod";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { adminSessions } from "@avantej-core/db/schema/control-panel/admin-sessions";
import { users } from "@avantej-core/db/schema/control-panel/users";
import {
	tenantUsageSnapshots,
	type RiskFlag,
} from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";

function requirePlatformAdmin() {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await cpDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", {
					message: "Admin access required",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());

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

export const platformAdminDashboardRouter = {
	getOverview: adminProcedure
		.input(z.object({}).default({}))
		.handler(async ({ context }) => {
			const cpDb = cpDbFrom(context);

			// All reads issued in parallel.
			const [
				orgsTotalRow,
				orgsByStatus,
				subsByStatus,
				recentActionsRows,
				atRiskRows,
				recentSignupsRows,
			] = await Promise.all([
				cpDb.select({ c: count() }).from(organizations),

				cpDb
					.select({
						paymentStatus: organizations.paymentStatus,
						c: count(),
					})
					.from(organizations)
					.groupBy(organizations.paymentStatus),

				cpDb
					.select({ status: subscriptions.status, c: count() })
					.from(subscriptions)
					.groupBy(subscriptions.status),

				cpDb
					.select({
						actorUserId: sql<string | null>`COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId})`,
						actorEmail: users.email,
						action: adminSessionActions.actionType,
						targetOrgId: adminSessionActions.targetOrganizationId,
						targetOrgName: organizations.name,
						createdAt: adminSessionActions.createdAt,
					})
					.from(adminSessionActions)
					.leftJoin(
						adminSessions,
						eq(adminSessions.id, adminSessionActions.adminSessionId),
					)
					.leftJoin(
						users,
						sql`${users.id} = COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId})`,
					)
					.leftJoin(
						organizations,
						eq(organizations.id, adminSessionActions.targetOrganizationId),
					)
					.orderBy(desc(adminSessionActions.createdAt))
					.limit(10),

				// At-risk top 5 — mirrors platform-admin-tenants-health.listAtRisk.
				(async () => {
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

					return cpDb
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
								eq(
									tenantUsageSnapshots.organizationId,
									latest.organizationId,
								),
								eq(tenantUsageSnapshots.snapshotDate, latest.maxDate),
							),
						)
						.innerJoin(
							organizations,
							eq(organizations.id, tenantUsageSnapshots.organizationId),
						)
						.where(isNotNull(tenantUsageSnapshots.healthScore))
						.orderBy(tenantUsageSnapshots.healthScore)
						.limit(5);
				})(),

				cpDb
					.select({
						orgId: organizations.id,
						orgName: organizations.name,
						createdAt: organizations.createdAt,
					})
					.from(organizations)
					.orderBy(desc(organizations.createdAt))
					.limit(5),
			]);

			const total = Number(orgsTotalRow[0]?.c ?? 0);

			const statusCounts: Record<string, number> = {};
			for (const r of orgsByStatus) {
				statusCounts[r.paymentStatus] = Number(r.c);
			}

			const subsCounts: Record<string, number> = {};
			for (const r of subsByStatus) {
				subsCounts[r.status] = Number(r.c);
			}

			// TODO(plan-f-1-5): when tier pricing lands in code, sum
			// (price × seat-count) across active+trialing subscriptions to
			// produce a live MRR estimate. For now the field is gated off so
			// the UI shows a "—" placeholder rather than an invented number.
			const mrrEstimateAvailable = false;
			const mrrCents = 0;

			return {
				counts: {
					total,
					active: statusCounts.active ?? 0,
					trialing: statusCounts.trialing ?? 0,
					pastDue: statusCounts.past_due ?? 0,
					unpaid: statusCounts.unpaid ?? 0,
					cancelled: statusCounts.cancelled ?? 0,
				},
				subs: {
					activeCount: subsCounts.active ?? 0,
					trialingCount: subsCounts.trialing ?? 0,
				},
				mrr: {
					cents: mrrCents,
					estimateAvailable: mrrEstimateAvailable,
				},
				recentActions: recentActionsRows.map((r) => ({
					actorUserId: r.actorUserId ?? "",
					actorEmail: r.actorEmail ?? undefined,
					action: r.action,
					targetOrgId: r.targetOrgId ?? undefined,
					targetOrgName: r.targetOrgName ?? undefined,
					createdAt:
						r.createdAt instanceof Date
							? r.createdAt.toISOString()
							: String(r.createdAt),
				})),
				atRisk: atRiskRows.map((r) => {
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
				recentSignups: recentSignupsRows.map((r) => ({
					orgId: r.orgId,
					orgName: r.orgName,
					createdAt:
						r.createdAt instanceof Date
							? r.createdAt.toISOString()
							: String(r.createdAt),
				})),
			};
		}),
};
