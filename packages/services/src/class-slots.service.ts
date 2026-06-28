import { eq, and, inArray, gte, lte, asc, ne, sql } from "drizzle-orm";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentClients } from "@avantej-core/db/schema/tenant/appointment-clients";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";
import { waitlistEntries } from "@avantej-core/db/schema/tenant/waitlist-entries";
import { services } from "@avantej-core/db/schema/tenant/services";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { cancelAppointmentInsideTx } from "./appointment.service";
import { promoteFromWaitlistInsideTx } from "./waitlist.service";
import { writeAudit } from "./audit-log.service";
import { resolveScopeNodeIds } from "./hierarchy-scope";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreateClassSlotParams = {
	serviceId: string;
	branchId: string;
	date: Date;
	startTime: string; // "HH:MM" 24-hour
	endTime: string; // "HH:MM" 24-hour
	capacity: number;
	instructorId?: string; // members.id (uuid)
	location?: string;
};

export async function listClassSlots(
	tenantDb: TenantDb,
	params: {
		serviceId?: string;
		branchId?: string;
		date?: Date;
		from?: Date;
		to?: Date;
		isAvailable?: boolean;
		accessibleNodeIds?: string[];
		limit?: number;
		offset?: number;
	} = {},
) {
	const {
		serviceId,
		branchId,
		date,
		from,
		to,
		isAvailable,
		accessibleNodeIds,
		limit = 50,
		offset = 0,
	} = params;

	const conditions = [];

	if (serviceId) {
		conditions.push(eq(classSlots.serviceId, serviceId));
	}

	// Expand the picked scope node (which may be a non-leaf country/region/state)
	// to its accessible subtree of LEAF branch ids. Business rows are tagged with
	// a leaf branchId, so an exact-equality match on a non-leaf node returns zero
	// rows; subtree expansion lets a country/region scope return its branches'
	// slots. resolveScopeNodeIds also guards out-of-scope nodes (throws
	// BranchAccessDeniedError = FORBIDDEN) and its result is always ⊆
	// accessibleNodeIds, so the RBAC ceiling is preserved.
	const scopeIds = await resolveScopeNodeIds(
		tenantDb,
		branchId,
		accessibleNodeIds ?? [],
	);
	if (scopeIds.length > 0) {
		conditions.push(inArray(classSlots.branchId, scopeIds));
	}

	if (date) {
		conditions.push(eq(classSlots.date, date));
	}

	if (from) {
		conditions.push(gte(classSlots.date, from));
	}

	if (to) {
		conditions.push(lte(classSlots.date, to));
	}

	if (isAvailable !== undefined) {
		conditions.push(eq(classSlots.isAvailable, isAvailable));
	}

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(classSlots.branchId, accessibleNodeIds));
	}

	const rows = await tenantDb
		.select({
			id: classSlots.id,
			serviceId: classSlots.serviceId,
			branchId: classSlots.branchId,
			date: classSlots.date,
			startTime: classSlots.startTime,
			endTime: classSlots.endTime,
			capacity: classSlots.capacity,
			spotsBooked: classSlots.spotsBooked,
			spotsAvailable: classSlots.spotsAvailable,
			isFull: classSlots.isFull,
			isAvailable: classSlots.isAvailable,
			isCancelled: classSlots.isCancelled,
			cancellationReason: classSlots.cancellationReason,
			instructorId: classSlots.instructorId,
			location: classSlots.location,
			createdAt: classSlots.createdAt,
			updatedAt: classSlots.updatedAt,
			// Waitlist: count active waiting entries for this slot
			waitlistCount: sql<number>`COALESCE(COUNT(DISTINCT ${waitlistEntries.id}) FILTER (WHERE ${waitlistEntries.status} IN ('waiting', 'notified')), 0)::int`,
			// Price: pull from the joined service row (in cents)
			pricePerSpotCents: sql<number>`COALESCE(MAX(${services.price}), 0)::int`,
		})
		.from(classSlots)
		.leftJoin(waitlistEntries, eq(waitlistEntries.classSlotId, classSlots.id))
		.leftJoin(services, eq(services.id, classSlots.serviceId))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.groupBy(classSlots.id)
		.orderBy(asc(classSlots.date), asc(classSlots.startTime))
		.limit(limit)
		.offset(offset);

	return rows;
}

export async function getClassSlotById(tenantDb: TenantDb, id: string) {
	const row = await tenantDb.query.classSlots.findFirst({
		where: eq(classSlots.id, id),
	});
	return row ?? undefined;
}

export async function createClassSlot(
	tenantDb: TenantDb,
	data: CreateClassSlotParams,
) {
	const [row] = await tenantDb
		.insert(classSlots)
		.values({
			serviceId: data.serviceId,
			branchId: data.branchId,
			date: data.date,
			startTime: data.startTime,
			endTime: data.endTime,
			capacity: data.capacity,
			spotsAvailable: data.capacity,
			spotsBooked: 0,
			isFull: false,
			isAvailable: true,
			isCancelled: false,
			instructorId: data.instructorId ?? null,
			location: data.location ?? null,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create class slot");
	}
	return row;
}

export async function updateClassSlot(
	tenantDb: TenantDb,
	id: string,
	data: Partial<
		Pick<
			CreateClassSlotParams,
			| "date"
			| "startTime"
			| "endTime"
			| "capacity"
			| "instructorId"
			| "location"
		>
	>,
) {
	// If capacity is being updated, we need current slot data to recompute status
	if (data.capacity !== undefined) {
		const slot = await tenantDb.query.classSlots.findFirst({
			where: eq(classSlots.id, id),
		});
		if (!slot) {
			throw new Error("Class slot not found");
		}

		const newCapacity = data.capacity;
		const newIsFull = slot.spotsBooked >= newCapacity;
		const newIsAvailable = !newIsFull && !slot.isCancelled;
		const newSpotsAvailable = Math.max(0, newCapacity - slot.spotsBooked);

		const [row] = await tenantDb
			.update(classSlots)
			.set({
				...(data.date !== undefined && { date: data.date }),
				...(data.startTime !== undefined && { startTime: data.startTime }),
				...(data.endTime !== undefined && { endTime: data.endTime }),
				...(data.instructorId !== undefined && {
					instructorId: data.instructorId,
				}),
				...(data.location !== undefined && { location: data.location }),
				capacity: newCapacity,
				spotsAvailable: newSpotsAvailable,
				isFull: newIsFull,
				isAvailable: newIsAvailable,
				updatedAt: new Date(),
			})
			.where(eq(classSlots.id, id))
			.returning();

		if (!row) {
			throw new Error("Class slot not found");
		}
		return row;
	}

	const [row] = await tenantDb
		.update(classSlots)
		.set({
			...(data.date !== undefined && { date: data.date }),
			...(data.startTime !== undefined && { startTime: data.startTime }),
			...(data.endTime !== undefined && { endTime: data.endTime }),
			...(data.instructorId !== undefined && {
				instructorId: data.instructorId,
			}),
			...(data.location !== undefined && { location: data.location }),
			updatedAt: new Date(),
		})
		.where(eq(classSlots.id, id))
		.returning();

	if (!row) {
		throw new Error("Class slot not found");
	}
	return row;
}

export async function cancelClassSlot(
	tenantDb: TenantDb,
	id: string,
	cancellationReason?: string,
	actor?: { userId: string; memberId: string; role: string },
) {
	return tenantDb.transaction(async (tx) => {
		// 1. Mark the slot itself cancelled
		const [row] = await tx
			.update(classSlots)
			.set({
				isCancelled: true,
				isAvailable: false,
				cancellationReason: cancellationReason ?? null,
				updatedAt: new Date(),
			})
			.where(eq(classSlots.id, id))
			.returning();

		if (!row) {
			throw new Error("Class slot not found");
		}

		// Audit: slot cancellation
		if (actor) {
			await writeAudit(tx, {
				actorUserId: actor.userId,
				actorMemberId: actor.memberId,
				actorRole: actor.role,
				action: "class_slot.cancel",
				entityType: "class_slot",
				entityId: id,
				branchId: row.branchId,
				summary: `Class slot cancelled${cancellationReason ? `: ${cancellationReason}` : ""}`,
				changes: { cancellationReason: cancellationReason ?? null },
			});
		}

		// 2. Cascade-cancel all enrolled (non-cancelled) appointments for this slot
		const enrolledAppointments = await tx
			.select()
			.from(appointments)
			.where(
				and(
					eq(appointments.classSlotId, id),
					ne(appointments.status, "cancelled"),
				),
			);

		const cascadeReason = cancellationReason
			? `Class slot cancelled: ${cancellationReason}`
			: "Class slot cancelled";

		for (const appt of enrolledAppointments) {
			await cancelAppointmentInsideTx(tx, appt, actor, cascadeReason);
		}

		// 3. Attempt to promote waiting entries into any freed capacity, then
		//    notify the promoted member (notification is handled inside the
		//    promotion helper). Bounded by the number of spots just freed so we
		//    never over-promote, and stops as soon as there's nothing left to
		//    promote or no capacity remains.
		//
		//    NOTE: when the *whole* slot is being cancelled (the common case for
		//    this function), the promotion helper's `isCancelled = false` guard
		//    means it returns "full" immediately and no booking is created — we
		//    do not strand members in a dead slot. The loop still runs cheaply
		//    and is correct for the (rare) caller that frees capacity without
		//    tearing the slot down.
		let promotedCount = 0;
		for (let i = 0; i < enrolledAppointments.length; i++) {
			const result = await promoteFromWaitlistInsideTx(tx, id);
			if (result === null || result === "full") break;
			promotedCount += 1;
		}

		return {
			...row,
			cancelledAppointmentCount: enrolledAppointments.length,
			promotedFromWaitlistCount: promotedCount,
		};
	});
}

export async function incrementBooking(tenantDb: TenantDb, id: string) {
	// Atomic check-and-increment: the conditional WHERE guarantees we only
	// claim a spot when the slot is live and still below capacity. Two
	// concurrent bookings can no longer both read a stale count and over-fill —
	// at most one wins per free spot, and a full slot affects 0 rows. (F-SVC-09)
	const [updated] = await tenantDb
		.update(classSlots)
		.set({
			spotsBooked: sql`${classSlots.spotsBooked} + 1`,
			spotsAvailable: sql`GREATEST(${classSlots.capacity} - (${classSlots.spotsBooked} + 1), 0)`,
			isFull: sql`(${classSlots.spotsBooked} + 1) >= ${classSlots.capacity}`,
			isAvailable: sql`(${classSlots.spotsBooked} + 1) < ${classSlots.capacity}`,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(classSlots.id, id),
				eq(classSlots.isCancelled, false),
				sql`${classSlots.spotsBooked} < ${classSlots.capacity}`,
			),
		)
		.returning();

	if (!updated) {
		// Distinguish "not found / cancelled" from "full" for a useful message.
		const slot = await tenantDb.query.classSlots.findFirst({
			where: eq(classSlots.id, id),
		});
		if (!slot) throw new Error("Class slot not found");
		if (slot.isCancelled) throw new Error("Class slot is cancelled");
		throw new Error("Class slot is full");
	}

	return updated;
}

export async function decrementBooking(tenantDb: TenantDb, id: string) {
	const slot = await tenantDb.query.classSlots.findFirst({
		where: eq(classSlots.id, id),
	});
	if (!slot) throw new Error("Class slot not found");
	if (slot.spotsBooked <= 0) throw new Error("No bookings to decrement");

	const newSpotsBooked = slot.spotsBooked - 1;
	const newSpotsAvailable = Math.max(0, slot.capacity - newSpotsBooked);
	const newIsFull = newSpotsBooked >= slot.capacity;

	const [updated] = await tenantDb
		.update(classSlots)
		.set({
			spotsBooked: newSpotsBooked,
			spotsAvailable: newSpotsAvailable,
			isFull: newIsFull,
			isAvailable: !newIsFull && !slot.isCancelled,
			updatedAt: new Date(),
		})
		.where(eq(classSlots.id, id))
		.returning();

	return updated;
}

export async function listClassSlotSignups(
	tenantDb: TenantDb,
	classSlotId: string,
) {
	const slotAppointments = await tenantDb
		.select({ id: appointments.id, status: appointments.status })
		.from(appointments)
		.where(
			and(
				eq(appointments.classSlotId, classSlotId),
				ne(appointments.status, "cancelled"),
			),
		);

	if (slotAppointments.length === 0) return [];

	const appointmentIds = slotAppointments.map((a) => a.id);
	const statusMap = new Map(slotAppointments.map((a) => [a.id, a.status]));

	const clients = await tenantDb
		.select({
			appointmentId: appointmentClients.appointmentId,
			clientId: appointmentClients.clientId,
			clientType: appointmentClients.clientType,
			walkInCustomerId: appointmentClients.walkInCustomerId,
			pricePaid: appointmentClients.pricePaid,
			attended: appointmentClients.attended,
			walkInName: walkInCustomers.name,
			walkInEmail: walkInCustomers.email,
			walkInPhone: walkInCustomers.phone,
		})
		.from(appointmentClients)
		.leftJoin(
			walkInCustomers,
			eq(appointmentClients.walkInCustomerId, walkInCustomers.id),
		)
		.where(inArray(appointmentClients.appointmentId, appointmentIds));

	return clients.map((c) => ({
		appointmentId: c.appointmentId,
		clientId: c.clientType === "walk_in" ? null : c.clientId,
		walkInCustomerId: c.walkInCustomerId ?? null,
		clientType: c.clientType,
		pricePaid: c.pricePaid,
		attended: c.attended,
		appointmentStatus: statusMap.get(c.appointmentId) ?? "unknown",
		walkInName: c.walkInName ?? null,
		walkInEmail: c.walkInEmail ?? null,
		walkInPhone: c.walkInPhone ?? null,
	}));
}

export async function getBookingCounts(
	tenantDb: TenantDb,
	params: {
		branchId?: string;
		from: Date;
		to: Date;
		accessibleNodeIds?: string[];
	},
) {
	const conditions = [
		gte(classSlots.date, params.from),
		lte(classSlots.date, params.to),
	];

	// Subtree expansion: a non-leaf scope node (country/region/state) expands to
	// its accessible leaf branch ids so booking counts roll up correctly instead
	// of returning zero rows for a non-leaf scope. resolveScopeNodeIds guards
	// out-of-scope nodes and stays within the accessibleNodeIds ceiling.
	const scopeIds = await resolveScopeNodeIds(
		tenantDb,
		params.branchId,
		params.accessibleNodeIds ?? [],
	);
	if (scopeIds.length > 0) {
		conditions.push(inArray(classSlots.branchId, scopeIds));
	}

	if (params.accessibleNodeIds && params.accessibleNodeIds.length > 0) {
		conditions.push(inArray(classSlots.branchId, params.accessibleNodeIds));
	}

	const rows = await tenantDb
		.select({
			slotId: classSlots.id,
			spotsBooked: classSlots.spotsBooked,
			capacity: classSlots.capacity,
			isFull: classSlots.isFull,
		})
		.from(classSlots)
		.where(and(...conditions));

	return rows;
}
