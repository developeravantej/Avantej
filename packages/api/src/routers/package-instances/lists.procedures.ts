import {
	listMemberships,
	listAssignedToMember,
	listAllPackageInstances,
} from "@avantej-core/services/package-instance.service";
import { listExpiringMemberships } from "@avantej-core/services/memberships.service";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import { sourceSchema, statusSchema } from "./schemas";

export const packageInstancesListsProcedures = {
	/**
	 * List memberships (package_instances) for the retention / membership view.
	 *
	 * Filter values:
	 *   active       — status='active' AND expiresAt > NOW()
	 *   expiring_7d  — status='active' AND expiresAt within 7 days
	 *   expiring_30d — status='active' AND expiresAt within 30 days
	 *   expired      — status='expired' OR expiresAt < NOW()
	 *   frozen       — isLocked = TRUE
	 *   all          — no additional predicate
	 *
	 * Requires: service_management:read permission.
	 * RBAC: results scoped to caller's accessibleNodeIds via members.hierarchyScopeId.
	 */
	listMemberships: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				filter: z
					.enum([
						"active",
						"expiring_7d",
						"expiring_30d",
						"expired",
						"frozen",
						"all",
					])
					.default("active"),
				branchId: z.string().uuid().optional(),
				serviceCategoryId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(200).default(100),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			// Pre-check: if caller supplied a branchId, it must be within their accessible scope
			if (
				input.branchId &&
				!(context.accessibleNodeIds ?? []).includes(input.branchId)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Requested branch is outside your accessible scope",
				});
			}

			const controlPanelDb = getControlPanelDb(context);

			return listMemberships(controlPanelDb, context.tenantDb, {
				filter: input.filter,
				branchId: input.branchId,
				serviceCategoryId: input.serviceCategoryId,
				accessibleNodeIds: context.accessibleNodeIds ?? [],
				limit: input.limit,
				offset: input.offset,
			});
		}),

	/**
	 * List expiring memberships within a given window (7 or 30 days).
	 * Used by dashboard widgets to surface members whose packages are about to expire.
	 * Requires: reports:read permission.
	 */
	listExpiring: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				within: z.union([z.literal(7), z.literal(30)]),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"reports",
				"read",
			);

			const controlPanelDb = getControlPanelDb(context);
			return listExpiringMemberships(context.tenantDb, controlPanelDb, {
				within: input.within,
				accessibleNodeIds: context.accessibleNodeIds ?? [],
			});
		}),

	listAll: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				clientId: z.string().optional(),
				status: statusSchema.optional(),
				source: sourceSchema.optional(),
				limit: z.number().int().min(1).max(200).optional().default(100),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const controlPanelDb = getControlPanelDb(context);
			return listAllPackageInstances(controlPanelDb, context.tenantDb, {
				accessibleNodeIds: context.accessibleNodeIds ?? [],
				clientId: input.clientId,
				status: input.status,
				source: input.source,
				limit: input.limit,
			});
		}),

	/**
	 * List package instances assigned to the calling trainer.
	 *
	 * Accessible to any authenticated member — returns only rows where
	 * assignedTrainerId = context.member.id, so no extra permission is needed.
	 *
	 * Index: package_instances_assigned_trainer_status_idx (assigned_trainer_id, status)
	 * — added in migration 0051_sales_pipeline_fixes.
	 */
	listAssignedToMe: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().min(1).max(100).default(50),
				status: z.enum(["active", "frozen", "all"]).default("active"),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const limit = input.limit;

			// Decode cursor: "createdAt|id" shape (matches encodeCursor).
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;
			// parseCursor returns { changedAt, id } but we reuse the same encoding for createdAt.
			const cursor = parsedCursor
				? { createdAt: parsedCursor.changedAt, id: parsedCursor.id }
				: null;

			const controlPanelDb = getControlPanelDb(context);

			// Fetch limit+1 rows so we can detect whether a next page exists.
			const rows = await listAssignedToMember(
				controlPanelDb,
				context.tenantDb,
				{
					memberId: context.member.id,
					status: input.status,
					cursor,
					limit: limit + 1,
				},
			);

			const hasMore = rows.length > limit;
			const items = hasMore ? rows.slice(0, limit) : rows;
			const lastItem = items.at(-1);
			const nextCursor =
				hasMore && lastItem
					? encodeCursor(lastItem.createdAt, lastItem.id)
					: null;

			return { items, nextCursor };
		}),
};
