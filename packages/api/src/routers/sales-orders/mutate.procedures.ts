/**
 * Sales Orders Router — mutation procedures
 *
 * Writes: create, update, cancel (with refund + reason category).
 */

import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
import {
	createSalesOrder,
	updateSalesOrder,
	cancelSalesOrder,
} from "@avantej-core/services";
import {
	salesOrderStatusEnum,
	cancellationReasonCategoryEnum,
} from "./_shared";

export const salesOrderMutateProcedures = {
	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				date: z.string().datetime(),
				customerId: z.string().optional(),
				customerName: z.string().min(1),
				createdBy: z.string().min(1),
				branchId: z.string().uuid(),
				status: salesOrderStatusEnum.optional(),
				totalAmount: z.number().int(),
				notes: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"create",
			);

			return createSalesOrder(context.tenantDb, {
				date: new Date(input.date),
				customerId: input.customerId,
				customerName: input.customerName,
				createdBy: input.createdBy,
				branchId: input.branchId,
				status: input.status,
				totalAmount: input.totalAmount,
				notes: input.notes,
			});
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				date: z.string().datetime().optional(),
				customerId: z.string().optional(),
				customerName: z.string().optional(),
				status: salesOrderStatusEnum.optional(),
				totalAmount: z.number().int().optional(),
				notes: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"update",
			);

			return updateSalesOrder(context.tenantDb, input.id, {
				date: input.date ? new Date(input.date) : undefined,
				customerId: input.customerId,
				customerName: input.customerName,
				status: input.status,
				totalAmount: input.totalAmount,
				notes: input.notes,
			});
		}),

	cancel: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				cancelledBy: z.string().min(1),
				reason: z.string().optional(),
				refundAmount: z.number().int(),
				cancellationReasonCategory: cancellationReasonCategoryEnum.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"sales",
				"delete",
			);

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member!.id,
				role: context.member!.role,
			};

			return cancelSalesOrder(
				context.tenantDb,
				input.id,
				{
					cancelledBy: input.cancelledBy,
					reason: input.reason,
					refundAmount: input.refundAmount,
					cancellationReasonCategory: input.cancellationReasonCategory,
				},
				actor,
			);
		}),
};
