import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";

import {
	getCategoryCommissionConfig,
	upsertCategoryCommissionConfig,
	deleteCategoryCommissionConfig,
	type UpsertCategoryCommissionConfigInput,
} from "@avantej-core/services/category-commission.service";

const CATEGORY_ID = "cccc-0000-4000-8000-000000000001";
const CONFIG_ID = "cfcf-0000-4000-8000-000000000001";
const TIER_ID = "tttt-0000-4000-8000-000000000001";
const _TIER_ID_2 = "tttt-0000-4000-8000-000000000002";
void _TIER_ID_2;
const CONDITION_ID = "cond-0000-4000-8000-000000000001";
const SLOT_ID = "slot-0000-4000-8000-000000000001";

const ACTOR = { userId: "user-001", id: "member-001", role: "admin" };

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: CONFIG_ID,
		categoryId: CATEGORY_ID,
		paymentType: "fixed",
		isConditional: false,
		maxCoaches: 1,
		isActive: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function makeSlot(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: SLOT_ID,
		configId: CONFIG_ID,
		slotIndex: 0,
		label: "Primary",
		weightageBasisPoints: 10000,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function makeRate(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "rate-0001",
		configId: CONFIG_ID,
		trainerTierId: TIER_ID,
		amount: 5000,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function makeCondition(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: CONDITION_ID,
		configId: CONFIG_ID,
		conditionIndex: 0,
		operator: "gte",
		threshold: 0,
		thresholdMax: null,
		label: "Default",
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function makeConditionRate(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: "crate-001",
		conditionId: CONDITION_ID,
		trainerTierId: TIER_ID,
		amount: 3000,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

/**
 * Chainable select mock that resolves to `value` when awaited.
 */
function selectChainResolving(value: unknown) {
	const chain: Record<string, unknown> = {};
	for (const m of [
		"from",
		"where",
		"orderBy",
		"limit",
		"offset",
		"leftJoin",
		"innerJoin",
		"groupBy",
		"having",
	]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(value).then(resolve);
	return chain;
}

/**
 * Insert chain that resolves `.returning()` to `value`.
 * Also supports `.values()` without a `.returning()` call (void inserts).
 */
function _insertChainReturning(value: unknown) {
	const returningMock = mock(() => Promise.resolve(value));
	const voidResolveMock = mock(() => Promise.resolve(undefined));
	const valuesMock = mock(() => ({
		returning: returningMock,
		// allows bare insert().values() without .returning()
		then: (resolve: (v: unknown) => unknown) =>
			Promise.resolve(undefined).then(resolve),
	}));
	// some inserts don't call .returning() — expose a chainable values mock
	const insertMock = mock(() => ({ values: valuesMock, returning: mock(() => Promise.resolve(value)) }));
	return { insertMock, valuesMock, returningMock, voidResolveMock };
}
void _insertChainReturning;

/**
 * Delete chain that supports `.where().returning()` (the factory default only supports `.where()` as a terminal).
 */
function deleteChainReturning(value: unknown) {
	const returningMock = mock(() => Promise.resolve(value));
	const whereMock = mock(() => ({ returning: returningMock }));
	return mock(() => ({ where: whereMock }));
}

let mockDb: ReturnType<typeof createMockTenantDb>;

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── getCategoryCommissionConfig ─────────────────────────────────────────────
describe("getCategoryCommissionConfig", () => {
	test("returns null when no config found for category", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getCategoryCommissionConfig(mockDb, CATEGORY_ID);

		expect(result).toBeNull();
	});

	test("returns config with slots and rates for non-conditional config", async () => {
		const config = makeConfig({ isConditional: false });
		const slot = makeSlot();
		const rate = makeRate();

		// 1st select: config lookup
		mockDb.select.mockReturnValueOnce(selectChainResolving([config]));
		// 2nd select: slots
		mockDb.select.mockReturnValueOnce(selectChainResolving([slot]));
		// 3rd select: rates (non-conditional path)
		mockDb.select.mockReturnValueOnce(selectChainResolving([rate]));

		const result = await getCategoryCommissionConfig(mockDb, CATEGORY_ID);

		expect(result).not.toBeNull();
		expect(result!.config).toEqual(config);
		expect(result!.slots).toEqual([slot]);
		expect(result!.rates).toEqual([rate]);
		expect(result!.conditions).toBeUndefined();
	});

	test("returns config with slots and conditions for conditional config", async () => {
		const config = makeConfig({ isConditional: true });
		const slot = makeSlot();
		const condition = makeCondition();
		const condRate = makeConditionRate();

		// 1st select: config
		mockDb.select.mockReturnValueOnce(selectChainResolving([config]));
		// 2nd select: slots
		mockDb.select.mockReturnValueOnce(selectChainResolving([slot]));
		// 3rd select: conditions
		mockDb.select.mockReturnValueOnce(selectChainResolving([condition]));
		// 4th select: condition rates (one per condition via Promise.all)
		mockDb.select.mockReturnValueOnce(selectChainResolving([condRate]));

		const result = await getCategoryCommissionConfig(mockDb, CATEGORY_ID);

		expect(result).not.toBeNull();
		expect(result!.conditions).toHaveLength(1);
		expect(result!.conditions![0]!.condition).toEqual(condition);
		expect(result!.conditions![0]!.rates).toEqual([condRate]);
		expect(result!.rates).toBeUndefined();
	});

	test("returns config with empty slots array when no slots exist", async () => {
		const config = makeConfig({ isConditional: false });

		mockDb.select.mockReturnValueOnce(selectChainResolving([config]));
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // no slots
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // no rates

		const result = await getCategoryCommissionConfig(mockDb, CATEGORY_ID);

		expect(result!.slots).toEqual([]);
		expect(result!.rates).toEqual([]);
	});
});

// ─── upsertCategoryCommissionConfig — validation ─────────────────────────────
describe("upsertCategoryCommissionConfig — validation errors (no DB needed)", () => {
	test("throws BAD_REQUEST when slot weightages do not sum to 10000", async () => {
		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: false,
			maxCoaches: 1,
			slots: [
				{ slotIndex: 0, label: "Primary", weightageBasisPoints: 6000 },
				{ slotIndex: 1, label: "Secondary", weightageBasisPoints: 3000 }, // sum = 9000
			],
			rates: [{ trainerTierId: TIER_ID, amount: 5000 }],
		};

		await expect(
			upsertCategoryCommissionConfig(mockDb, input, ACTOR),
		).rejects.toThrow("Slot weightages must sum to 10000");
	});

	test("throws when single slot weightage is not 10000", async () => {
		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: false,
			maxCoaches: 1,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 5000 }],
			rates: [{ trainerTierId: TIER_ID, amount: 5000 }],
		};

		await expect(
			upsertCategoryCommissionConfig(mockDb, input, ACTOR),
		).rejects.toThrow("Slot weightages must sum to 10000");
	});

	test("throws when conditional config has no conditions", async () => {
		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: true,
			maxCoaches: 1,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			conditions: [],
		};

		await expect(
			upsertCategoryCommissionConfig(mockDb, input, ACTOR),
		).rejects.toThrow("Conditional config requires at least one condition");
	});

	test("throws when non-conditional config has no rates", async () => {
		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: false,
			maxCoaches: 1,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			rates: [],
		};

		await expect(
			upsertCategoryCommissionConfig(mockDb, input, ACTOR),
		).rejects.toThrow("Non-conditional config requires rates");
	});

	test("throws when two conditions overlap (same eq threshold)", async () => {
		// Two `eq 5` conditions → both map to [5, 6] — overlap
		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: true,
			maxCoaches: 1,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			conditions: [
				{
					conditionIndex: 0,
					operator: "eq",
					threshold: 5,
					label: "Exactly 5",
					rates: [{ trainerTierId: TIER_ID, amount: 5000 }],
				},
				{
					conditionIndex: 1,
					operator: "eq",
					threshold: 5,
					label: "Also 5",
					rates: [{ trainerTierId: TIER_ID, amount: 4000 }],
				},
			],
		};

		await expect(
			upsertCategoryCommissionConfig(mockDb, input, ACTOR),
		).rejects.toThrow("Conditions overlap");
	});

	test("throws when lt and gt conditions overlap (lt 10 and gte 5 share [5,10))", async () => {
		// lt 10 → [0, 10), gte 5 → [5, ∞) → overlap at [5, 10)
		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: true,
			maxCoaches: 1,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			conditions: [
				{
					conditionIndex: 0,
					operator: "lt",
					threshold: 10,
					label: "Under 10",
					rates: [{ trainerTierId: TIER_ID, amount: 5000 }],
				},
				{
					conditionIndex: 1,
					operator: "gte",
					threshold: 5,
					label: "5 or more",
					rates: [{ trainerTierId: TIER_ID, amount: 4000 }],
				},
			],
		};

		await expect(
			upsertCategoryCommissionConfig(mockDb, input, ACTOR),
		).rejects.toThrow("Conditions overlap");
	});

	test("accepts non-overlapping conditions (lt 5 and gte 5)", async () => {
		// lt 5 → [0, 5), gte 5 → [5, ∞) — no overlap (adjacent but not overlapping)
		// The transaction will be invoked, so we need to stub it.
		const config = makeConfig({ isConditional: true });
		const condition = makeCondition();

		// Build a tx mock that handles all nested inserts/selects inside the transaction
		const _txInsert = mock((_table: unknown) => ({
			values: mock(() => ({
				returning: mock(() => Promise.resolve([condition])),
				then: (resolve: (v: unknown) => unknown) =>
					Promise.resolve(undefined).then(resolve),
			})),
		}));
		void _txInsert;

		const txDelete = mock(() => ({
			where: mock(() => Promise.resolve([])),
		}));

		const txSelect = mock(() => selectChainResolving([]));

		const tx = {
			delete: txDelete,
			insert: mock(() => ({
				values: mock(() => ({
					returning: mock(() => Promise.resolve([config])),
				})),
			})),
			select: txSelect,
			transaction: mock((cb: (t: unknown) => unknown) => cb({})),
		};

		// Override the first insert call to return the config, and subsequent inserts for conditions/rates
		let insertCallCount = 0;
		tx.insert = mock(() => {
			insertCallCount++;
			if (insertCallCount === 1) {
				// config insert
				return {
					values: mock(() => ({
						returning: mock(() => Promise.resolve([config])),
					})),
				};
			}
			if (insertCallCount === 2) {
				// slots insert (void)
				return {
					values: mock(() => ({
						returning: mock(() => Promise.resolve([])),
						then: (resolve: (v: unknown) => unknown) =>
							Promise.resolve(undefined).then(resolve),
					})),
				};
			}
			// condition insert
			return {
				values: mock(() => ({
					returning: mock(() => Promise.resolve([condition])),
				})),
			};
		}) as any;

		mockDb.transaction = mock((cb: (tx: unknown) => Promise<unknown>) =>
			cb(tx),
		) as any;

		// After transaction, getCategoryCommissionConfig is called with tx:
		// It needs to do 3+ selects. Stub them on tx.
		txSelect.mockReturnValue(selectChainResolving([]));

		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: true,
			maxCoaches: 2,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			conditions: [
				{
					conditionIndex: 0,
					operator: "lt",
					threshold: 5,
					label: "Under 5",
					rates: [{ trainerTierId: TIER_ID, amount: 5000 }],
				},
				{
					conditionIndex: 1,
					operator: "gte",
					threshold: 5,
					label: "5 or more",
					rates: [{ trainerTierId: TIER_ID, amount: 4000 }],
				},
			],
		};

		// Should not throw — validation passes and transaction is called
		await upsertCategoryCommissionConfig(mockDb, input, ACTOR);

		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
	});
});

// ─── upsertCategoryCommissionConfig — non-conditional ────────────────────────
describe("upsertCategoryCommissionConfig — non-conditional save", () => {
	test("saves non-conditional config inside a transaction", async () => {
		const config = makeConfig({ isConditional: false });

		const txInsertCalls: unknown[] = [];
		let callIdx = 0;

		const txInsert = mock(() => {
			callIdx++;
			const call = callIdx;
			txInsertCalls.push(call);
			return {
				values: mock(() => ({
					returning: mock(() =>
						Promise.resolve(call === 1 ? [config] : []),
					),
					then: (resolve: (v: unknown) => unknown) =>
						Promise.resolve(undefined).then(resolve),
				})),
			};
		});

		const txDelete = mock(() => ({
			where: mock(() => Promise.resolve([])),
		}));

		// After transaction, getCategoryCommissionConfig runs select on tx
		const txSelect = mock(() => selectChainResolving([]));

		const tx = {
			delete: txDelete,
			insert: txInsert,
			select: txSelect,
		};

		mockDb.transaction = mock((cb: (tx: unknown) => Promise<unknown>) =>
			cb(tx),
		) as any;

		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: false,
			maxCoaches: 1,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			rates: [{ trainerTierId: TIER_ID, amount: 5000 }],
		};

		await upsertCategoryCommissionConfig(mockDb, input, ACTOR);

		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		// delete existing + insert config + insert slots + insert rates = 3 inserts (delete is separate)
		expect(txDelete).toHaveBeenCalledTimes(1);
		// At least one insert call for the config row
		expect(txInsert).toHaveBeenCalled();
	});
});

// ─── upsertCategoryCommissionConfig — conditional ────────────────────────────
describe("upsertCategoryCommissionConfig — conditional save", () => {
	test("saves conditional config with conditions inside a transaction", async () => {
		const config = makeConfig({ isConditional: true });
		const condition = makeCondition();

		let callIdx = 0;

		const txInsert = mock(() => {
			callIdx++;
			const call = callIdx;
			return {
				values: mock(() => ({
					returning: mock(() =>
						call === 1
							? Promise.resolve([config])
							: Promise.resolve([condition]),
					),
					then: (resolve: (v: unknown) => unknown) =>
						Promise.resolve(undefined).then(resolve),
				})),
			};
		});

		const txDelete = mock(() => ({
			where: mock(() => Promise.resolve([])),
		}));

		const txSelect = mock(() => selectChainResolving([]));

		const tx = {
			delete: txDelete,
			insert: txInsert,
			select: txSelect,
		};

		mockDb.transaction = mock((cb: (tx: unknown) => Promise<unknown>) =>
			cb(tx),
		) as any;

		const input: UpsertCategoryCommissionConfigInput = {
			categoryId: CATEGORY_ID,
			paymentType: "fixed",
			isConditional: true,
			maxCoaches: 2,
			slots: [{ slotIndex: 0, label: "Primary", weightageBasisPoints: 10000 }],
			conditions: [
				{
					conditionIndex: 0,
					operator: "gte",
					threshold: 0,
					label: "All",
					rates: [{ trainerTierId: TIER_ID, amount: 4000 }],
				},
			],
		};

		await upsertCategoryCommissionConfig(mockDb, input, ACTOR);

		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
		expect(txDelete).toHaveBeenCalledTimes(1);
		// config insert + slots insert + condition insert + condition rate insert ≥ 3
		expect(txInsert.mock.calls.length).toBeGreaterThanOrEqual(3);
	});
});

// ─── deleteCategoryCommissionConfig ──────────────────────────────────────────
describe("deleteCategoryCommissionConfig", () => {
	test("deletes config and returns { deleted: true }", async () => {
		const deletedConfig = makeConfig();
		// Override delete to support .where().returning()
		mockDb.delete = deleteChainReturning([deletedConfig]) as any;

		const result = await deleteCategoryCommissionConfig(mockDb, CATEGORY_ID);

		expect(result).toEqual({ deleted: true });
		expect(mockDb.delete).toHaveBeenCalledTimes(1);
	});

	test("throws when no config found for category", async () => {
		// delete returns empty array → 0 deleted rows
		mockDb.delete = deleteChainReturning([]) as any;

		await expect(
			deleteCategoryCommissionConfig(mockDb, "nonexistent-category"),
		).rejects.toThrow("No commission config found for this category");
	});
});
