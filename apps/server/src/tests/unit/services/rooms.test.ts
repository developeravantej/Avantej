import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listRooms,
	getRoomById,
	createRoom,
	updateRoom,
	deleteRoom,
} from "@avantej-core/services";

const mockFindMany = mock(
	(..._args: any[]): Promise<any[]> => Promise.resolve([]),
);
const mockFindFirst = mock(
	(..._args: any[]): Promise<any> => Promise.resolve(null),
);
const mockReturning = mock(
	(..._args: any[]): Promise<any[]> => Promise.resolve([]),
);
const mockValues = mock((..._args: any[]) => ({ returning: mockReturning }));
const mockInsert = mock((..._args: any[]) => ({ values: mockValues }));
const mockUpdate = mock((..._args: any[]) => ({
	set: mock((..._args: any[]) => ({
		where: mock((..._args: any[]) => ({ returning: mockReturning })),
	})),
}));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	query: {
		rooms: {
			findMany: mockFindMany,
			findFirst: mockFindFirst,
		},
	},
} as any;

beforeEach(() => {
	mockFindMany.mockClear();
	mockFindFirst.mockClear();
	mockReturning.mockClear();
	mockValues.mockClear();
	mockInsert.mockClear();
	mockUpdate.mockClear();
});

describe("listRooms", () => {
	test("returns active rooms by default (no filters)", async () => {
		const fakeRooms = [
			{ id: "r1", name: "Room A", branchId: "br1", isActive: true },
			{ id: "r2", name: "Room B", branchId: "br2", isActive: true },
		];
		mockFindMany.mockResolvedValueOnce(fakeRooms);

		const result = await listRooms(mockTenantDb);

		expect(result as any).toEqual(fakeRooms);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		// No filters provided — service does not default isActive, so where is undefined
		// (drizzle's and(...[]) returns undefined when conditions array is empty)
		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeUndefined();
	});

	test("filters by branchId when provided", async () => {
		const fakeRooms = [
			{ id: "r1", name: "Room A", branchId: "br1", isActive: true },
		];
		mockFindMany.mockResolvedValueOnce(fakeRooms);

		const result = await listRooms(mockTenantDb, { branchId: "br1" });

		expect(result as any).toEqual(fakeRooms);
		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("filters by isActive=false to include inactive rooms", async () => {
		const fakeRooms = [
			{ id: "r3", name: "Room C", branchId: "br1", isActive: false },
		];
		mockFindMany.mockResolvedValueOnce(fakeRooms);

		const result = await listRooms(mockTenantDb, { isActive: false });

		expect(result as any).toEqual(fakeRooms);
	});

	test("post-filters by accessibleNodeIds when provided", async () => {
		const allRooms = [
			{ id: "r1", name: "Room A", branchId: "br1", isActive: true },
			{ id: "r2", name: "Room B", branchId: "br2", isActive: true },
			{ id: "r3", name: "Room C", branchId: "br3", isActive: true },
		];
		mockFindMany.mockResolvedValueOnce(allRooms);

		const result = await listRooms(mockTenantDb, {
			accessibleNodeIds: ["br1", "br3"],
		});

		expect(result).toHaveLength(2);
		expect(result.map((r) => r.id)).toEqual(["r1", "r3"]);
	});

	test("returns empty array when accessibleNodeIds is empty (no post-filter applied)", async () => {
		const allRooms = [
			{ id: "r1", name: "Room A", branchId: "br1", isActive: true },
		];
		mockFindMany.mockResolvedValueOnce(allRooms);

		// Empty accessibleNodeIds means no post-filter — all rows returned
		const result = await listRooms(mockTenantDb, { accessibleNodeIds: [] });

		expect(result as any).toEqual(allRooms);
	});
});

describe("getRoomById", () => {
	test("returns room when found", async () => {
		const fakeRoom = { id: "r1", name: "Room A", branchId: "br1" };
		mockFindFirst.mockResolvedValueOnce(fakeRoom);

		const result = await getRoomById(mockTenantDb, "r1");

		expect(result as any).toEqual(fakeRoom);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when room not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getRoomById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createRoom", () => {
	test("inserts and returns the new room with default isActive=true", async () => {
		const fakeRoom = {
			id: "r1",
			name: "Room A",
			type: "consultation",
			capacity: 10,
			branchId: "br1",
			isActive: true,
		};
		mockReturning.mockResolvedValueOnce([fakeRoom]);

		const result = await createRoom(mockTenantDb, {
			name: "Room A",
			type: "consultation",
			capacity: 10,
			branchId: "br1",
		});

		expect(result as any).toEqual(fakeRoom);
		expect(mockInsert).toHaveBeenCalledTimes(1);
		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.isActive).toBe(true);
	});

	test("inserts with isActive=false when explicitly provided", async () => {
		const fakeRoom = { id: "r2", name: "Room B", isActive: false };
		mockReturning.mockResolvedValueOnce([fakeRoom]);

		await createRoom(mockTenantDb, {
			name: "Room B",
			type: "training",
			capacity: 20,
			branchId: "br1",
			isActive: false,
		});

		const valuesArg = mockValues.mock.calls[0]![0];
		expect(valuesArg.isActive).toBe(false);
	});

	test("throws 'Failed to create room' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createRoom(mockTenantDb, {
				name: "Room A",
				type: "consultation",
				capacity: 10,
				branchId: "br1",
			}),
		).rejects.toThrow("Failed to create room");
	});
});

describe("updateRoom", () => {
	test("updates and returns the room", async () => {
		const updatedRoom = { id: "r1", name: "Updated Room A", isActive: true };
		const mockReturningUpd = mock((..._args: any[]) =>
			Promise.resolve([updatedRoom]),
		);
		const mockWhereUpd = mock((..._args: any[]) => ({
			returning: mockReturningUpd,
		}));
		const mockSetUpd = mock((..._args: any[]) => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await updateRoom(mockTenantDb, "r1", {
			name: "Updated Room A",
		});

		expect(result as any).toEqual(updatedRoom);
		expect(mockUpdate).toHaveBeenCalledTimes(1);
	});

	test("throws 'Room not found' when update returns empty", async () => {
		const mockReturningUpd = mock((..._args: any[]) => Promise.resolve([]));
		const mockWhereUpd = mock((..._args: any[]) => ({
			returning: mockReturningUpd,
		}));
		const mockSetUpd = mock((..._args: any[]) => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(
			updateRoom(mockTenantDb, "nonexistent", { name: "X" }),
		).rejects.toThrow("Room not found");
	});
});

describe("deleteRoom (soft delete)", () => {
	test("sets isActive=false via update — does NOT call db.delete", async () => {
		const deactivatedRoom = { id: "r1", name: "Room A", isActive: false };
		const mockReturningUpd = mock((..._args: any[]) =>
			Promise.resolve([deactivatedRoom]),
		);
		const mockWhereUpd = mock((..._args: any[]) => ({
			returning: mockReturningUpd,
		}));
		const mockSetUpd = mock((..._args: any[]) => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		const result = await deleteRoom(mockTenantDb, "r1");

		// Must use update (soft delete), not db.delete
		expect(mockUpdate).toHaveBeenCalledTimes(1);
		expect(result.isActive).toBe(false);
		// Verify the set call included isActive: false
		const setArg = mockSetUpd.mock.calls[0]![0];
		expect(setArg.isActive).toBe(false);
	});

	test("throws 'Room not found' when soft delete update returns empty", async () => {
		const mockReturningUpd = mock((..._args: any[]) => Promise.resolve([]));
		const mockWhereUpd = mock((..._args: any[]) => ({
			returning: mockReturningUpd,
		}));
		const mockSetUpd = mock((..._args: any[]) => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd }));

		await expect(deleteRoom(mockTenantDb, "nonexistent")).rejects.toThrow(
			"Room not found",
		);
	});
});
