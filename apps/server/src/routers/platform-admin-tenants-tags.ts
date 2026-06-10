/**
 * Platform Admin — Tenant Tags + Bulk Ops (Plan F.1).
 *
 * Tags are platform-admin labels per tenant ("enterprise", "trial",
 * "high-risk"). Single table with UNIQUE (organization_id, label).
 *
 * Bulk ops apply tag add/remove or suspend across N orgs in one shot,
 * capped at 100 targets. Bulk procedures are super_admin only; per-org
 * add/remove are allowed for any platform-admin role.
 *
 * Every mutation writes an admin_session_actions audit row (one row per
 * target org for bulk ops), mirroring the Plan E.5 / F.1-N patterns.
 */

import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { requirePlatformAdmin, adminProcedure } from "@/lib/admin-procedure";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { tenantTags } from "@avantej-core/db/schema/control-panel/tenant-tags";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

const BULK_CAP = 100;

const superAdminProcedure = adminProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id)
		throw new ORPCError("UNAUTHORIZED", {
			message: "No admin user in session",
		});
	return id;
}

async function assertOrgExists(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
) {
	const [org] = await cpDb
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.id, organizationId));
	if (!org) throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
}

function assertBulkSize(ids: string[]) {
	if (ids.length === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: "At least one tenant required",
		});
	}
	if (ids.length > BULK_CAP) {
		throw new ORPCError("BAD_REQUEST", {
			message: "Max 100 tenants per bulk op",
		});
	}
}

export const platformAdminTenantsTagsRouter = {
	/**
	 * Distinct labels across all orgs (for the filter strip + autocomplete).
	 * Returns label + first non-null color seen + orgCount.
	 */
	list: adminProcedure
		.input(z.object({ search: z.string().trim().optional() }).default({}))
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const where = input.search
				? sql`label ILIKE ${"%" + input.search + "%"}`
				: sql`1=1`;
			const rows = await cpDb.execute(sql`
				SELECT label,
				       (ARRAY_AGG(color) FILTER (WHERE color IS NOT NULL))[1] AS color,
				       COUNT(DISTINCT organization_id)::int AS org_count
				FROM tenant_tags
				WHERE ${where}
				GROUP BY label
				ORDER BY label ASC
			`);
			const items = (rows as any).rows ?? rows;
			return {
				tags: (
					items as Array<{
						label: string;
						color: string | null;
						org_count: number;
					}>
				).map((r) => ({
					label: r.label,
					color: r.color,
					orgCount: Number(r.org_count),
				})),
			};
		}),

	/**
	 * All tags attached to one org (used in the row chip cluster + drill-in).
	 */
	listForOrg: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			await assertOrgExists(cpDb, input.organizationId);
			const rows = await cpDb
				.select({
					id: tenantTags.id,
					label: tenantTags.label,
					color: tenantTags.color,
					createdAt: tenantTags.createdAt,
				})
				.from(tenantTags)
				.where(eq(tenantTags.organizationId, input.organizationId))
				.orderBy(tenantTags.label);
			return { tags: rows };
		}),

	add: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				label: z.string().trim().min(1).max(50),
				color: z.string().trim().max(32).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);
			await assertOrgExists(cpDb, input.organizationId);

			// Idempotent: ON CONFLICT DO NOTHING then re-select.
			await cpDb
				.insert(tenantTags)
				.values({
					organizationId: input.organizationId,
					label: input.label,
					color: input.color,
					createdByUserId: adminUserId,
				})
				.onConflictDoNothing();

			const [row] = await cpDb
				.select({
					id: tenantTags.id,
					label: tenantTags.label,
					color: tenantTags.color,
				})
				.from(tenantTags)
				.where(
					and(
						eq(tenantTags.organizationId, input.organizationId),
						eq(tenantTags.label, input.label),
					),
				);

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_tag_add",
				targetOrganizationId: input.organizationId,
				metadata: { label: input.label, color: input.color ?? null },
			});

			return { ok: true as const, tag: row ?? null };
		}),

	remove: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				label: z.string().trim().min(1).max(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);
			await assertOrgExists(cpDb, input.organizationId);

			const deleted = await cpDb
				.delete(tenantTags)
				.where(
					and(
						eq(tenantTags.organizationId, input.organizationId),
						eq(tenantTags.label, input.label),
					),
				)
				.returning({ id: tenantTags.id });

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_tag_remove",
				targetOrganizationId: input.organizationId,
				metadata: { label: input.label, removed: deleted.length > 0 },
			});

			return { ok: true as const, removed: deleted.length };
		}),

	bulkAdd: superAdminProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(BULK_CAP),
				label: z.string().trim().min(1).max(50),
				color: z.string().trim().max(32).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);
			assertBulkSize(input.organizationIds);

			// Validate all orgs exist (anything missing => skip but report).
			const existing = await cpDb
				.select({ id: organizations.id })
				.from(organizations)
				.where(inArray(organizations.id, input.organizationIds));
			const existingIds = new Set(existing.map((r) => r.id));

			let inserted = 0;
			const auditRows: Array<typeof adminSessionActions.$inferInsert> = [];
			for (const orgId of input.organizationIds) {
				if (!existingIds.has(orgId)) continue;
				const res = await cpDb
					.insert(tenantTags)
					.values({
						organizationId: orgId,
						label: input.label,
						color: input.color,
						createdByUserId: adminUserId,
					})
					.onConflictDoNothing()
					.returning({ id: tenantTags.id });
				if (res.length > 0) inserted += 1;
				auditRows.push({
					adminUserId,
					actionType: "tenant_tag_bulk_add",
					targetOrganizationId: orgId,
					metadata: {
						label: input.label,
						color: input.color ?? null,
						newlyInserted: res.length > 0,
					},
				});
			}
			if (auditRows.length > 0) {
				await cpDb.insert(adminSessionActions).values(auditRows);
			}

			return {
				ok: true as const,
				attempted: input.organizationIds.length,
				inserted,
				skipped: input.organizationIds.length - auditRows.length,
			};
		}),

	bulkRemove: superAdminProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(BULK_CAP),
				label: z.string().trim().min(1).max(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);
			assertBulkSize(input.organizationIds);

			let removed = 0;
			const auditRows: Array<typeof adminSessionActions.$inferInsert> = [];
			for (const orgId of input.organizationIds) {
				const res = await cpDb
					.delete(tenantTags)
					.where(
						and(
							eq(tenantTags.organizationId, orgId),
							eq(tenantTags.label, input.label),
						),
					)
					.returning({ id: tenantTags.id });
				if (res.length > 0) removed += 1;
				auditRows.push({
					adminUserId,
					actionType: "tenant_tag_bulk_remove",
					targetOrganizationId: orgId,
					metadata: { label: input.label, removed: res.length > 0 },
				});
			}
			await cpDb.insert(adminSessionActions).values(auditRows);

			return {
				ok: true as const,
				attempted: input.organizationIds.length,
				removed,
			};
		}),

	bulkSuspend: superAdminProcedure
		.input(
			z.object({
				organizationIds: z.array(z.string().uuid()).min(1).max(BULK_CAP),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);
			assertBulkSize(input.organizationIds);

			let suspended = 0;
			const failures: Array<{ organizationId: string; error: string }> = [];
			const auditRows: Array<typeof adminSessionActions.$inferInsert> = [];

			for (const orgId of input.organizationIds) {
				try {
					const [updated] = await cpDb
						.update(organizations)
						.set({ paymentStatus: "suspended", updatedAt: new Date() })
						.where(eq(organizations.id, orgId))
						.returning({ id: organizations.id });
					if (!updated) {
						failures.push({ organizationId: orgId, error: "not_found" });
					} else {
						suspended += 1;
					}
					auditRows.push({
						adminUserId,
						actionType: "tenant_bulk_suspend",
						targetOrganizationId: orgId,
						metadata: {
							reason: input.reason,
							batchSize: input.organizationIds.length,
							succeeded: !!updated,
						},
					});
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					failures.push({ organizationId: orgId, error: msg });
					auditRows.push({
						adminUserId,
						actionType: "tenant_bulk_suspend",
						targetOrganizationId: orgId,
						metadata: {
							reason: input.reason,
							batchSize: input.organizationIds.length,
							succeeded: false,
							error: msg,
						},
					});
				}
			}
			if (auditRows.length > 0) {
				await cpDb.insert(adminSessionActions).values(auditRows);
			}

			return {
				ok: true as const,
				attempted: input.organizationIds.length,
				suspended,
				failures,
			};
		}),
};
