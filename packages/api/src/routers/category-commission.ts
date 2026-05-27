import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import { hasPermission } from "@avantej-core/services/permission.service";
import {
	getCategoryCommissionConfig,
	upsertCategoryCommissionConfig,
	deleteCategoryCommissionConfig,
} from "@avantej-core/services/category-commission.service";

const getByCategory = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			categoryId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "category_commission_management", "read");

		return getCategoryCommissionConfig(context.tenantDb, input.categoryId);
	});

const upsert = tenantProcedure
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
		

		

		assertOrgContextMatch(context, input);
		// Upsert authorizes EITHER `create` OR `update` — a user granted only one of the
		// two actions should still be able to use the upsert endpoint (the operation may
		// resolve to either an insert or an update at runtime). Check `create` first
		// (the common case for first-time category setup) and fall back to `update`.
		const canCreate = await hasPermission(
			context.tenantDb,
			context.member,
			"category_commission_management",
			"create",
		);
		if (!canCreate) {
			// Reuse requirePermissionOrpc so the FORBIDDEN message + mapping path stays
			// consistent with the rest of the codebase. If the user lacks `update` too,
			// this throws the canonical ORPCError("FORBIDDEN").
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"category_commission_management",
				"update",
			);
		}

		const totalBps = input.slots.reduce((sum, s) => sum + s.weightageBasisPoints, 0);
		if (totalBps !== 10000) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Commission slot weightages must sum to 10000 basis points (100%). Got: ${totalBps}.`,
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

const deleteConfig = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			categoryId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "category_commission_management", "delete");

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
