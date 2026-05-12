import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	getCategoryCommissionConfig,
	upsertCategoryCommissionConfig,
	deleteCategoryCommissionConfig,
} from "@avantej-core/services/category-commission.service";
import { requirePermission } from "@avantej-core/services";

const getByCategory = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			categoryId: z.string().uuid(),
		}),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"category_commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getCategoryCommissionConfig(context.tenantDb, input.categoryId);
	});

const upsert = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			categoryId: z.string().uuid(),
			paymentType: z.enum(["fixed", "variable"]),
			isConditional: z.boolean(),
			maxCoaches: z.number().int().min(1).max(10),
			slots: z.array(
				z.object({
					slotIndex: z.number().int(),
					label: z.string(),
					weightageBasisPoints: z.number().int().min(0).max(10000),
				}),
			),
			rates: z
				.array(
					z.object({
						trainerTierId: z.string().uuid(),
						amount: z.number().int().min(0),
					}),
				)
				.optional(),
			conditions: z
				.array(
					z.object({
						conditionIndex: z.number().int(),
						operator: z.enum(["lt", "lte", "gt", "gte", "eq", "between"]),
						threshold: z.number().int(),
						thresholdMax: z.number().int().optional(),
						label: z.string().optional(),
						rates: z.array(
							z.object({
								trainerTierId: z.string().uuid(),
								amount: z.number().int().min(0),
							}),
						),
					}),
				)
				.optional(),
		}),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"category_commission_management",
				"create",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		try {
			return await upsertCategoryCommissionConfig(
				context.tenantDb,
				{
					categoryId: input.categoryId,
					paymentType: input.paymentType,
					isConditional: input.isConditional,
					maxCoaches: input.maxCoaches,
					slots: input.slots,
					rates: input.rates,
					conditions: input.conditions,
				},
				context.member,
			);
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message: error instanceof Error ? error.message : "Failed to upsert commission config",
			});
		}
	});

const deleteConfig = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			categoryId: z.string().uuid(),
		}),
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

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"category_commission_management",
				"delete",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		try {
			return await deleteCategoryCommissionConfig(context.tenantDb, input.categoryId);
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message: error instanceof Error ? error.message : "Failed to delete commission config",
			});
		}
	});

export const categoryCommissionRouter = {
	getByCategory,
	upsert,
	delete: deleteConfig,
};
