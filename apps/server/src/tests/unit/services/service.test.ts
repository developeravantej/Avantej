import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listServices,
	getServiceById,
	createService,
	updateService,
} from "@avantej-core/services";

// Shared mocks
const mockFindMany = mock((..._args: any[]): Promise<any[]> => Promise.resolve([]));
const mockFindFirst = mock((..._args: any[]): Promise<any> => Promise.resolve(null));
const mockReturning = mock((): Promise<any[]> => Promise.resolve([]));
const mockValues = mock((..._args: any[]) => ({ returning: mockReturning }));
const mockInsert = mock((..._args: any[]) => ({ values: mockValues }));
const mockUpdate = mock((..._args: any[]) => ({
	set: mock((..._setArgs: any[]) => ({
		where: mock((..._whereArgs: any[]) => ({ returning: mockReturning })),
	})),
}));

const mockTenantDb = {
	insert: mockInsert,
	update: mockUpdate,
	query: {
		services: {
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

describe("listServices", () => {
	test("returns all services with no filters", async () => {
		const fakeServices = [
			{ id: "s1", name: "Personal Training", branchId: "br1" },
			{ id: "s2", name: "Yoga Class", branchId: "br2" },
		];
		mockFindMany.mockResolvedValueOnce(fakeServices);

		const result = await listServices(mockTenantDb);

		expect(result as any).toEqual(
			fakeServices.map((s) => ({ ...s, service_category_name: null })),
		);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeUndefined();
	});

	test("applies categoryId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listServices(mockTenantDb, { categoryId: "cat-1" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies branchId filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listServices(mockTenantDb, { branchId: "br-1" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies isActive filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listServices(mockTenantDb, { isActive: true });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies type filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listServices(mockTenantDb, { type: "private" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("applies schedulingType filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listServices(mockTenantDb, { schedulingType: "class_slot" });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeDefined();
	});

	test("post-filters by accessibleNodeIds", async () => {
		const allServices = [
			{ id: "s1", branchId: "br1" },
			{ id: "s2", branchId: "br2" },
			{ id: "s3", branchId: "br3" },
		];
		mockFindMany.mockResolvedValueOnce(allServices);

		const result = await listServices(mockTenantDb, { accessibleNodeIds: ["br1", "br3"] });

		expect(result).toHaveLength(2);
		expect(result.map((s) => s.id)).toEqual(["s1", "s3"]);
	});

	test("accessibleNodeIds includes services with null branchId", async () => {
		const allServices = [
			{ id: "s1", branchId: null },
			{ id: "s2", branchId: "br1" },
			{ id: "s3", branchId: "br2" },
		];
		mockFindMany.mockResolvedValueOnce(allServices);

		const result = await listServices(mockTenantDb, { accessibleNodeIds: ["br1"] });

		expect(result).toHaveLength(2);
		expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
	});

	test("ignores null/undefined categoryId and branchId", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listServices(mockTenantDb, { categoryId: null, branchId: null });

		const callArg = mockFindMany.mock.calls[0]![0];
		expect(callArg.where).toBeUndefined();
	});
});

describe("getServiceById", () => {
	test("returns service when found", async () => {
		const fakeService = { id: "s1", name: "Personal Training" };
		mockFindFirst.mockResolvedValueOnce(fakeService);

		const result = await getServiceById(mockTenantDb, "s1");

		expect(result as any).toEqual(fakeService);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when service not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getServiceById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createService", () => {
	test("creates service with required fields and defaults", async () => {
		const fakeService = {
			id: "s1",
			name: "Personal Training",
			duration: 60,
			maxAttendees: 1,
			isActive: true,
			type: "private",
		};
		mockReturning.mockResolvedValueOnce([fakeService]);

		const result = await createService(mockTenantDb, {
			name: "Personal Training",
			duration: 60,
			maxAttendees: 1,
		});

		expect(result as any).toEqual(fakeService);
		expect(mockInsert).toHaveBeenCalledTimes(1);

		const valuesArg = mockValues.mock.calls[0]![0]!;
		expect(valuesArg.name).toBe("Personal Training");
		expect(valuesArg.duration).toBe(60);
		expect(valuesArg.maxAttendees).toBe(1);
		// Check defaults
		expect(valuesArg.isActive).toBe(true);
		expect(valuesArg.type).toBe("private");
		expect(valuesArg.durationUnitType).toBe("minutes");
		expect(valuesArg.taxable).toBe(false);
		expect(valuesArg.taxPercentage).toBe(0);
		expect(valuesArg.isRecommended).toBe(false);
		expect(valuesArg.priceUnit).toBe("session");
		expect(valuesArg.schedulingType).toBe("appointment");
		expect(valuesArg.expirable).toBe(false);
	});

	test("creates service with all optional fields", async () => {
		const fakeService = { id: "s2", name: "Yoga Class" };
		mockReturning.mockResolvedValueOnce([fakeService]);

		await createService(mockTenantDb, {
			name: "Yoga Class",
			categoryId: "cat-1",
			duration: 90,
			durationUnitType: "minutes",
			maxAttendees: 20,
			attendanceThreshold: 5,
			branchId: "br-1",
			isActive: true,
			title: "Beginner Yoga",
			description: "A relaxing yoga session",
			imageUrl: "https://example.com/yoga.jpg",
			type: "semi_private",
			price: 5000,
			priceUnit: "class",
			taxable: true,
			taxPercentage: 8,
			isRecommended: true,
			location: "Studio A",
			features: ["mat provided", "towel service"],
			schedulingType: "class_slot",
			sessionCount: 10,
			expirable: true,
			expiryDays: 30,
			expiryDate: new Date("2026-12-31"),
		});

		const valuesArg = mockValues.mock.calls[0]![0]!;
		expect(valuesArg.categoryId).toBe("cat-1");
		expect(valuesArg.attendanceThreshold).toBe(5);
		expect(valuesArg.title).toBe("Beginner Yoga");
		expect(valuesArg.type).toBe("semi_private");
		expect(valuesArg.price).toBe(5000);
		expect(valuesArg.priceUnit).toBe("class");
		expect(valuesArg.taxable).toBe(true);
		expect(valuesArg.taxPercentage).toBe(8);
		expect(valuesArg.isRecommended).toBe(true);
		expect(valuesArg.location).toBe("Studio A");
		expect(valuesArg.features).toEqual(["mat provided", "towel service"]);
		expect(valuesArg.schedulingType).toBe("class_slot");
		expect(valuesArg.sessionCount).toBe(10);
		expect(valuesArg.expirable).toBe(true);
		expect(valuesArg.expiryDays).toBe(30);
	});

	test("throws 'Failed to create service' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createService(mockTenantDb, {
				name: "Test",
				duration: 60,
				maxAttendees: 1,
			})
		).rejects.toThrow("Failed to create service");
	});

	test("defaults nullable fields to null", async () => {
		const fakeService = { id: "s3", name: "Minimal" };
		mockReturning.mockResolvedValueOnce([fakeService]);

		await createService(mockTenantDb, {
			name: "Minimal",
			duration: 30,
			maxAttendees: 1,
		});

		const valuesArg = mockValues.mock.calls[0]![0]!;
		expect(valuesArg.categoryId).toBeNull();
		expect(valuesArg.branchId).toBeNull();
		expect(valuesArg.attendanceThreshold).toBeNull();
		expect(valuesArg.title).toBeNull();
		expect(valuesArg.description).toBeNull();
		expect(valuesArg.imageUrl).toBeNull();
		expect(valuesArg.price).toBeNull();
		expect(valuesArg.location).toBeNull();
		expect(valuesArg.features).toBeNull();
		expect(valuesArg.sessionCount).toBeNull();
		expect(valuesArg.expiryDays).toBeNull();
		expect(valuesArg.expiryDate).toBeNull();
	});
});

describe("updateService", () => {
	test("updates and returns the service", async () => {
		const updatedService = { id: "s1", name: "Updated Training", isActive: false };
		const mockReturningUpd = mock(() => Promise.resolve([updatedService]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd as any }));

		const result = await updateService(mockTenantDb, "s1", {
			name: "Updated Training",
			isActive: false,
		});

		expect(result as any).toEqual(updatedService);
		expect(mockUpdate).toHaveBeenCalledTimes(1);

		const setArg = ((mockSetUpd as any).mock.calls[0] ?? [])[0]!;
		expect(setArg.name).toBe("Updated Training");
		expect(setArg.isActive).toBe(false);
		expect(setArg.updatedAt).toBeInstanceOf(Date);
	});

	test("only includes provided fields in set", async () => {
		const updatedService = { id: "s1", name: "Test" };
		const mockReturningUpd = mock(() => Promise.resolve([updatedService]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const capturedSet: any[] = [];
		const mockSetUpd = mock((setArg: any) => {
			capturedSet.push(setArg);
			return { where: mockWhereUpd };
		});
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd as any }));

		await updateService(mockTenantDb, "s1", { name: "Only Name" });

		const setArg = capturedSet[0];
		expect(setArg.name).toBe("Only Name");
		expect(setArg.updatedAt).toBeInstanceOf(Date);
		// Fields not provided should NOT be in the set object
		expect(setArg.duration).toBeUndefined();
		expect(setArg.maxAttendees).toBeUndefined();
		expect(setArg.type).toBeUndefined();
	});

	test("updates new schema consolidation fields", async () => {
		const updatedService = { id: "s1", name: "Test" };
		const mockReturningUpd = mock(() => Promise.resolve([updatedService]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const capturedSet: any[] = [];
		const mockSetUpd = mock((setArg: any) => {
			capturedSet.push(setArg);
			return { where: mockWhereUpd };
		});
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd as any }));

		await updateService(mockTenantDb, "s1", {
			sessionCount: 10,
			expirable: true,
			expiryDays: 60,
			schedulingType: "class_slot",
			features: ["feature1"],
			location: "Room B",
			attendanceThreshold: 3,
		});

		const setArg = capturedSet[0];
		expect(setArg.sessionCount).toBe(10);
		expect(setArg.expirable).toBe(true);
		expect(setArg.expiryDays).toBe(60);
		expect(setArg.schedulingType).toBe("class_slot");
		expect(setArg.features).toEqual(["feature1"]);
		expect(setArg.location).toBe("Room B");
		expect(setArg.attendanceThreshold).toBe(3);
	});

	test("throws 'Service not found' when update returns empty", async () => {
		const mockReturningUpd = mock(() => Promise.resolve([]));
		const mockWhereUpd = mock(() => ({ returning: mockReturningUpd }));
		const mockSetUpd = mock(() => ({ where: mockWhereUpd }));
		mockUpdate.mockImplementationOnce(() => ({ set: mockSetUpd as any }));

		await expect(
			updateService(mockTenantDb, "nonexistent", { name: "X" })
		).rejects.toThrow("Service not found");
	});
});
