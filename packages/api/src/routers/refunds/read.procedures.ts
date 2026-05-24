/**
 * Refunds Router
 *
 * API endpoints for the unified refund ledger with four-step lifecycle:
 *   request → approve | reject → process
 *
 * All write endpoints require the calling member to have the corresponding
 * refund_management permission. Admins (role.priority >= 100) always pass.
 */

import {
	approveRefund,
	bulkApproveRefunds,
	createPartialRefund,
	getRefundById,
	listRefunds,
	processRefund,
	rejectRefund,
	requestRefund,
} from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

export const refundsReadProcedures = {
	/**
	 * List refunds with optional filters and RBAC scoping by branchId.
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z
					.enum([
						"pending",
						"approved",
						"rejected",
						"processed",
						"cancelled",
						"all",
					])
					.optional(),
				salesOrderId: z.string().uuid().optional(),
				customerId: z.string().optional(),
				branchId: z.string().uuid().optional(),
				from: z
					.string()
					.regex(
						/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
						"Expected ISO datetime",
					)
					.optional(),
				to: z
					.string()
					.regex(
						/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
						"Expected ISO datetime",
					)
					.optional(),
				limit: z.number().int().min(1).max(200).default(100),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(async ({ context, input }) => {
			
			

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
			await requirePermissionOrpc(context.tenantDb, context.member, "refund_management", "read");

			const controlPanelDb = getControlPanelDb(context);
			const accessibleNodeIds = context.accessibleNodeIds ?? [];

			return listRefunds(context.tenantDb, controlPanelDb, {
				status: input.status,
				salesOrderId: input.salesOrderId,
				customerId: input.customerId,
				branchId: input.branchId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	/**
	 * Get a single refund by ID.
	 */
	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			
			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "refund_management", "read");

			const refund = await getRefundById(context.tenantDb, input.id);
			if (!refund) {
				throw new ORPCError("NOT_FOUND", {
					message: `Refund ${input.id} not found`,
				});
			}
			return refund;
		})
};
