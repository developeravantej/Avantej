import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listPromotions,
	validatePromoCode,
	applyPromotion,
	createPromotion,
	updatePromotion,
	deactivatePromotion,
} from "@avantej-core/services/promotions.service";
import { requirePermission } from "@avantej-core/services";

export const promotionsRouter = {
	list: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"promotion_management",
					"read",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			return listPromotions(context.tenantDb, {
				isActive: input.isActive,
				type: input.type,
				branchId: input.branchId,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	validate: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"promotion_management",
					"read",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

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

	apply: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"promotion_management",
					"create",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			return applyPromotion(context.tenantDb, input.promotionId, {
				customerId: input.customerId,
				salesOrderId: input.salesOrderId,
				discountAmount: input.discountAmount,
			});
		}),

	create: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"promotion_management",
					"create",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			return createPromotion(context.tenantDb, {
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
			});
		}),

	update: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"promotion_management",
					"update",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

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

	deactivate: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"promotion_management",
					"delete",
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message:
						error instanceof Error ? error.message : "Permission denied",
				});
			}

			return deactivatePromotion(context.tenantDb, input.id);
		}),
};
