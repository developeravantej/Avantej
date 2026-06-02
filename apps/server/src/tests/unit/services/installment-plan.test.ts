import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeInstallmentPlan } from "../../helpers/fixtures";

import {
	listInstallmentPlans,
	getInstallmentPlanById,
	getInstallmentPlanByCode,
	createInstallmentPlan,
	updateInstallmentPlan,
	setDefaultInstallmentPlan,
	deactivateInstallmentPlan,
} from "@avantej-core/services/installment-plan.service";

let mockDb: ReturnType<typeof createMockTenantDb>;

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listInstallmentPlans ────────────────────────────────────────────────────
describe("listInstallmentPlans", () => {
	test("returns all plans ordered by sortOrder", async () => {
		const plans = [
			makeInstallmentPlan({ code: "full", sortOrder: 0 }),
			makeInstallmentPlan({ code: "half", sortOrder: 10 }),
		];
		mockDb.query.installmentPlans.findMany.mockResolvedValueOnce(plans);

		const result = await listInstallmentPlans(mockDb, {});

		expect(result as any).toEqual(plans);
		expect(mockDb.query.installmentPlans.findMany).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no plans exist", async () => {
		mockDb.query.installmentPlans.findMany.mockResolvedValueOnce([]);

		const result = await listInstallmentPlans(mockDb, {});

		expect(result).toEqual([]);
	});

	test("filters by activeOnly", async () => {
		const active = [makeInstallmentPlan({ isActive: true })];
		mockDb.query.installmentPlans.findMany.mockResolvedValueOnce(active);

		const result = await listInstallmentPlans(mockDb, { activeOnly: true });

		expect(result).toHaveLength(1);
		expect(result[0]?.isActive).toBe(true);
	});
});

// ─── getInstallmentPlanById ──────────────────────────────────────────────────
describe("getInstallmentPlanById", () => {
	test("returns plan when found", async () => {
		const plan = makeInstallmentPlan();
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(plan);

		const result = await getInstallmentPlanById(mockDb, plan.id as string);

		expect(result as any).toEqual(plan);
	});

	test("returns undefined when not found", async () => {
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(undefined);

		const result = await getInstallmentPlanById(mockDb, "nonexistent-id");

		expect(result).toBeUndefined();
	});
});

// ─── getInstallmentPlanByCode ────────────────────────────────────────────────
describe("getInstallmentPlanByCode", () => {
	test("returns plan when found by code", async () => {
		const plan = makeInstallmentPlan({ code: "quarterly" });
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(plan);

		const result = await getInstallmentPlanByCode(mockDb, "quarterly");

		expect(result as any).toEqual(plan);
		expect(result?.code).toBe("quarterly");
	});

	test("returns null when plan not found", async () => {
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(undefined);

		const result = await getInstallmentPlanByCode(mockDb, "unknown_code");

		expect(result).toBeNull();
	});
});

// ─── createInstallmentPlan ───────────────────────────────────────────────────
describe("createInstallmentPlan", () => {
	test("creates plan with correct fields", async () => {
		const created = makeInstallmentPlan({
			code: "monthly_6",
			name: "Monthly (6 payments)",
			numInstallments: 6,
			defaultIntervalDays: 30,
			isDefault: false,
		});

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const insertValues = {
				returning: mock(() => Promise.resolve([created])),
			};
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });
			return cb(tx);
		});

		const result = await createInstallmentPlan(mockDb, {
			code: "monthly_6",
			name: "Monthly (6 payments)",
			numInstallments: 6,
			defaultIntervalDays: 30,
		});

		expect(result.code).toBe("monthly_6");
		expect(result.numInstallments).toBe(6);
	});

	test("rejects numInstallments < 1", async () => {
		await expect(
			createInstallmentPlan(mockDb, {
				code: "bad",
				name: "Bad Plan",
				numInstallments: 0,
			}),
		).rejects.toThrow("numInstallments must be >= 1");
	});

	test("rejects numInstallments = 0 (edge case)", async () => {
		await expect(
			createInstallmentPlan(mockDb, {
				code: "bad",
				name: "Bad Plan",
				numInstallments: 0,
			}),
		).rejects.toThrow("numInstallments must be >= 1");
	});

	test("clears existing default when creating with isDefault=true", async () => {
		const created = makeInstallmentPlan({ isDefault: true, code: "half" });

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

			// Insert new plan
			const insertValues = {
				returning: mock(() => Promise.resolve([created])),
			};
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

			return cb(tx);
		});

		const result = await createInstallmentPlan(mockDb, {
			code: "half",
			name: "Half (2 installments)",
			numInstallments: 2,
			isDefault: true,
		});

		expect(result.isDefault).toBe(true);
		expect(updateCalled).toBe(true);
	});

	test("does NOT clear defaults when isDefault is false", async () => {
		const created = makeInstallmentPlan({
			isDefault: false,
			code: "quarterly",
		});

		let updateCalled = false;
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();

			// Override update to track if called
			tx.update.mockReturnValueOnce({
				set: mock(() => ({
					where: mock(() => {
						updateCalled = true;
						return Promise.resolve();
					}),
				})),
			});

			const insertValues = {
				returning: mock(() => Promise.resolve([created])),
			};
			tx.insert.mockReturnValueOnce({ values: mock(() => insertValues) });

			return cb(tx);
		});

		await createInstallmentPlan(mockDb, {
			code: "quarterly",
			name: "Quarterly (4 installments)",
			numInstallments: 4,
			isDefault: false,
		});

		// update should NOT have been called (no isDefault to clear)
		expect(updateCalled).toBe(false);
	});
});

// ─── updateInstallmentPlan ───────────────────────────────────────────────────
describe("updateInstallmentPlan", () => {
	test("updates mutable fields (name, numInstallments, description)", async () => {
		const updated = makeInstallmentPlan({
			name: "Updated Name",
			numInstallments: 3,
			description: "Updated description",
		});
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([updated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await updateInstallmentPlan(mockDb, updated.id as string, {
			name: "Updated Name",
			numInstallments: 3,
			description: "Updated description",
		});

		expect(result.name).toBe("Updated Name");
		expect(result.numInstallments).toBe(3);
	});

	test("throws when plan not found", async () => {
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await expect(
			updateInstallmentPlan(mockDb, "nonexistent", { name: "x" }),
		).rejects.toThrow("Installment plan not found");
	});

	test("rejects numInstallments < 1 on update", async () => {
		await expect(
			updateInstallmentPlan(mockDb, "some-id", { numInstallments: 0 }),
		).rejects.toThrow("numInstallments must be >= 1");
	});

	test("code field cannot be passed (type-level immutability guard)", () => {
		// The function signature uses `code?: never` which prevents passing code at the type level.
		// This test documents the invariant via a runtime no-op — the real enforcement is in TS.
		// Calling updateInstallmentPlan(db, id, { code: "x" }) is a compile-time error.
		expect(typeof updateInstallmentPlan).toBe("function");
	});
});

// ─── setDefaultInstallmentPlan ───────────────────────────────────────────────
describe("setDefaultInstallmentPlan", () => {
	test("clears all defaults then sets one as default (two updates in tx)", async () => {
		const plan = makeInstallmentPlan({ isDefault: true });

		let updateCount = 0;
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();

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

			// Second update: set specific plan as default
			const setDefaultChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([plan])),
				})),
			};
			tx.update.mockReturnValueOnce({
				set: mock(() => setDefaultChain),
			});

			return cb(tx);
		});

		const result = await setDefaultInstallmentPlan(mockDb, plan.id as string);

		expect(result.isDefault).toBe(true);
		expect(updateCount).toBe(1); // clear-all update happened
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
	});

	test("throws when plan not found", async () => {
		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
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
			setDefaultInstallmentPlan(mockDb, "nonexistent"),
		).rejects.toThrow("Installment plan not found");
	});
});

// ─── deactivateInstallmentPlan ───────────────────────────────────────────────
describe("deactivateInstallmentPlan", () => {
	test("deactivates a non-default plan", async () => {
		const plan = makeInstallmentPlan({ isDefault: false, isActive: true });
		const deactivated = { ...plan, isActive: false };
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(plan);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateInstallmentPlan(mockDb, plan.id as string);

		expect(result.isActive).toBe(false);
	});

	test("deactivates a default plan and silently clears isDefault", async () => {
		const plan = makeInstallmentPlan({ isDefault: true, isActive: true });
		const deactivated = { ...plan, isActive: false, isDefault: false };
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(plan);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateInstallmentPlan(mockDb, plan.id as string);

		expect(result.isActive).toBe(false);
		expect(result.isDefault).toBe(false);
	});

	test("throws when plan not found", async () => {
		mockDb.query.installmentPlans.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			deactivateInstallmentPlan(mockDb, "nonexistent"),
		).rejects.toThrow("Installment plan not found");
	});
});
