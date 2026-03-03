import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
} from "../helpers/integration-setup";
import {
	createTaxRate,
	listTaxRates,
	getTaxRateById,
	getDefaultTaxRate,
	setDefaultTaxRate,
	updateTaxRate,
	deactivateTaxRate,
} from "@avantej-core/services";
import { taxRates } from "@avantej-core/db/schema/tenant/tax-rates";

const createdIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;

beforeAll(() => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
});

afterAll(async () => {
	if (shouldSkipIntegration() || createdIds.length === 0) return;
	await tenantDb.delete(taxRates).where(inArray(taxRates.id, createdIds));
});

describe("Tax Rates Integration", () => {
	test("create tax rate with correct fields", async () => {
		if (shouldSkipIntegration()) return;

		const rate = await createTaxRate(tenantDb, {
			name: "Integration Test Tax",
			code: "ITEST-TAX-" + Date.now(),
			rateInBasisPoints: 600, // 6.00%
			effectiveFrom: new Date("2026-01-01"),
			isDefault: false,
			description: "Test tax rate for integration testing",
		});
		createdIds.push(rate.id);

		expect(rate.name).toBe("Integration Test Tax");
		expect(rate.rateInBasisPoints).toBe(600);
		expect(rate.isActive).toBe(true);
		expect(rate.isDefault).toBe(false);
		expect(rate.category).toBe("SST"); // default category
	}, 30000);

	test("setDefault clears previous default", async () => {
		if (shouldSkipIntegration()) return;

		const rate1 = await createTaxRate(tenantDb, {
			name: "Default Rate 1",
			code: "DEF1-" + Date.now(),
			rateInBasisPoints: 800,
			effectiveFrom: new Date("2026-01-01"),
			isDefault: true, // first default
		});
		createdIds.push(rate1.id);

		// Verify rate1 is default
		const rate1Check = await getTaxRateById(tenantDb, rate1.id);
		expect(rate1Check?.isDefault).toBe(true);

		const rate2 = await createTaxRate(tenantDb, {
			name: "Default Rate 2",
			code: "DEF2-" + Date.now(),
			rateInBasisPoints: 900,
			effectiveFrom: new Date("2026-01-01"),
			isDefault: false,
		});
		createdIds.push(rate2.id);

		// Set rate2 as default
		const updated = await setDefaultTaxRate(tenantDb, rate2.id);
		expect(updated.isDefault).toBe(true);

		// Verify rate1 is no longer default
		const rate1Updated = await getTaxRateById(tenantDb, rate1.id);
		expect(rate1Updated?.isDefault).toBe(false);

		// Verify rate2 is now default
		const rate2Updated = await getTaxRateById(tenantDb, rate2.id);
		expect(rate2Updated?.isDefault).toBe(true);
	}, 30000);

	test("basis points stored and retrieved correctly (roundtrip)", async () => {
		if (shouldSkipIntegration()) return;

		const rate = await createTaxRate(tenantDb, {
			name: "Precision Test",
			code: "PREC-" + Date.now(),
			rateInBasisPoints: 625, // 6.25%
			effectiveFrom: new Date("2026-01-01"),
		});
		createdIds.push(rate.id);

		expect(rate.rateInBasisPoints).toBe(625);

		// Retrieve and verify roundtrip
		const retrieved = await getTaxRateById(tenantDb, rate.id);
		expect(retrieved?.rateInBasisPoints).toBe(625);
	}, 15000);

	test("deactivate tax rate sets isActive to false", async () => {
		if (shouldSkipIntegration()) return;

		const rate = await createTaxRate(tenantDb, {
			name: "Deactivate Test",
			code: "DEACT-" + Date.now(),
			rateInBasisPoints: 500,
			effectiveFrom: new Date("2026-01-01"),
			isDefault: false,
		});
		createdIds.push(rate.id);

		const deactivated = await deactivateTaxRate(tenantDb, rate.id);
		expect(deactivated.isActive).toBe(false);
	}, 15000);

	test("deactivating default tax rate clears isDefault flag", async () => {
		if (shouldSkipIntegration()) return;

		// Create a rate and set it as default
		const rate = await createTaxRate(tenantDb, {
			name: "Default-Deactivate Test",
			code: "DEFDEACT-" + Date.now(),
			rateInBasisPoints: 700,
			effectiveFrom: new Date("2026-01-01"),
			isDefault: true,
		});
		createdIds.push(rate.id);

		expect(rate.isDefault).toBe(true);

		// Deactivating a default rate should also clear isDefault
		const deactivated = await deactivateTaxRate(tenantDb, rate.id);
		expect(deactivated.isActive).toBe(false);
		expect(deactivated.isDefault).toBe(false);
	}, 30000);

	test("listTaxRates filters by isActive", async () => {
		if (shouldSkipIntegration()) return;

		const activeRate = await createTaxRate(tenantDb, {
			name: "Active List Test",
			code: "ACTLIST-" + Date.now(),
			rateInBasisPoints: 800,
			effectiveFrom: new Date("2026-01-01"),
		});
		createdIds.push(activeRate.id);

		const inactiveRate = await createTaxRate(tenantDb, {
			name: "Inactive List Test",
			code: "INACTLIST-" + Date.now(),
			rateInBasisPoints: 800,
			effectiveFrom: new Date("2026-01-01"),
		});
		createdIds.push(inactiveRate.id);
		await deactivateTaxRate(tenantDb, inactiveRate.id);

		// Active filter
		const activeList = await listTaxRates(tenantDb, { isActive: true });
		expect(activeList.some((r) => r.id === activeRate.id)).toBe(true);
		expect(activeList.some((r) => r.id === inactiveRate.id)).toBe(false);
	}, 30000);

	test("update tax rate changes mutable fields", async () => {
		if (shouldSkipIntegration()) return;

		const rate = await createTaxRate(tenantDb, {
			name: "Update Test",
			code: "UPD-" + Date.now(),
			rateInBasisPoints: 600,
			effectiveFrom: new Date("2026-01-01"),
			description: "Original description",
		});
		createdIds.push(rate.id);

		const updated = await updateTaxRate(tenantDb, rate.id, {
			name: "Updated Name",
			rateInBasisPoints: 750,
			description: "Updated description",
		});

		expect(updated.name).toBe("Updated Name");
		expect(updated.rateInBasisPoints).toBe(750);
		expect(updated.description).toBe("Updated description");
		// Code should remain unchanged if not passed
		expect(updated.code).toBe(rate.code);
	}, 30000);
});
