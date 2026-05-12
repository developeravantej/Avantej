import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeTaxRate } from "../../helpers/fixtures";

import {
	listTaxRates,
	getTaxRateById,
	getDefaultTaxRate,
	createTaxRate,
	updateTaxRate,
	setDefaultTaxRate,
	deactivateTaxRate,
} from "@avantej-core/services/tax-rates.service";

let mockDb: ReturnType<typeof createMockTenantDb>;

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listTaxRates ────────────────────────────────────────────────────────────
describe("listTaxRates", () => {
	test("returns tax rates via query.taxRates.findMany", async () => {
		const rates = [makeTaxRate(), makeTaxRate()];
		mockDb.query.taxRates.findMany.mockResolvedValueOnce(rates);

		const result = await listTaxRates(mockDb, {});

		expect(result).toEqual(rates);
		expect(mockDb.query.taxRates.findMany).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no rates exist", async () => {
		mockDb.query.taxRates.findMany.mockResolvedValueOnce([]);

		const result = await listTaxRates(mockDb, {});

		expect(result).toEqual([]);
	});

	test("filters by isActive", async () => {
		const active = [makeTaxRate({ isActive: true })];
		mockDb.query.taxRates.findMany.mockResolvedValueOnce(active);

		const result = await listTaxRates(mockDb, { isActive: true });

		expect(result).toHaveLength(1);
	});
});

// ─── getTaxRateById ──────────────────────────────────────────────────────────
describe("getTaxRateById", () => {
	test("returns tax rate when found", async () => {
		const rate = makeTaxRate();
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(rate);

		const result = await getTaxRateById(mockDb, rate.id);

		expect(result).toEqual(rate);
	});

	test("returns undefined when not found", async () => {
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(undefined);

		const result = await getTaxRateById(mockDb, "nonexistent");

		expect(result).toBeUndefined();
	});
});

// ─── getDefaultTaxRate ───────────────────────────────────────────────────────
describe("getDefaultTaxRate", () => {
	test("returns the default active tax rate", async () => {
		const rate = makeTaxRate({ isDefault: true, isActive: true });
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(rate);

		const result = await getDefaultTaxRate(mockDb);

		expect(result).toEqual(rate);
		expect(result!.isDefault).toBe(true);
	});

	test("returns undefined when no default exists", async () => {
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(undefined);

		const result = await getDefaultTaxRate(mockDb);

		expect(result).toBeUndefined();
	});
});

// ─── createTaxRate ───────────────────────────────────────────────────────────
describe("createTaxRate", () => {
	test("creates tax rate with correct basis points (800 = 8.00%)", async () => {
		const created = makeTaxRate({ rateInBasisPoints: 800 });

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const insertValues = {
				returning: mock(() => Promise.resolve([created])),
			};
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });
			return cb(tx);
		});

		const result = await createTaxRate(mockDb, {
			name: "SST 8%",
			code: "SST08",
			rateInBasisPoints: 800,
			effectiveFrom: new Date("2026-01-01"),
		});

		expect(result.rateInBasisPoints).toBe(800);
	});

	test("allows zero rate (0 basis points = tax exempt)", async () => {
		const created = makeTaxRate({ rateInBasisPoints: 0 });

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const insertValues = {
				returning: mock(() => Promise.resolve([created])),
			};
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });
			return cb(tx);
		});

		const result = await createTaxRate(mockDb, {
			name: "Tax Exempt",
			code: "EXEMPT",
			rateInBasisPoints: 0,
			effectiveFrom: new Date("2026-01-01"),
		});

		expect(result.rateInBasisPoints).toBe(0);
	});

	test("clears existing default when creating with isDefault=true", async () => {
		const created = makeTaxRate({
			isDefault: true,
			rateInBasisPoints: 600,
		});

		let updateCalled = false;
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();

			// First update: clear all defaults
			const clearSetChain = {
				where: mock(() => {
					updateCalled = true;
					return Promise.resolve();
				}),
			};
			tx.update.mockReturnValueOnce({
				set: mock(() => clearSetChain),
			});

			// Insert new rate
			const insertValues = {
				returning: mock(() => Promise.resolve([created])),
			};
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

			return cb(tx);
		});

		const result = await createTaxRate(mockDb, {
			name: "SST 6%",
			code: "SST06",
			rateInBasisPoints: 600,
			isDefault: true,
			effectiveFrom: new Date("2026-01-01"),
		});

		expect(result.isDefault).toBe(true);
		expect(updateCalled).toBe(true);
	});
});

// ─── updateTaxRate ───────────────────────────────────────────────────────────
describe("updateTaxRate", () => {
	test("updates mutable fields", async () => {
		const updated = makeTaxRate({ name: "Updated SST" });
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([updated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await updateTaxRate(mockDb, updated.id, {
			name: "Updated SST",
		});

		expect(result.name).toBe("Updated SST");
	});

	test("throws when tax rate not found", async () => {
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(
			updateTaxRate(mockDb, "nonexistent", { name: "x" }),
		).rejects.toThrow("Tax rate not found");
	});
});

// ─── setDefaultTaxRate ───────────────────────────────────────────────────────
describe("setDefaultTaxRate", () => {
	const actor = {
		userId: "user-1",
		memberId: "member-1",
		role: "admin",
	};

	test("clears all defaults then sets one as default (two updates)", async () => {
		const rate = makeTaxRate({ isDefault: true });

		let updateCount = 0;
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();

			// query previous default
			tx.query.taxRates.findFirst.mockResolvedValueOnce({ id: "old-default" });

			// First update: clear all isDefault
			const clearSetChain = {
				where: mock(() => {
					updateCount++;
					return Promise.resolve();
				}),
			};
			tx.update.mockReturnValueOnce({
				set: mock(() => clearSetChain),
			});

			// Second update: set specific rate as default
			const setDefaultChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([rate])),
				})),
			};
			tx.update.mockReturnValueOnce({
				set: mock(() => setDefaultChain),
			});

			// writeAudit insert
			const _auditValuesChain = {
				returning: mock(() => Promise.resolve([])),
			};
			void _auditValuesChain;
			tx.insert.mockReturnValueOnce({
				values: mock(() => Promise.resolve()),
			});

			return cb(tx);
		});

		const result = await setDefaultTaxRate(mockDb, rate.id, actor);

		expect(result.isDefault).toBe(true);
		expect(updateCount).toBe(1); // first update happened
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
	});

	test("throws when tax rate not found", async () => {
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			tx.query.taxRates.findFirst.mockResolvedValueOnce(undefined);
			const clearSetChain = {
				where: mock(() => Promise.resolve()),
			};
			tx.update.mockReturnValueOnce({
				set: mock(() => clearSetChain),
			});
			const setDefaultChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([])),
				})),
			};
			tx.update.mockReturnValueOnce({
				set: mock(() => setDefaultChain),
			});
			return cb(tx);
		});

		await expect(
			setDefaultTaxRate(mockDb, "nonexistent", actor),
		).rejects.toThrow("Tax rate not found");
	});
});

// ─── deactivateTaxRate ───────────────────────────────────────────────────────
describe("deactivateTaxRate", () => {
	test("deactivates a non-default tax rate", async () => {
		const rate = makeTaxRate({ isDefault: false, isActive: true });
		const deactivated = { ...rate, isActive: false };
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(rate);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateTaxRate(mockDb, rate.id);

		expect(result.isActive).toBe(false);
	});

	test("deactivates a default tax rate and also clears isDefault", async () => {
		// The service code: if existing.isDefault, also sets isDefault: false
		const rate = makeTaxRate({ isDefault: true, isActive: true });
		const deactivated = { ...rate, isActive: false, isDefault: false };
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(rate);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateTaxRate(mockDb, rate.id);

		expect(result.isActive).toBe(false);
		expect(result.isDefault).toBe(false);
	});

	test("throws when tax rate not found", async () => {
		mockDb.query.taxRates.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			deactivateTaxRate(mockDb, "nonexistent"),
		).rejects.toThrow("Tax rate not found");
	});
});
