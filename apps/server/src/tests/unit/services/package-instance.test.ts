import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
	listPackageInstancesForClient,
	getPackageInstanceById,
	createPackageInstance,
} from "@avantej-core/services";

// Shared mocks
const mockFindMany = mock(() => Promise.resolve([]));
const mockFindFirst = mock(() => Promise.resolve(null));
const mockReturning = mock(() => Promise.resolve([]));
const mockValues = mock(() => ({ returning: mockReturning }));
const mockInsert = mock(() => ({ values: mockValues }));

const mockTenantDb = {
	insert: mockInsert,
	query: {
		packageInstances: {
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
});

describe("listPackageInstancesForClient", () => {
	test("returns instances for a client", async () => {
		const fakeInstances = [
			{ id: "pi1", clientId: "user-1", status: "active", source: "purchased" },
			{ id: "pi2", clientId: "user-1", status: "expired", source: "assigned" },
		];
		mockFindMany.mockResolvedValueOnce(fakeInstances);

		const result = await listPackageInstancesForClient(mockTenantDb, { clientId: "user-1" });

		expect(result).toEqual(fakeInstances);
		expect(mockFindMany).toHaveBeenCalledTimes(1);
		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies status filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listPackageInstancesForClient(mockTenantDb, {
			clientId: "user-1",
			status: "active",
		});

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("applies source filter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listPackageInstancesForClient(mockTenantDb, {
			clientId: "user-1",
			source: "purchased",
		});

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.where).toBeDefined();
	});

	test("respects limit parameter", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listPackageInstancesForClient(mockTenantDb, {
			clientId: "user-1",
			limit: 10,
		});

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.limit).toBe(10);
	});

	test("defaults limit to 50", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listPackageInstancesForClient(mockTenantDb, { clientId: "user-1" });

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.limit).toBe(50);
	});

	test("clamps limit to max 200", async () => {
		mockFindMany.mockResolvedValueOnce([]);

		await listPackageInstancesForClient(mockTenantDb, {
			clientId: "user-1",
			limit: 500,
		});

		const callArg = mockFindMany.mock.calls[0][0];
		expect(callArg.limit).toBe(200);
	});
});

describe("getPackageInstanceById", () => {
	test("returns instance when found", async () => {
		const fakeInstance = { id: "pi1", clientId: "user-1", status: "active" };
		mockFindFirst.mockResolvedValueOnce(fakeInstance);

		const result = await getPackageInstanceById(mockTenantDb, "pi1");

		expect(result).toEqual(fakeInstance);
		expect(mockFindFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when not found", async () => {
		mockFindFirst.mockResolvedValueOnce(undefined);

		const result = await getPackageInstanceById(mockTenantDb, "nonexistent");

		expect(result).toBeNull();
	});
});

describe("createPackageInstance", () => {
	const baseParams = {
		serviceId: "svc-1",
		clientId: "user-1",
		source: "purchased" as const,
		creditsTotal: 10,
		startsAt: new Date("2026-04-01"),
		expiresAt: new Date("2026-07-01"),
	};

	test("creates instance with required fields and defaults", async () => {
		const fakeInstance = { id: "pi1", ...baseParams, status: "active" };
		mockReturning.mockResolvedValueOnce([fakeInstance]);

		const result = await createPackageInstance(mockTenantDb, baseParams);

		expect(result).toEqual(fakeInstance);
		expect(mockInsert).toHaveBeenCalledTimes(1);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.serviceId).toBe("svc-1");
		expect(valuesArg.clientId).toBe("user-1");
		expect(valuesArg.source).toBe("purchased");
		expect(valuesArg.creditsTotal).toBe(10);
		// Check defaults
		expect(valuesArg.status).toBe("active");
		expect(valuesArg.creditsUsed).toBe(0);
		expect(valuesArg.taxAmount).toBe(0);
		expect(valuesArg.paymentStatus).toBe("pending");
	});

	test("creates instance with all optional fields", async () => {
		const fakeInstance = { id: "pi2" };
		mockReturning.mockResolvedValueOnce([fakeInstance]);

		await createPackageInstance(mockTenantDb, {
			...baseParams,
			assignedBy: "admin-1",
			purchaseNumber: "PKG-001",
			paymentId: "pay-1",
			totalPrice: 50000,
			taxAmount: 4000,
			paymentStatus: "paid",
			paymentMethod: "card",
			eSignature: "sig-data",
			termsAgreedAt: new Date("2026-04-01T10:00:00Z"),
			creditsUsed: 2,
			status: "active",
			remark: "VIP client discount",
		});

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.assignedBy).toBe("admin-1");
		expect(valuesArg.purchaseNumber).toBe("PKG-001");
		expect(valuesArg.paymentId).toBe("pay-1");
		expect(valuesArg.totalPrice).toBe(50000);
		expect(valuesArg.taxAmount).toBe(4000);
		expect(valuesArg.paymentStatus).toBe("paid");
		expect(valuesArg.paymentMethod).toBe("card");
		expect(valuesArg.eSignature).toBe("sig-data");
		expect(valuesArg.creditsUsed).toBe(2);
		expect(valuesArg.remark).toBe("VIP client discount");
	});

	test("throws 'Failed to create package instance' when insert returns empty", async () => {
		mockReturning.mockResolvedValueOnce([]);

		await expect(
			createPackageInstance(mockTenantDb, baseParams)
		).rejects.toThrow("Failed to create package instance");
	});

	test("defaults nullable fields to null", async () => {
		const fakeInstance = { id: "pi3" };
		mockReturning.mockResolvedValueOnce([fakeInstance]);

		await createPackageInstance(mockTenantDb, baseParams);

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.assignedBy).toBeNull();
		expect(valuesArg.purchaseNumber).toBeNull();
		expect(valuesArg.paymentId).toBeNull();
		expect(valuesArg.totalPrice).toBeNull();
		expect(valuesArg.paymentMethod).toBeNull();
		expect(valuesArg.eSignature).toBeNull();
		expect(valuesArg.termsAgreedAt).toBeNull();
		expect(valuesArg.remark).toBeNull();
	});

	test("creates assigned instance with assignedBy", async () => {
		const fakeInstance = { id: "pi4", source: "assigned" };
		mockReturning.mockResolvedValueOnce([fakeInstance]);

		await createPackageInstance(mockTenantDb, {
			...baseParams,
			source: "assigned",
			assignedBy: "staff-1",
		});

		const valuesArg = mockValues.mock.calls[0][0];
		expect(valuesArg.source).toBe("assigned");
		expect(valuesArg.assignedBy).toBe("staff-1");
	});
});
