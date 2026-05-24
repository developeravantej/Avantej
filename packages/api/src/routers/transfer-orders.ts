import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {

	listTransferOrders,
	getTransferOrderById,
	createTransferOrder,
	markInTransit as markTransferInTransit,
	completeTransfer,
	cancelTransfer,
} from "@avantej-core/services";

export const transferOrdersRouter = {
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

			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "read")

			return listTransferOrders(context.tenantDb, {
				status: input.status,
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
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

			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "read")

			const order = await getTransferOrderById(context.tenantDb, input.id);
			if (!order) {
				throw new ORPCError("NOT_FOUND", {
					message: `Transfer order not found: ${input.id}`,
				});
			}
			return order;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				dateIssued: z.string().datetime(),
				fromBranchId: z.string().uuid(),
				toBranchId: z.string().uuid(),
				issuedByMemberId: z.string().uuid(),
				notes: z.string().optional(),
				items: z.array(
					z.object({
						productId: z.string().uuid(),
						quantityTransferred: z.number().int().min(1),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "create")

			return createTransferOrder(context.tenantDb, {
				dateIssued: new Date(input.dateIssued),
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
				issuedByMemberId: input.issuedByMemberId,
				notes: input.notes,
				items: input.items,
			});
		}),

	markInTransit: protectedProcedure
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

			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "update")

			return markTransferInTransit(context.tenantDb, input.id);
		}),

	complete: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				items: z.array(
					z.object({
						itemId: z.string().uuid(),
						quantityReceived: z.number().int().min(0),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "approve")

			return completeTransfer(context.tenantDb, input.id, input.items);
		}),

	cancel: protectedProcedure
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

			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "update")

			return cancelTransfer(context.tenantDb, input.id);
		}),
};
