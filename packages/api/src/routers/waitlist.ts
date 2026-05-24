import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {
	listWaitlistEntries,
	addToWaitlist,
	removeFromWaitlist,
	promoteFromWaitlist,
} from "@avantej-core/services/waitlist.service";
import { requirePermission } from "@avantej-core/services";

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid().optional(),
			memberId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "read")

		return listWaitlistEntries(context.tenantDb, {
			classSlotId: input.classSlotId,
			memberId: input.memberId,
		});
	});

const add = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid(),
			memberId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "create")

		try {
			return await addToWaitlist(context.tenantDb, {
				classSlotId: input.classSlotId,
				memberId: input.memberId,
				userId: context.member.userId,
			});
		} catch (error) {
			throw new ORPCError("BAD_REQUEST", {
				message: error instanceof Error ? error.message : "Failed to add to waitlist",
			});
		}
	});

const remove = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")

		return removeFromWaitlist(context.tenantDb, input.id);
	});

const promote = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		await requirePermissionOrpc(context.tenantDb, context.member, "appointment_management", "update")

		return promoteFromWaitlist(context.tenantDb, input.classSlotId);
	});

export const waitlistRouter = { list, add, remove, promote };
