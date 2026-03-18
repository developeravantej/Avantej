import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeWalkInCustomer } from "../../helpers/fixtures";

import {
	listWalkInCustomers,
	getWalkInCustomerById,
	createWalkInCustomer,
	updateWalkInCustomer,
	deactivateWalkInCustomer,
} from "@avantej-core/services/walk-in-customers.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";

function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where", "orderBy", "limit", "offset", "leftJoin", "innerJoin", "groupBy", "having"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listWalkInCustomers ─────────────────────────────────────────────────────
describe("listWalkInCustomers", () => {
	test("returns walk-in customers from select chain", async () => {
		const customers = [makeWalkInCustomer(), makeWalkInCustomer()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(customers));

		const result = await listWalkInCustomers(mockDb, {});

		expect(result).toEqual(customers);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no customers exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await listWalkInCustomers(mockDb, {});

		expect(result).toEqual([]);
	});

	test("filters by search term", async () => {
		const customer = makeWalkInCustomer({ name: "Jane Doe" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([customer]));

		const result = await listWalkInCustomers(mockDb, { search: "Jane" });

		expect(result).toHaveLength(1);
	});
});

// ─── getWalkInCustomerById ───────────────────────────────────────────────────
describe("getWalkInCustomerById", () => {
	test("returns customer when found", async () => {
		const customer = makeWalkInCustomer();
		mockDb.select.mockReturnValueOnce(selectChainResolving([customer]));

		const result = await getWalkInCustomerById(mockDb, customer.id);

		expect(result).toEqual(customer);
	});

	test("returns undefined when not found", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getWalkInCustomerById(mockDb, "nonexistent");

		expect(result).toBeUndefined();
	});
});

// ─── createWalkInCustomer ────────────────────────────────────────────────────
describe("createWalkInCustomer", () => {
	test("creates customer with all optional fields omitted", async () => {
		const customer = makeWalkInCustomer({
			email: null,
			phone: null,
			dateOfBirth: null,
			gender: null,
			emergencyContactName: null,
			emergencyContactPhone: null,
			medicalNotes: null,
			notes: null,
			isActive: true,
		});
		const insertValues = { returning: mock(() => Promise.resolve([customer])) };
		mockDb.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

		const result = await createWalkInCustomer(mockDb, {
			name: "Jane Doe",
			createdBy: MEMBER_ID,
		});

		expect(result.name).toBe("Jane Doe");
		expect(result.isActive).toBe(true);
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});

	test("creates customer with emergency contact fields", async () => {
		const customer = makeWalkInCustomer({
			emergencyContactName: "John Doe",
			emergencyContactPhone: "+60198765432",
		});
		const insertValues = { returning: mock(() => Promise.resolve([customer])) };
		mockDb.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

		const result = await createWalkInCustomer(mockDb, {
			name: "Jane Doe",
			createdBy: MEMBER_ID,
			emergencyContactName: "John Doe",
			emergencyContactPhone: "+60198765432",
		});

		expect(result.emergencyContactName).toBe("John Doe");
		expect(result.emergencyContactPhone).toBe("+60198765432");
	});

	test("throws when insert returns no rows", async () => {
		const insertValues = { returning: mock(() => Promise.resolve([])) };
		mockDb.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

		await expect(
			createWalkInCustomer(mockDb, { name: "fail", createdBy: MEMBER_ID }),
		).rejects.toThrow("Failed to create walk-in customer");
	});
});

// ─── updateWalkInCustomer ────────────────────────────────────────────────────
describe("updateWalkInCustomer", () => {
	test("partial update (only name changed)", async () => {
		const updated = makeWalkInCustomer({ name: "Updated Name" });
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([updated])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await updateWalkInCustomer(mockDb, updated.id, { name: "Updated Name" });

		expect(result.name).toBe("Updated Name");
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("throws when customer not found", async () => {
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(
			updateWalkInCustomer(mockDb, "nonexistent", { name: "x" }),
		).rejects.toThrow("Walk-in customer not found");
	});
});

// ─── deactivateWalkInCustomer ────────────────────────────────────────────────
describe("deactivateWalkInCustomer", () => {
	test("sets isActive=false", async () => {
		const deactivated = makeWalkInCustomer({ isActive: false });
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([deactivated])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateWalkInCustomer(mockDb, deactivated.id);

		expect(result.isActive).toBe(false);
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("throws when customer not found", async () => {
		const setChain = { where: mock(() => ({ returning: mock(() => Promise.resolve([])) })) };
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(deactivateWalkInCustomer(mockDb, "nonexistent")).rejects.toThrow("Walk-in customer not found");
	});
});
