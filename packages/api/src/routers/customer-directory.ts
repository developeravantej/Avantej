/**
 * Customer Directory Router
 *
 * API endpoints for listing and viewing registered customers (members with role='client').
 * Requires customer_management:read permission.
 */

import { requirePermission } from "@avantej-core/services";
import {
	getCustomerDetail,
	listCustomerDirectory,
} from "@avantej-core/services/customer-directory.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { getControlPanelDb } from "../lib/context-helpers";

export const customerDirectoryRouter = {
	/**
	 * List registered customers with aggregated metrics.
	 *
	 * RBAC: returns only customers whose hierarchyScopeId is within the caller's
	 * accessibleNodeIds. Admin (priority>=100) sees all via requirePermission bypass.
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				search: z.string().optional(),
				branchId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"read",
			);

			const controlPanelDb = getControlPanelDb(context);
			const accessibleNodeIds = context.accessibleNodeIds ?? [];

			return listCustomerDirectory(
				controlPanelDb,
				context.tenantDb,
				input.organizationId,
				{
					search: input.search,
					branchId: input.branchId,
					accessibleNodeIds,
					limit: input.limit,
					offset: input.offset,
				},
			);
		}),

	/**
	 * Get full detail for a single customer (for the drawer).
	 *
	 * Defense-in-depth: verifies the returned member's hierarchyScopeId is within
	 * the caller's accessibleNodeIds even after requirePermission passes.
	 */
	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"customer_management",
				"read",
			);

			const controlPanelDb = getControlPanelDb(context);

			const detail = await getCustomerDetail(
				controlPanelDb,
				context.tenantDb,
				input.organizationId,
				input.memberId,
			);

			if (!detail) {
				throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
			}

			// Row-level RBAC: confirm the customer's branch is within caller's scope
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(detail.member.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Customer is outside your accessible scope",
				});
			}

			return detail;
		}),
};
