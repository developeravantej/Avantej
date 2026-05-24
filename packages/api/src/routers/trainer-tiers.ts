import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {
	listTrainerTiers,
	createTrainerTier,
	updateTrainerTier,
	deactivateTrainerTier,
	reactivateTrainerTier,
	assignTierToMember,
} from "@avantej-core/services/trainer-tier.service";
import { requirePermission } from "@avantej-core/services";

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			includeInactive: z.boolean().optional(),
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

		await requirePermissionOrpc(context.tenantDb, context.member, "trainer_tier_management", "read")

		return listTrainerTiers(context.tenantDb, { includeInactive: input.includeInactive });
	});

const create = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			name: z.string().min(1),
			description: z.string().optional(),
			rank: z.number().int().default(0),
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

const update = protectedProcedure
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

const deactivate = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
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

const reactivate = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
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

const assignToMember = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid(),
			tierId: z.string().uuid().nullable(),
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
