import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listWaitlistEntries,
	addToWaitlist,
	removeFromWaitlist,
	promoteFromWaitlist,
} from "@avantej-core/services/waitlist.service";
import { requirePermission } from "@avantej-core/services";

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid().optional(),
			memberId: z.string().uuid().optional(),
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
			await requirePermission(context.tenantDb, context.member, "appointment_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listWaitlistEntries(context.tenantDb, {
			classSlotId: input.classSlotId,
			memberId: input.memberId,
		});
	});

const add = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid(),
			memberId: z.string().uuid(),
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
			await requirePermission(context.tenantDb, context.member, "appointment_management", "create");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

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

const remove = protectedProcedure
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

		try {
			await requirePermission(context.tenantDb, context.member, "appointment_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return removeFromWaitlist(context.tenantDb, input.id);
	});

const promote = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid(),
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
			await requirePermission(context.tenantDb, context.member, "appointment_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return promoteFromWaitlist(context.tenantDb, input.classSlotId);
	});

export const waitlistRouter = { list, add, remove, promote };
