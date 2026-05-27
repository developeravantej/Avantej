import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardInputBranchForContext } from "../guards";
import {

	listTransferOrders,
	getTransferOrderById,
	createTransferOrder,
	markInTransit as markTransferInTransit,
	completeTransfer,
	cancelTransfer,
} from "@avantej-core/services";

export const transferOrdersRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z.string().optional(),
				fromBranchId: z.string().uuid().optional(),
				toBranchId: z.string().uuid().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "read")

			return listTransferOrders(context.tenantDb, {
				status: input.status,
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
			});
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "read")

			const order = await getTransferOrderById(context.tenantDb, input.id);
			if (!order) {
				throw new ORPCError("NOT_FOUND", {
					message: `Transfer order not found: ${input.id}`,
				});
			}
			return order;
		}),

	create: tenantProcedure
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
			}).refine((d) => d.fromBranchId !== d.toBranchId, {
				message: "Transfer source and destination must be different branches",
				path: ["toBranchId"],
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "create")

			// Guard: caller must have access to both source and destination branches
			await guardInputBranchForContext(context, input.fromBranchId);
			await guardInputBranchForContext(context, input.toBranchId);

			return createTransferOrder(context.tenantDb, {
				dateIssued: new Date(input.dateIssued),
				fromBranchId: input.fromBranchId,
				toBranchId: input.toBranchId,
				issuedByMemberId: input.issuedByMemberId,
				notes: input.notes,
				items: input.items,
			});
		}),

	markInTransit: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "update")

			// Guard: caller must have access to at least one of the involved branches
			const orderForTransit = await getTransferOrderById(context.tenantDb, input.id);
			if (!orderForTransit) {
				throw new ORPCError("NOT_FOUND", { message: `Transfer order not found: ${input.id}` });
			}
			const accessibleIds = context.accessibleNodeIds ?? [];
			if (
				!accessibleIds.includes(orderForTransit.fromBranchId) &&
				!accessibleIds.includes(orderForTransit.toBranchId)
			) {
				throw new ORPCError("FORBIDDEN", { message: "You do not have access to either branch of this transfer order." });
			}

			return markTransferInTransit(context.tenantDb, input.id);
		}),

	complete: tenantProcedure
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
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "approve")

			// Guard: caller must have access to at least one of the involved branches
			const orderForComplete = await getTransferOrderById(context.tenantDb, input.id);
			if (!orderForComplete) {
				throw new ORPCError("NOT_FOUND", { message: `Transfer order not found: ${input.id}` });
			}
			const accessibleIdsComplete = context.accessibleNodeIds ?? [];
			if (
				!accessibleIdsComplete.includes(orderForComplete.fromBranchId) &&
				!accessibleIdsComplete.includes(orderForComplete.toBranchId)
			) {
				throw new ORPCError("FORBIDDEN", { message: "You do not have access to either branch of this transfer order." });
			}

			return completeTransfer(context.tenantDb, input.id, input.items);
		}),

	cancel: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(context.tenantDb, context.member, "transfer_orders", "update")

			// Guard: caller must have access to at least one of the involved branches
			const orderForCancel = await getTransferOrderById(context.tenantDb, input.id);
			if (!orderForCancel) {
				throw new ORPCError("NOT_FOUND", { message: `Transfer order not found: ${input.id}` });
			}
			const accessibleIdsCancel = context.accessibleNodeIds ?? [];
			if (
				!accessibleIdsCancel.includes(orderForCancel.fromBranchId) &&
				!accessibleIdsCancel.includes(orderForCancel.toBranchId)
			) {
				throw new ORPCError("FORBIDDEN", { message: "You do not have access to either branch of this transfer order." });
			}

			return cancelTransfer(context.tenantDb, input.id);
		}),
};
