import { eq, and, asc, count, sql } from "drizzle-orm";
import { waitlistEntries } from "@avantej-core/db/schema/tenant/waitlist-entries";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export async function listWaitlistEntries(
	tenantDb: TenantDb,
	params: {
		classSlotId?: string;
		memberId?: string;
		status?: "waiting" | "promoted" | "cancelled";
	} = {},
): Promise<(typeof waitlistEntries.$inferSelect)[]> {
	const conditions = [];

	if (params.classSlotId) {
		conditions.push(eq(waitlistEntries.classSlotId, params.classSlotId));
	}

	if (params.memberId) {
		conditions.push(eq(waitlistEntries.userId, params.memberId));
	}

	if (params.status) {
		conditions.push(eq(waitlistEntries.status, params.status));
	}

	if (conditions.length === 0) {
		return tenantDb.query.waitlistEntries.findMany({
			orderBy: [asc(waitlistEntries.position)],
		});
	}

	return tenantDb.query.waitlistEntries.findMany({
		where: conditions.length === 1 ? conditions[0] : and(...conditions),
		orderBy: [asc(waitlistEntries.position)],
	});
}

export async function addToWaitlist(
	tenantDb: TenantDb,
	data: { classSlotId: string; memberId: string; userId: string },
): Promise<typeof waitlistEntries.$inferSelect> {
	// Check class slot exists and is full
	const slot = await tenantDb.query.classSlots.findFirst({
		where: eq(classSlots.id, data.classSlotId),
	});

	if (!slot) {
		throw new Error("Class slot not found");
	}

	if (!slot.isFull) {
		throw new Error("Class slot is not full. Book directly instead of joining the waitlist.");
	}

	// Check member not already on waitlist for this slot
	const existing = await tenantDb.query.waitlistEntries.findFirst({
		where: and(
			eq(waitlistEntries.classSlotId, data.classSlotId),
			eq(waitlistEntries.userId, data.userId),
			eq(waitlistEntries.status, "waiting"),
		),
	});

	if (existing) {
		throw new Error("Member is already on the waitlist for this class slot");
	}

	// Compute position
	const [result] = await tenantDb
		.select({ value: count() })
		.from(waitlistEntries)
		.where(
			and(
				eq(waitlistEntries.classSlotId, data.classSlotId),
				eq(waitlistEntries.status, "waiting"),
			),
		);

	const position = (result?.value ?? 0) + 1;

	// Insert waitlist entry
	const [row] = await tenantDb
		.insert(waitlistEntries)
		.values({
			classSlotId: data.classSlotId,
			userId: data.userId,
			position,
			status: "waiting",
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create waitlist entry");
	}

	return row;
}

export async function removeFromWaitlist(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof waitlistEntries.$inferSelect> {
	const [row] = await tenantDb
		.update(waitlistEntries)
		.set({
			status: "cancelled",
			updatedAt: new Date(),
		})
		.where(eq(waitlistEntries.id, id))
		.returning();

	if (!row) {
		throw new Error("Waitlist entry not found");
	}

	return row;
}

export async function promoteFromWaitlist(
	tenantDb: TenantDb,
	classSlotId: string,
): Promise<(typeof waitlistEntries.$inferSelect) | null> {
	return tenantDb.transaction(async (tx) => {
		// Find earliest "waiting" entry
		const entry = await tx.query.waitlistEntries.findFirst({
			where: and(
				eq(waitlistEntries.classSlotId, classSlotId),
				eq(waitlistEntries.status, "waiting"),
			),
			orderBy: [asc(waitlistEntries.position)],
		});

		if (!entry) {
			return null;
		}

		// Promote the entry
		const [promoted] = await tx
			.update(waitlistEntries)
			.set({
				status: "promoted",
				updatedAt: new Date(),
			})
			.where(eq(waitlistEntries.id, entry.id))
			.returning();

		// Fetch slot so we can build the appointment
		const slot = await tx.query.classSlots.findFirst({
			where: eq(classSlots.id, classSlotId),
		});

		// Update class slot capacity
		await tx
			.update(classSlots)
			.set({
				spotsBooked: sql`${classSlots.spotsBooked} + 1`,
				spotsAvailable: sql`${classSlots.spotsAvailable} - 1`,
				isFull: sql`(${classSlots.spotsBooked} + 1) >= ${classSlots.capacity}`,
				isAvailable: sql`(${classSlots.spotsAvailable} - 1) > 0`,
				updatedAt: new Date(),
			})
			.where(eq(classSlots.id, classSlotId));

		// Create the appointment row for the promoted member
		if (slot) {
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
					serviceId: slot.serviceId ?? undefined,
					status: "confirmed",
					sessionTotal: 0,
					pricePerClient: 0,
					userId: entry.userId,
					trainerId: slot.instructorId ?? null,
					classSlotId: slot.id,
					location: slot.location ?? null,
					createdBy: entry.userId,
					paymentStatus: "pending",
				})
				.returning();

			if (appt) {
				await tx.insert(appointmentClients).values({
					appointmentId: appt.id,
					clientId: entry.userId,
					clientType: "member",
					pricePaid: 0,
				});

				// Link the appointment back to the waitlist entry
				await tx
					.update(waitlistEntries)
					.set({ appointmentId: appt.id, bookedAt: new Date(), updatedAt: new Date() })
					.where(eq(waitlistEntries.id, entry.id));
			}
		}

		return promoted ?? null;
	});
}
