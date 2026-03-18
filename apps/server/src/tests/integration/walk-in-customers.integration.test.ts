import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	createWalkInCustomer,
	listWalkInCustomers,
	getWalkInCustomerById,
	updateWalkInCustomer,
	deactivateWalkInCustomer,
} from "@avantej-core/services";
import { walkInCustomers } from "@avantej-core/db/schema/tenant/walk-in-customers";

const createdIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdIds.length === 0) return;
	await tenantDb
		.delete(walkInCustomers)
		.where(inArray(walkInCustomers.id, createdIds));
});

describe("Walk-in Customers Integration", () => {
	test("create with all fields -> retrieve -> update -> deactivate", async () => {
		if (shouldSkipIntegration()) return;

		// Create with full data
		const created = await createWalkInCustomer(tenantDb, {
			name: "Integration Test Customer",
			email: "itest-walkin@example.com",
			phone: "+60123456789",
			branchId: TEST_BRANCH_NODE_ID,
			dateOfBirth: new Date("1990-05-15"),
			gender: "female",
			address: "123 Test Street, KL",
			emergencyContactName: "Test Contact",
			emergencyContactPhone: "+60198765432",
			medicalNotes: "No known allergies",
			notes: "VIP customer",
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(created.id);

		expect(created.isActive).toBe(true);
		expect(created.name).toBe("Integration Test Customer");
		expect(created.email).toBe("itest-walkin@example.com");
		expect(created.phone).toBe("+60123456789");
		expect(created.emergencyContactName).toBe("Test Contact");

		// Retrieve
		const retrieved = await getWalkInCustomerById(tenantDb, created.id);
		expect(retrieved).toBeTruthy();
		expect(retrieved!.email).toBe("itest-walkin@example.com");
		expect(retrieved!.medicalNotes).toBe("No known allergies");

		// Update - only name
		const updated = await updateWalkInCustomer(tenantDb, created.id, {
			name: "Updated Customer Name",
		});
		expect(updated.name).toBe("Updated Customer Name");
		expect(updated.email).toBe("itest-walkin@example.com"); // unchanged

		// Deactivate
		const deactivated = await deactivateWalkInCustomer(tenantDb, created.id);
		expect(deactivated.isActive).toBe(false);
	}, 30000);

	test("create with minimum required fields only", async () => {
		if (shouldSkipIntegration()) return;

		const created = await createWalkInCustomer(tenantDb, {
			name: "Minimal Customer",
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(created.id);

		expect(created.name).toBe("Minimal Customer");
		expect(created.email).toBeNull();
		expect(created.phone).toBeNull();
		expect(created.emergencyContactName).toBeNull();
		expect(created.isActive).toBe(true);
		expect(created.branchId).toBeNull();
	}, 15000);

	test("search by name uses ILIKE (case-insensitive)", async () => {
		if (shouldSkipIntegration()) return;

		const uniqueName = `SearchableCustomer_${Date.now()}`;
		const created = await createWalkInCustomer(tenantDb, {
			name: uniqueName,
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(created.id);

		// Search with lowercase partial match
		const results = await listWalkInCustomers(tenantDb, {
			search: uniqueName.toLowerCase(),
		});
		expect(results.some((c) => c.id === created.id)).toBe(true);

		// Search with uppercase partial match
		const resultsUpper = await listWalkInCustomers(tenantDb, {
			search: uniqueName.toUpperCase(),
		});
		expect(resultsUpper.some((c) => c.id === created.id)).toBe(true);
	}, 15000);

	test("search by email", async () => {
		if (shouldSkipIntegration()) return;

		const uniqueEmail = `walkin-search-${Date.now()}@example.com`;
		const created = await createWalkInCustomer(tenantDb, {
			name: "Email Search Customer",
			email: uniqueEmail,
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(created.id);

		const results = await listWalkInCustomers(tenantDb, {
			search: uniqueEmail.split("@")[0],
		});
		expect(results.some((c) => c.id === created.id)).toBe(true);
	}, 15000);

	test("listWalkInCustomers filters by isActive", async () => {
		if (shouldSkipIntegration()) return;

		const active = await createWalkInCustomer(tenantDb, {
			name: "Active Walk-in " + Date.now(),
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(active.id);

		const toDeactivate = await createWalkInCustomer(tenantDb, {
			name: "Inactive Walk-in " + Date.now(),
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(toDeactivate.id);
		await deactivateWalkInCustomer(tenantDb, toDeactivate.id);

		const activeList = await listWalkInCustomers(tenantDb, {
			isActive: true,
		});
		expect(activeList.some((c) => c.id === active.id)).toBe(true);
		expect(activeList.some((c) => c.id === toDeactivate.id)).toBe(false);
	}, 30000);

	test("listWalkInCustomers filters by accessibleNodeIds (RBAC)", async () => {
		if (shouldSkipIntegration()) return;

		const created = await createWalkInCustomer(tenantDb, {
			name: "RBAC Walk-in " + Date.now(),
			branchId: TEST_BRANCH_NODE_ID,
			createdBy: TEST_MEMBER_ID,
		});
		createdIds.push(created.id);

		// Accessible to matching branch
		const matchingList = await listWalkInCustomers(tenantDb, {
			accessibleNodeIds: [TEST_BRANCH_NODE_ID],
		});
		expect(matchingList.some((c) => c.id === created.id)).toBe(true);

		// Not accessible to non-matching branch
		const nonMatchingList = await listWalkInCustomers(tenantDb, {
			accessibleNodeIds: ["00000000-0000-4000-8000-000000000099"],
		});
		expect(nonMatchingList.some((c) => c.id === created.id)).toBe(false);
	}, 30000);
});
