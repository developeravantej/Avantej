import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission, listAudit } from "@avantej-core/services";
import { getControlPanelDb } from "../lib/context-helpers";

export const auditLogsRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				actorUserId: z.string().optional(),
				action: z.union([z.string(), z.array(z.string())]).optional(),
				entityType: z.string().optional(),
				entityId: z.string().optional(),
				branchId: z.string().uuid().optional(),
				from: z.string().optional(),   // ISO datetime string
				to: z.string().optional(),     // ISO datetime string
				limit: z.number().min(1).max(200).default(100),
				offset: z.number().min(0).default(0),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"audit_log",
					"read",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const controlPanelDb = getControlPanelDb(context);

			return listAudit(controlPanelDb, context.tenantDb, {
				actorUserId: input.actorUserId,
				action: input.action,
				entityType: input.entityType,
				entityId: input.entityId,
				branchId: input.branchId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds ?? [],
				limit: input.limit,
				offset: input.offset,
			});
		}),
};
