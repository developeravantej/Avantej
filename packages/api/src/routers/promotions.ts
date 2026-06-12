import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../guards";
import {
	listPromotions,
	validatePromoCode,
	applyPromotion,
	createPromotion,
	updatePromotion,
	deactivatePromotion,
} from "@avantej-core/services/promotions.service";

export const promotionsRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				isActive: z.boolean().optional(),
				type: z.string().optional(),
				branchId: z.string().uuid().optional(),
				limit: z.number().int().optional(),
				offset: z.number().int().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"promotion_management",
				"read",
			);

			return listPromotions(context.tenantDb, {
				isActive: input.isActive,
				type: input.type,
				branchId: input.branchId,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	validate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				code: z.string(),
				customerId: z.string(),
				orderAmount: z.number().int().nonnegative(),
				productIds: z.array(z.string()).optional(),
				serviceIds: z.array(z.string()).optional(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"promotion_management",
				"read",
			);

			try {
				return await validatePromoCode(context.tenantDb, input.code, {
					customerId: input.customerId,
					orderAmount: input.orderAmount,
					productIds: input.productIds,
					serviceIds: input.serviceIds,
					branchId: input.branchId,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Promotion validation failed",
				});
			}
		}),

	apply: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				promotionId: z.string().uuid(),
				customerId: z.string(),
				salesOrderId: z.string().uuid(),
				discountAmount: z.number().int().nonnegative(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"promotion_management",
				"create",
			);

			return applyPromotion(context.tenantDb, input.promotionId, {
				customerId: input.customerId,
				salesOrderId: input.salesOrderId,
				discountAmount: input.discountAmount,
			});
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				code: z.string().min(1),
				name: z.string().min(1),
				description: z.string().optional(),
				type: z.enum([
					"percentage",
					"fixed_amount",
					"free_item",
					"buy_x_get_y",
				]),
				value: z.number().int().positive(),
				minimumOrderAmount: z.number().int().optional(),
				maximumDiscount: z.number().int().optional(),
				usageLimit: z.number().int().optional(),
				perCustomerLimit: z.number().int().optional(),
				validFrom: z.string().datetime(),
				validUntil: z.string().datetime().optional(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (input.branchId) {
				guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
			}
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"promotion_management",
				"create",
			);

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member.id,
				role: context.member.role,
			};

			return createPromotion(
				context.tenantDb,
				{
					code: input.code,
					name: input.name,
					description: input.description,
					type: input.type,
					value: input.value,
					minimumOrderAmount: input.minimumOrderAmount,
					maximumDiscount: input.maximumDiscount,
					usageLimit: input.usageLimit,
					perCustomerLimit: input.perCustomerLimit,
					validFrom: new Date(input.validFrom),
					validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
					branchId: input.branchId,
					createdBy: context.member.userId,
				},
				actor,
			);
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().optional(),
				description: z.string().optional(),
				isActive: z.boolean().optional(),
				validFrom: z.string().datetime().optional(),
				validUntil: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"promotion_management",
				"update",
			);

			return updatePromotion(context.tenantDb, input.id, {
				...(input.name !== undefined && { name: input.name }),
				...(input.description !== undefined && {
					description: input.description,
				}),
				...(input.isActive !== undefined && { isActive: input.isActive }),
				...(input.validFrom !== undefined && {
					validFrom: new Date(input.validFrom),
				}),
				...(input.validUntil !== undefined && {
					validUntil: new Date(input.validUntil),
				}),
			});
		}),

	deactivate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"promotion_management",
				"delete",
			);

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member.id,
				role: context.member.role,
			};

			return deactivatePromotion(context.tenantDb, input.id, actor);
		}),
};
