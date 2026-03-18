import { eq, and, asc } from "drizzle-orm";
import { rooms } from "@avantej-core/db/schema/tenant/rooms";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type CreateRoomParams = {
	name: string;
	type: "consultation" | "group_session" | "private" | "training" | "individual";
	capacity: number;
	branchId: string;
	isActive?: boolean;
};

export type UpdateRoomParams = Partial<CreateRoomParams>;

export async function listRooms(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: { branchId?: string; isActive?: boolean; accessibleNodeIds?: string[] } = {}
): Promise<(typeof rooms.$inferSelect)[]> {
	const { branchId, isActive, accessibleNodeIds } = params;

	const conditions = [];
	conditions.push(eq(rooms.isActive, isActive !== undefined ? isActive : true));
	if (branchId !== undefined) {
		conditions.push(eq(rooms.branchId, branchId));
	}

	const rows = await tenantDb.query.rooms.findMany({
		where: and(...conditions),
		orderBy: [asc(rooms.name)],
	});

	if (accessibleNodeIds && accessibleNodeIds.length > 0) {
		return rows.filter((row) => accessibleNodeIds.includes(row.branchId));
	}

	return rows;
}

export async function getRoomById(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<(typeof rooms.$inferSelect) | null> {
	const row = await tenantDb.query.rooms.findFirst({
		where: eq(rooms.id, id),
	});
	return row ?? null;
}

export async function createRoom(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateRoomParams
): Promise<typeof rooms.$inferSelect> {
	const [row] = await tenantDb
		.insert(rooms)
		.values({
			name: params.name,
			type: params.type,
			capacity: params.capacity,
			branchId: params.branchId,
			isActive: params.isActive ?? true,
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create room");
	}
	return row;
}

export async function updateRoom(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string,
	params: UpdateRoomParams
): Promise<typeof rooms.$inferSelect> {
	const [row] = await tenantDb
		.update(rooms)
		.set({
			...(params.name !== undefined && { name: params.name }),
			...(params.type !== undefined && { type: params.type }),
			...(params.capacity !== undefined && { capacity: params.capacity }),
			...(params.branchId !== undefined && { branchId: params.branchId }),
			...(params.isActive !== undefined && { isActive: params.isActive }),
			updatedAt: new Date(),
		})
		.where(eq(rooms.id, id))
		.returning();

	if (!row) {
		throw new Error("Room not found");
	}
	return row;
}

export async function deleteRoom(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	id: string
): Promise<typeof rooms.$inferSelect> {
	const [row] = await tenantDb
		.update(rooms)
		.set({ isActive: false, updatedAt: new Date() })
		.where(eq(rooms.id, id))
		.returning();

	if (!row) {
		throw new Error("Room not found");
	}
	return row;
}
