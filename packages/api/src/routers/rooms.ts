import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {
 listRooms, getRoomById, createRoom, updateRoom, deleteRoom } from "@avantej-core/services";

const roomTypeEnum = z.enum(["consultation", "group_session", "private", "training", "individual"]);

export const roomsRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				isActive: z.boolean().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read")

			return listRooms(context.tenantDb, {
				branchId: input.branchId,
				isActive: input.isActive,
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

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read")

			const room = await getRoomById(context.tenantDb, input.id);
			if (!room) {
				throw new ORPCError("NOT_FOUND", {
					message: `Room not found: ${input.id}`,
				});
			}
			return room;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				type: roomTypeEnum,
				capacity: z.number().int().min(1),
				branchId: z.string().uuid(),
				isActive: z.boolean().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create")

			return createRoom(context.tenantDb, {
				name: input.name,
				type: input.type,
				capacity: input.capacity,
				branchId: input.branchId,
				isActive: input.isActive,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().optional(),
				type: roomTypeEnum.optional(),
				capacity: z.number().int().min(1).optional(),
				branchId: z.string().uuid().optional(),
				isActive: z.boolean().optional(),
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

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")

			return updateRoom(context.tenantDb, input.id, {
				name: input.name,
				type: input.type,
				capacity: input.capacity,
				branchId: input.branchId,
				isActive: input.isActive,
			});
		}),

	delete: protectedProcedure
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

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")

			return deleteRoom(context.tenantDb, input.id);
		}),
};
