/**
 * Platform Admin — Tenant Members router (Plan F.4, Agent Mb).
 *
 * Read-only roster of a tenant's members for the platform-admin drill-in.
 * Cross-DB by necessity:
 *   - members + roles + hierarchy_nodes live in the per-org tenant DB.
 *   - name / email / lastLoginAt live in the control-panel `user` table.
 *
 * We open the tenant DB via `getTenantDb(orgId)` (mirrors
 * platform-admin-tenants-deletion E.8), then stitch CP user fields in JS.
 *
 * Search (ILIKE on user.name + user.email) is also cross-DB: we flip the
 * order — query CP first to collect matching userIds, then constrain the
 * tenant query to `inArray(members.userId, ids)`. Without the flip we'd
 * have to fetch every member and filter in-memory which breaks the 200
 * row cap.
 *
 * Procs (all platform-admin; super_admin / support / billing):
 *   - list({ organizationId, search?, role?, page?, limit? })
 *   - getCounts({ organizationId })
 *
 * No mutations. No audit rows. Tolerant: an org without a provisioned
 * tenant branch (or with decrypt failures) returns an empty roster
 * rather than 500.
 */

import { z } from "zod";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { platformAdminProcedure as adminProcedure } from "@avantej-core/api";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { members as tenantMembers } from "@avantej-core/db/schema/tenant/members";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

/** Tolerant tenant-DB opener — returns null on missing org / decrypt error. */
async function tryOpenTenantDb(organizationId: string) {
	try {
		const { getTenantDb } = await import("@/lib/db");
		return await getTenantDb(organizationId);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn(
			`[platform-admin-tenants-members] tenant DB unavailable org=${organizationId}: ${msg}`,
		);
		return null;
	}
}

export type MemberRosterRow = {
	id: string;
	userId: string;
	name: string | null;
	email: string | null;
	role: string;
	hierarchyScopeId: string;
	hierarchyScopeName: string | null;
	joinedAt: Date | null;
	lastLoginAt: Date | null;
	status: string;
};

export const platformAdminTenantsMembersRouter = {
	list: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().trim().optional(),
				role: z.string().trim().optional(),
				page: z.number().int().min(1).default(1),
				limit: z.number().int().min(1).max(200).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const tenantDb = await tryOpenTenantDb(input.organizationId);
			if (!tenantDb) {
				return {
					rows: [] as MemberRosterRow[],
					total: 0,
					page: input.page,
					limit: input.limit,
				};
			}

			// Pre-filter userIds by CP-side search (cross-DB ILIKE) when given.
			let userIdFilter: string[] | null = null;
			if (input.search && input.search.length > 0) {
				const needle = `%${input.search}%`;
				const matches = await cpDb
					.select({ id: cpUsers.id })
					.from(cpUsers)
					.where(or(ilike(cpUsers.name, needle), ilike(cpUsers.email, needle)))
					.limit(2000);
				userIdFilter = matches.map((m) => m.id);
				if (userIdFilter.length === 0) {
					return {
						rows: [] as MemberRosterRow[],
						total: 0,
						page: input.page,
						limit: input.limit,
					};
				}
			}

			const whereParts = [isNull(tenantMembers.deletedAt)];
			if (input.role) whereParts.push(eq(tenantMembers.role, input.role));
			if (userIdFilter) whereParts.push(inArray(tenantMembers.userId, userIdFilter));
			const whereExpr = whereParts.length === 1 ? whereParts[0] : and(...whereParts);

			let total = 0;
			let memberRows: Array<{
				id: string;
				userId: string;
				role: string;
				hierarchyScopeId: string;
				hierarchyScopeName: string | null;
				joinedAt: Date | null;
				status: string;
			}> = [];

			try {
				const [{ value: totalVal } = { value: 0 }] = await tenantDb
					.select({ value: count() })
					.from(tenantMembers)
					.where(whereExpr);
				total = Number(totalVal ?? 0);

				memberRows = await tenantDb
					.select({
						id: tenantMembers.id,
						userId: tenantMembers.userId,
						role: tenantMembers.role,
						hierarchyScopeId: tenantMembers.hierarchyScopeId,
						hierarchyScopeName: hierarchyNodes.name,
						joinedAt: tenantMembers.joinedAt,
						status: tenantMembers.status,
					})
					.from(tenantMembers)
					.leftJoin(
						hierarchyNodes,
						eq(hierarchyNodes.id, tenantMembers.hierarchyScopeId),
					)
					.where(whereExpr)
					.orderBy(desc(tenantMembers.joinedAt), asc(tenantMembers.id))
					.limit(input.limit)
					.offset((input.page - 1) * input.limit);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(
					`[platform-admin-tenants-members] tenant query failed org=${input.organizationId}: ${msg}`,
				);
				return {
					rows: [] as MemberRosterRow[],
					total: 0,
					page: input.page,
					limit: input.limit,
				};
			}

			// Stitch CP user fields.
			const userIds = Array.from(new Set(memberRows.map((m) => m.userId)));
			let userMap: Record<string, { name: string | null; email: string | null; lastLoginAt: Date | null }> = {};
			if (userIds.length > 0) {
				const cpRows = await cpDb
					.select({
						id: cpUsers.id,
						name: cpUsers.name,
						email: cpUsers.email,
						lastLoginAt: cpUsers.lastLoginAt,
					})
					.from(cpUsers)
					.where(inArray(cpUsers.id, userIds));
				userMap = Object.fromEntries(
					cpRows.map((r) => [
						r.id,
						{ name: r.name ?? null, email: r.email ?? null, lastLoginAt: r.lastLoginAt ?? null },
					]),
				);
			}

			const rows: MemberRosterRow[] = memberRows.map((m) => {
				const cp = userMap[m.userId] ?? { name: null, email: null, lastLoginAt: null };
				return {
					id: m.id,
					userId: m.userId,
					name: cp.name,
					email: cp.email,
					role: m.role,
					hierarchyScopeId: m.hierarchyScopeId,
					hierarchyScopeName: m.hierarchyScopeName ?? null,
					joinedAt: m.joinedAt ?? null,
					lastLoginAt: cp.lastLoginAt ?? null,
					status: m.status,
				};
			});

			return { rows, total, page: input.page, limit: input.limit };
		}),

	getCounts: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input }) => {
			const tenantDb = await tryOpenTenantDb(input.organizationId);
			if (!tenantDb) {
				return { totalMembers: 0, byRole: [] as Array<{ role: string; count: number }> };
			}
			try {
				const [{ value: totalVal } = { value: 0 }] = await tenantDb
					.select({ value: count() })
					.from(tenantMembers)
					.where(isNull(tenantMembers.deletedAt));
				const total = Number(totalVal ?? 0);

				const grouped = await tenantDb
					.select({ role: tenantMembers.role, value: count() })
					.from(tenantMembers)
					.where(isNull(tenantMembers.deletedAt))
					.groupBy(tenantMembers.role)
					.orderBy(desc(count()));

				return {
					totalMembers: total,
					byRole: grouped.map((g) => ({ role: g.role, count: Number(g.value ?? 0) })),
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(
					`[platform-admin-tenants-members] getCounts failed org=${input.organizationId}: ${msg}`,
				);
				return { totalMembers: 0, byRole: [] };
			}
		}),
};
