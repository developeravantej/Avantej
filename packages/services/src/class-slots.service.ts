import { eq, and, inArray, gte, lte, asc } from "drizzle-orm";
import { classSlots } from "@avantej-core/db/schema/tenant/class-slots";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

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

	if (branchId) {
		conditions.push(eq(classSlots.branchId, branchId));
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
		conditions.push(eq(classSlots.isAvailable, true));
	}

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		conditions.push(inArray(classSlots.branchId, accessibleNodeIds));
	}

	return tenantDb.query.classSlots.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [asc(classSlots.date), asc(classSlots.startTime)],
		limit,
		offset,
	});
}

export async function getClassSlotById(
	tenantDb: TenantDb,
	id: string,
) {
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
			"date" | "startTime" | "endTime" | "capacity" | "instructorId" | "location"
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
				...(data.instructorId !== undefined && { instructorId: data.instructorId }),
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
			...(data.instructorId !== undefined && { instructorId: data.instructorId }),
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
) {
	const [row] = await tenantDb
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
	return row;
}

export async function incrementBooking(
	tenantDb: TenantDb,
	id: string,
) {
	const slot = await tenantDb.query.classSlots.findFirst({
		where: eq(classSlots.id, id),
	});
	if (!slot) throw new Error("Class slot not found");
	if (slot.isFull) throw new Error("Class slot is full");
	if (slot.isCancelled) throw new Error("Class slot is cancelled");

	const newSpotsBooked = slot.spotsBooked + 1;
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

export async function decrementBooking(
	tenantDb: TenantDb,
	id: string,
) {
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

	if (params.branchId) {
		conditions.push(eq(classSlots.branchId, params.branchId));
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
