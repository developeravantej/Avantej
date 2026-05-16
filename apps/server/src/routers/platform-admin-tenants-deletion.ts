/**
 * Platform Admin — Tenant Deletion + Export router (Plan E Phase E.8).
 *
 * Lives in a separate file from `platform-admin-tenants.ts` so the deletion
 * surface can ship without touching the E.1-E.4 router. The two are merged
 * at the server boundary (apps/server/src/index.ts) and on the API type
 * stubs side (packages/api/src/routers/index.ts).
 *
 * Procedures (all super_admin only):
 *   - requestTenantExport({ organizationId }) — runs the export now,
 *       returns base64 + data: URL. TODO: hand off to R2 + email.
 *   - requestTenantDeletion({ organizationId, captureExport? }) — soft-delete,
 *       30-day grace. Optionally captures an export first and stashes the
 *       URL in tenant_deletions.export_url.
 *   - restoreTenantDeletion({ organizationId }) — restore within the window.
 *   - listTenantDeletions({ page?, limit?, onlyOpen? }) — paginated listing
 *       for the admin UI.
 *   - runHardDeleteSweeperNow() — manual trigger for the cron sweeper.
 *
 * `requirePlatformAdmin` is intentionally duplicated from
 * `platform-admin-tenants.ts` (per Plan E.8 brief — don't edit that file).
 */

import { z } from "zod";
import { and, desc, eq, isNull, count } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { tenantDeletions } from "@avantej-core/db/schema/control-panel/tenant-deletions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";

function requirePlatformAdmin(
	allowRoles?: ReadonlyArray<"super_admin" | "support" | "billing">,
) {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await controlPanelDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
			}
			if (
				allowRoles &&
				!allowRoles.includes(
					adminRecord.role as "super_admin" | "support" | "billing",
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Your platform admin role does not permit this action",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const superAdminProcedure = protectedProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

function cpDbFromContext(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id) {
		throw new ORPCError("UNAUTHORIZED", { message: "No admin user in session" });
	}
	return id;
}

function envFromContext(context: unknown): Record<string, unknown> {
	const honoCtx = (context as { honoContext?: { env?: Record<string, unknown> } }).honoContext;
	return honoCtx?.env ?? {};
}

export const platformAdminTenantsDeletionRouter = {
	requestTenantExport: superAdminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const adminUserId = adminUserIdFrom(context);
			const { runTenantExport } = await import(
				"@/services/tenant-export.service"
			);
			const { getTenantDb } = await import("@/lib/db");
			const tenantDb = await getTenantDb(input.organizationId);
			const result = await runTenantExport({
				tenantDb,
				organizationId: input.organizationId,
				requestedByUserId: adminUserId,
			});
			// Don't return the base64 to the client over RPC — it can be enormous.
			// Caller can request a R2-signed URL once that lands.
			return {
				exportedAt: result.exportedAt,
				organizationId: result.organizationId,
				tableCount: result.tableCount,
				totalRows: result.totalRows,
				/** TODO: replace with R2 signed URL. */
				dataUrlPreviewLength: result.dataUrl.length,
			};
		}),

	requestTenantDeletion: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				captureExport: z.boolean().default(false),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const adminUserId = adminUserIdFrom(context);

			let exportUrl: string | null = null;
			if (input.captureExport) {
				const { runTenantExport } = await import(
					"@/services/tenant-export.service"
				);
				const { getTenantDb } = await import("@/lib/db");
				const tenantDb = await getTenantDb(input.organizationId);
				const result = await runTenantExport({
					tenantDb,
					organizationId: input.organizationId,
					requestedByUserId: adminUserId,
				});
				// TODO: upload to R2 and replace with signed URL.
				exportUrl = result.dataUrl;
			}

			const { requestTenantDeletion } = await import(
				"@/services/tenant-deletion.service"
			);
			const row = await requestTenantDeletion({
				controlPanelDb: cpDb,
				organizationId: input.organizationId,
				requestedByUserId: adminUserId,
				exportUrl,
			});

			return {
				ok: true as const,
				tenantDeletionId: row.id,
				hardDeleteAfter: row.hardDeleteAfter,
				exportCaptured: Boolean(exportUrl),
			};
		}),

	restoreTenantDeletion: superAdminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const adminUserId = adminUserIdFrom(context);
			const { restoreTenantDeletion } = await import(
				"@/services/tenant-deletion.service"
			);
			const row = await restoreTenantDeletion({
				controlPanelDb: cpDb,
				organizationId: input.organizationId,
				requestedByUserId: adminUserId,
			});
			return { ok: true as const, tenantDeletionId: row.id };
		}),

	listTenantDeletions: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid().optional(),
				onlyOpen: z.boolean().default(false),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const offset = (input.page - 1) * input.limit;

			const filters = [] as any[];
			if (input.organizationId) {
				filters.push(eq(tenantDeletions.organizationId, input.organizationId));
			}
			if (input.onlyOpen) {
				filters.push(isNull(tenantDeletions.restoredAt));
				filters.push(isNull(tenantDeletions.hardDeletedAt));
			}
			const where = filters.length ? and(...filters) : undefined;

			const [totalRow] = await cpDb
				.select({ c: count() })
				.from(tenantDeletions)
				.where(where);

			const rows = await cpDb
				.select({
					id: tenantDeletions.id,
					organizationId: tenantDeletions.organizationId,
					organizationName: organizations.name,
					organizationSlug: organizations.slug,
					requestedAt: tenantDeletions.requestedAt,
					requestedBy: tenantDeletions.requestedBy,
					hardDeleteAfter: tenantDeletions.hardDeleteAfter,
					restoredAt: tenantDeletions.restoredAt,
					hardDeletedAt: tenantDeletions.hardDeletedAt,
					hasExportUrl: tenantDeletions.exportUrl,
				})
				.from(tenantDeletions)
				.leftJoin(
					organizations,
					eq(organizations.id, tenantDeletions.organizationId),
				)
				.where(where)
				.orderBy(desc(tenantDeletions.requestedAt))
				.limit(input.limit)
				.offset(offset);

			return {
				total: Number(totalRow?.c ?? 0),
				page: input.page,
				limit: input.limit,
				deletions: rows.map((r) => ({
					...r,
					hasExportUrl: r.hasExportUrl !== null,
				})),
			};
		}),

	runHardDeleteSweeperNow: superAdminProcedure.handler(async ({ context }) => {
		const cpDb = cpDbFromContext(context);
		const env = envFromContext(context);
		const { hardDeleteOverdueTenants } = await import(
			"@/services/tenant-deletion.service"
		);
		const neonApiKey = (env as { NEON_API_KEY?: string }).NEON_API_KEY;
		const report = await hardDeleteOverdueTenants({
			controlPanelDb: cpDb,
			neonApiKey,
		});
		return report;
	}),
};
