import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import { services } from "@avantej-core/db/schema/tenant/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import type { TenantDb, TenantTx } from "./types";

const enrollClient = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			classSlotId: z.string().uuid(),
			clientUserId: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		
		
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "update")

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

const cancelEnrollment = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			appointmentId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		
		
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "class_slot_management", "update")

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

			// Restore one credit to the package instance if this appointment consumed one
			if (appt.packageInstanceId) {
				await tx
					.update(packageInstances)
					.set({ creditsUsed: sql`${packageInstances.creditsUsed} - 1`, updatedAt: new Date() })
					.where(eq(packageInstances.id, appt.packageInstanceId));
			}

			return { ok: true, alreadyCancelled: false };
		});
	});

export const classSlotsEnrollmentProcedures = {
	enrollClient,
	cancelEnrollment,
};
