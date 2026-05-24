import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
 listRooms, getRoomById, createRoom, updateRoom, deleteRoom } from "@avantej-core/services";

const roomTypeEnum = z.enum(["consultation", "group_session", "private", "training", "individual"]);

export const roomsRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
				isActive: z.boolean().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read")

			return listRooms(context.tenantDb, {
				branchId: input.branchId,
				isActive: input.isActive,
				accessibleNodeIds: context.accessibleNodeIds,
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
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read")

			const room = await getRoomById(context.tenantDb, input.id);
			if (!room) {
				throw new ORPCError("NOT_FOUND", {
					message: `Room not found: ${input.id}`,
				});
			}
			return room;
		}),

	create: tenantProcedure
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
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create")

			return createRoom(context.tenantDb, {
				name: input.name,
				type: input.type,
				capacity: input.capacity,
				branchId: input.branchId,
				isActive: input.isActive,
			});
		}),

	update: tenantProcedure
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
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")

			return updateRoom(context.tenantDb, input.id, {
				name: input.name,
				type: input.type,
				capacity: input.capacity,
				branchId: input.branchId,
				isActive: input.isActive,
			});
		}),

	delete: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")

			return deleteRoom(context.tenantDb, input.id);
		}),
};
