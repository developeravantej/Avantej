import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {

	listStockRequests,
	getStockRequestById,
	createStockRequest,
	approveStockRequest,
	fulfillStockRequest,
	rejectStockRequest,
} from "@avantej-core/services";

export const stockRequestsRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z.string().optional(),
				fromBranchId: z.string().uuid().optional(),
				toBranchId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "read")

			return listStockRequests(context.tenantDb, {
				status: input.status,
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
				accessibleNodeIds: context.accessibleNodeIds,
			});
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "read")

			const request = await getStockRequestById(context.tenantDb, input.id);
			if (!request) {
				throw new ORPCError("NOT_FOUND", {
					message: `Stock request not found: ${input.id}`,
				});
			}
			return request;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				dateIssued: z.string().datetime(),
				issuedByMemberId: z.string().uuid(),
				fromBranchId: z.string().uuid().optional(),
				toBranchId: z.string().uuid(),
				destinationLabel: z.string().optional(),
				notes: z.string().optional(),
				items: z.array(
					z.object({
						productId: z.string().uuid(),
						quantityRequested: z.number().int().min(1),
						notes: z.string().optional(),
					})
				),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "create")

			return createStockRequest(context.tenantDb, {
				dateIssued: new Date(input.dateIssued),
				issuedByMemberId: input.issuedByMemberId,
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
				destinationLabel: input.destinationLabel,
				notes: input.notes,
				items: input.items,
			});
		}),

	approve: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "approve")

			return approveStockRequest(context.tenantDb, input.id);
		}),

	reject: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "reject")

			return rejectStockRequest(context.tenantDb, input.id);
		}),

	fulfill: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				items: z.array(
					z.object({
						itemId: z.string().uuid(),
						quantityFulfilled: z.number().int().min(0),
					})
				),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "stock_requests", "update")

			return fulfillStockRequest(context.tenantDb, input.id, input.items);
		}),
};
