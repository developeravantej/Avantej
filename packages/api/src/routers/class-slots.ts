import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import { protectedProcedure } from "../index";
import {
	listClassSlots,
	getClassSlotById,
	createClassSlot,
	updateClassSlot,
	cancelClassSlot,
	getBookingCounts,
	listClassSlotSignups,
} from "@avantej-core/services/class-slots.service";
import { requirePermission } from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			serviceId: z.string().uuid().optional(),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			isAvailable: z.boolean().optional(),
			limit: z.number().int().optional(),
			offset: z.number().int().optional(),
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listClassSlots(context.tenantDb, {
			serviceId: input.serviceId,
			branchId: input.branchId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			isAvailable: input.isAvailable,
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const getById = protectedProcedure
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const slot = await getClassSlotById(context.tenantDb, input.id);
		if (!slot) {
			throw new ORPCError("NOT_FOUND", {
				message: `Class slot not found: ${input.id}`,
			});
		}
		return slot;
	});

const create = protectedProcedure
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "create");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

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

const update = protectedProcedure
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
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

const cancel = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			cancellationReason: z.string().optional(),
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return cancelClassSlot(context.tenantDb, input.id, input.cancellationReason);
	});

const bookingCounts = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime(),
			to: z.string().datetime(),
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getBookingCounts(context.tenantDb, {
			branchId: input.branchId,
			from: new Date(input.from),
			to: new Date(input.to),
			accessibleNodeIds: context.accessibleNodeIds,
		});
	});

const getSignups = protectedProcedure
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
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "read");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message: error instanceof Error ? error.message : "Permission denied",
			});
		}

		const slot = await getClassSlotById(context.tenantDb, input.id);
		if (!slot) {
			throw new ORPCError("NOT_FOUND", {
				message: `Class slot not found: ${input.id}`,
			});
		}

		if (context.accessibleNodeIds && !context.accessibleNodeIds.includes(slot.branchId)) {
			throw new ORPCError("FORBIDDEN", {
				message: "You do not have access to this class slot",
			});
		}

		const rawSignups = await listClassSlotSignups(context.tenantDb, input.id);

		const memberClientIds = rawSignups
			.filter((s) => s.clientType !== "walk_in" && s.clientId != null)
			.map((s) => s.clientId as string);

		const userMap = new Map<string, { name: string; email: string }>();

		if (memberClientIds.length > 0) {
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (controlPanelDb) {
				const userRows = await controlPanelDb
					.select({ id: user.id, name: user.name, email: user.email })
					.from(user)
					.where(inArray(user.id, memberClientIds));
				for (const u of userRows) {
					userMap.set(u.id, { name: u.name, email: u.email });
				}
			}
		}

		return rawSignups.map((s) => {
			if (s.clientType === "walk_in" || s.clientId == null) {
				return {
					appointmentId: s.appointmentId,
					clientType: s.clientType as string,
					name: s.walkInName ?? "Walk-in Customer",
					email: s.walkInEmail ?? null,
					phone: s.walkInPhone ?? null,
					attended: s.attended,
					pricePaid: s.pricePaid,
					appointmentStatus: s.appointmentStatus,
				};
			}
			const details = userMap.get(s.clientId);
			return {
				appointmentId: s.appointmentId,
				clientType: s.clientType as string,
				name: details?.name ?? s.clientId,
				email: details?.email ?? null,
				phone: null as string | null,
				attended: s.attended,
				pricePaid: s.pricePaid,
				appointmentStatus: s.appointmentStatus,
			};
		});
	});

export const classSlotsRouter = {
	list,
	getById,
	create,
	update,
	cancel,
	bookingCounts,
	getSignups,
};
