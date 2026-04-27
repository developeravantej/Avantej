import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
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
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];

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

const enrollClient = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid(),
			clientUserId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant database not available." });
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
		}
		try {
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", { message: error instanceof Error ? error.message : "Permission denied" });
		}

		const tenantDb = context.tenantDb;
		const createdBy = context.member.userId;

		return (tenantDb as TenantDb).transaction(async (tx: TenantTx) => {
			const slot = await tx.query.classSlots.findFirst({ where: eq(classSlots.id, input.classSlotId) });
			if (!slot) throw new ORPCError("NOT_FOUND", { message: "Class slot not found" });
			if (slot.isCancelled) throw new ORPCError("BAD_REQUEST", { message: "Class slot is cancelled" });
			if (slot.spotsBooked >= slot.capacity) throw new ORPCError("BAD_REQUEST", { message: "Class slot is full" });

			if (context.accessibleNodeIds && !context.accessibleNodeIds.includes(slot.branchId)) {
				throw new ORPCError("FORBIDDEN", { message: "You do not have access to this class slot's branch" });
			}

			const existingActive = await tx
				.select({ apptId: appointments.id })
				.from(appointmentClients)
				.innerJoin(appointments, eq(appointmentClients.appointmentId, appointments.id))
				.where(
					and(
						eq(appointments.classSlotId, input.classSlotId),
						eq(appointmentClients.clientId, input.clientUserId),
						ne(appointments.status, "cancelled"),
					),
				);
			if (existingActive.length > 0) {
				throw new ORPCError("CONFLICT", { message: "Client is already enrolled in this class slot" });
			}

			const service = await tx.query.services.findFirst({ where: eq(services.id, slot.serviceId) });
			const pricePerClient = service?.price ?? 0;
			const [sh, sm] = slot.startTime.split(":").map(Number);
			const [eh, em] = slot.endTime.split(":").map(Number);
			const startTime = new Date(slot.date);
			startTime.setHours(sh ?? 0, sm ?? 0, 0, 0);
			const endTime = new Date(slot.date);
			endTime.setHours(eh ?? 0, em ?? 0, 0, 0);
			const duration = Math.max(1, Math.round((endTime.getTime() - startTime.getTime()) / 60000));

			const [appt] = await tx
				.insert(appointments)
				.values({
					type: "semi-private",
					startTime,
					endTime,
					duration,
					branchId: slot.branchId,
					serviceId: slot.serviceId,
					status: "confirmed",
					sessionTotal: pricePerClient,
					pricePerClient,
					userId: input.clientUserId,
					trainerId: slot.instructorId,
					classSlotId: slot.id,
					location: slot.location ?? null,
					createdBy,
					paymentStatus: "pending",
				})
				.returning();
			if (!appt) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create appointment" });

			await tx.insert(appointmentClients).values({
				appointmentId: appt.id,
				clientId: input.clientUserId,
				clientType: "member",
				pricePaid: pricePerClient,
			});

			const newBooked = slot.spotsBooked + 1;
			await tx
				.update(classSlots)
				.set({
					spotsBooked: newBooked,
					spotsAvailable: Math.max(0, slot.capacity - newBooked),
					isFull: newBooked >= slot.capacity,
					isAvailable: newBooked < slot.capacity && !slot.isCancelled,
					updatedAt: new Date(),
				})
				.where(eq(classSlots.id, slot.id));

			return { appointmentId: appt.id, slotId: slot.id };
		});
	});

const cancelEnrollment = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			appointmentId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Tenant database not available." });
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", { message: "User is not a member of this organization" });
		}
		try {
			await requirePermission(context.tenantDb, context.member, "class_slot_management", "update");
		} catch (error) {
			throw new ORPCError("FORBIDDEN", { message: error instanceof Error ? error.message : "Permission denied" });
		}

		const tenantDb = context.tenantDb;
		return (tenantDb as TenantDb).transaction(async (tx: TenantTx) => {
			const appt = await tx.query.appointments.findFirst({ where: eq(appointments.id, input.appointmentId) });
			if (!appt) throw new ORPCError("NOT_FOUND", { message: "Appointment not found" });
			if (!appt.classSlotId) throw new ORPCError("BAD_REQUEST", { message: "Appointment is not part of a class slot" });
			if (appt.status === "cancelled") return { ok: true, alreadyCancelled: true };

			if (context.accessibleNodeIds && !context.accessibleNodeIds.includes(appt.branchId)) {
				throw new ORPCError("FORBIDDEN", { message: "You do not have access to this appointment's branch" });
			}

			await tx.update(appointments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));

			const slot = await tx.query.classSlots.findFirst({ where: eq(classSlots.id, appt.classSlotId) });
			if (slot && slot.spotsBooked > 0) {
				const newBooked = slot.spotsBooked - 1;
				await tx
					.update(classSlots)
					.set({
						spotsBooked: newBooked,
						spotsAvailable: Math.max(0, slot.capacity - newBooked),
						isFull: false,
						isAvailable: !slot.isCancelled,
						updatedAt: new Date(),
					})
					.where(eq(classSlots.id, slot.id));
			}

			return { ok: true, alreadyCancelled: false };
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
	enrollClient,
	cancelEnrollment,
};
