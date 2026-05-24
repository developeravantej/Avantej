import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
	listTrainerTiers,
	createTrainerTier,
	updateTrainerTier,
	deactivateTrainerTier,
	reactivateTrainerTier,
	assignTierToMember,
} from "@avantej-core/services/trainer-tier.service";
import { requirePermission } from "@avantej-core/services";

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			includeInactive: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "read")

		return listTrainerTiers(context.tenantDb, { includeInactive: input.includeInactive });
	});

const create = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			name: z.string().min(1),
			description: z.string().optional(),
			rank: z.number().int().default(0),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "create")

		try {
			return await createTrainerTier(context.tenantDb, {
				name: input.name,
				description: input.description,
				rank: input.rank,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	});

const update = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			name: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			rank: z.number().int().optional(),
			isActive: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "update")

		try {
			return await updateTrainerTier(context.tenantDb, input.id, {
				name: input.name,
				description: input.description,
				rank: input.rank,
				isActive: input.isActive,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	});

const deactivate = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "delete")

		try {
			return await deactivateTrainerTier(context.tenantDb, input.id);
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	});

const reactivate = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "update")

		try {
			return await reactivateTrainerTier(context.tenantDb, input.id);
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	});

const assignToMember = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid(),
			tierId: z.string().uuid().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "update")

		try {
			return await assignTierToMember(context.tenantDb, input.memberId, input.tierId);
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Unknown error",
			});
		}
	});

export const trainerTiersRouter = { list, create, update, deactivate, reactivate, assignToMember };
