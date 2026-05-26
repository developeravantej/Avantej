import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
import {
	createClassSlot,
	updateClassSlot,
	cancelClassSlot,
} from "@avantej-core/services/class-slots.service";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";

const create = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			serviceId: z.string().uuid(),
			branchId: z.string().uuid(),
			date: z.string().datetime(),
			startTime: z.string(),
			endTime: z.string(),
			capacity: z.number().int().positive(),
			instructorId: z.string().uuid().optional(),
			location: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "create")

		return createClassSlot(context.tenantDb, {
			serviceId: input.serviceId,
			branchId: input.branchId,
			date: new Date(input.date),
			startTime: input.startTime,
			endTime: input.endTime,
			capacity: input.capacity,
			instructorId: input.instructorId,
			location: input.location,
		});
	});

const update = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			date: z.string().datetime().optional(),
			startTime: z.string().optional(),
			endTime: z.string().optional(),
			capacity: z.number().int().positive().optional(),
			instructorId: z.string().uuid().optional(),
			location: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "update")

		if (input.capacity !== undefined) {
			const current = await context.tenantDb.query.classSlots.findFirst({
				where: eq(classSlots.id, input.id),
				columns: { spotsBooked: true },
			});
			if (current && input.capacity < (current.spotsBooked ?? 0)) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Cannot reduce capacity to ${input.capacity}: ${current.spotsBooked} spots are already booked.`,
				});
			}
		}

		return updateClassSlot(context.tenantDb, input.id, {
			date: input.date ? new Date(input.date) : undefined,
			startTime: input.startTime,
			endTime: input.endTime,
			capacity: input.capacity,
			instructorId: input.instructorId,
			location: input.location,
		});
	});

const cancel = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			cancellationReason: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "update")

		const actor = {
			userId: context.member.userId,
			memberId: context.member.id,
			role: context.member.role,
		};

		return cancelClassSlot(context.tenantDb, input.id, input.cancellationReason, actor);
	});

export const classSlotsCrudProcedures = {
	create,
	update,
	cancel,
};
