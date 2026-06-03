import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";

import {
	listTrainerTiers,
	createTrainerTier,
	updateTrainerTier,
	deactivateTrainerTier,
	reactivateTrainerTier,
	assignTierToMember,
	getConfigsMissingRateForTier,
} from "@avantej-core/services/trainer-tier.service";

const TIER_ID = "tttt-0000-4000-8000-000000000001";
const TIER_ID_2 = "tttt-0000-4000-8000-000000000002";
const MEMBER_ID = "mmmm-0000-4000-8000-000000000001";
const CATEGORY_ID = "cccc-0000-4000-8000-000000000001";
const CONFIG_ID = "cfcf-0000-4000-8000-000000000001";
const CONDITION_ID = "cond-0000-4000-8000-000000000001";

function makeTier(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: TIER_ID,
		name: "Gold",
		description: null,
		rank: 1,
		isActive: true,
		roleType: "trainer" as const,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

function makeMember(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		id: MEMBER_ID,
		userId: "user-001",
		organizationId: "org-001",
		role: "trainer",
		status: "active",
		hierarchyScopeId: "branch-001",
		trainerTierId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	};
}

/**
 * A chainable select mock that resolves to `value` when awaited.
 * All Drizzle builder methods are mock'd to return the same chain.
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
 * An insert chain that immediately resolves `.returning()` to `value`.
 */
function insertChainReturning(value: unknown) {
	const returningMock = mock(() => Promise.resolve(value));
	const valuesMock = mock(() => ({ returning: returningMock }));
	return mock(() => ({ values: valuesMock }));
}

/**
 * An update chain that resolves `.set().where().returning()` to `value`.
 */
function updateChainReturning(value: unknown) {
	const returningMock = mock(() => Promise.resolve(value));
	const whereMock = mock(() => ({ returning: returningMock }));
	const setMock = mock(() => ({ where: whereMock }));
	return mock(() => ({ set: setMock }));
}

let mockDb: ReturnType<typeof createMockTenantDb>;

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listTrainerTiers ────────────────────────────────────────────────────────
describe("listTrainerTiers", () => {
	test("returns active tiers when includeInactive=false (default)", async () => {
		const tiers = [makeTier(), makeTier({ id: TIER_ID_2, name: "Silver" })];
		// When includeInactive=false, the service calls select() twice:
		// once building an unused query, then once more for the actual filtered query.
		// Supply the same chain for both so the returned call resolves correctly.
		mockDb.select.mockReturnValue(selectChainResolving(tiers));

		const result = await listTrainerTiers(mockDb, {});

		expect(result).toEqual(tiers);
	});

	test("returns empty array when no active tiers exist", async () => {
		mockDb.select.mockReturnValue(selectChainResolving([]));

		const result = await listTrainerTiers(mockDb, {});

		expect(result).toEqual([]);
	});

	test("returns all tiers (including inactive) when includeInactive=true", async () => {
		const inactiveTier = makeTier({ id: TIER_ID_2, isActive: false });
		const activeTier = makeTier();
		// includeInactive=true uses the first query (no WHERE), so only one call needed.
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([activeTier, inactiveTier]),
		);

		const result = await listTrainerTiers(mockDb, { includeInactive: true });

		expect(result).toHaveLength(2);
	});
});

// ─── createTrainerTier ───────────────────────────────────────────────────────
describe("createTrainerTier", () => {
	test("creates a tier successfully when name is unique", async () => {
		const tier = makeTier({ name: "Gold" });

		// 1st select: duplicate-name check → empty (name is unique)
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));
		// insert returns the new tier
		mockDb.insert = insertChainReturning([tier]) as any;
		// After insert, getConfigsMissingRateForTier runs another select for configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await createTrainerTier(mockDb, { name: "Gold", rank: 1 });

		expect(result.tier).toEqual(tier);
		expect(result.missingRateCategories).toEqual([]);
	});

	test("throws when a tier with the same name already exists (case-insensitive check)", async () => {
		// Duplicate found
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ id: TIER_ID }]));

		await expect(createTrainerTier(mockDb, { name: "gold" })).rejects.toThrow(
			"A tier with this name already exists",
		);
	});

	test("scaffolds zero-amount stub rates so a non-conditional config is NOT reported missing for the new tier", async () => {
		const tier = makeTier();
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: false,
		};

		// 1st select: duplicate-name check → empty
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));
		// insert returns the new tier (also reused for the scaffolded stub-rate insert)
		mockDb.insert = insertChainReturning([tier]) as any;
		// 2nd select: active non-conditional configs → one config (triggers stub-rate scaffolding)
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([{ id: CONFIG_ID }]),
		);
		// getConfigsMissingRateForTier:
		// 3rd select: configs (one non-conditional config)
		mockDb.select.mockReturnValueOnce(selectChainResolving([config]));
		// 4th select: rate check for this config → rate now EXISTS (scaffolded above)
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ id: "rate-1" }]));

		const result = await createTrainerTier(mockDb, { name: "Gold" });

		expect(result.missingRateCategories).toEqual([]);
	});

	test("returns empty missingRateCategories when no commission configs exist", async () => {
		const tier = makeTier();

		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // name check
		mockDb.insert = insertChainReturning([tier]) as any;
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // configs → none

		const result = await createTrainerTier(mockDb, { name: "Gold" });

		expect(result.missingRateCategories).toEqual([]);
	});
});

// ─── updateTrainerTier ───────────────────────────────────────────────────────
describe("updateTrainerTier", () => {
	test("partial update without name change — skips duplicate check", async () => {
		const updatedTier = makeTier({ rank: 5 });
		mockDb.update = updateChainReturning([updatedTier]) as any;

		const result = await updateTrainerTier(mockDb, TIER_ID, { rank: 5 });

		expect(result).toEqual(updatedTier);
		// select should NOT be called (no name in params)
		expect(mockDb.select).not.toHaveBeenCalled();
	});

	test("updates name successfully when new name is unique", async () => {
		const updatedTier = makeTier({ name: "Platinum" });

		// Duplicate name check → no other tier with this name
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));
		mockDb.update = updateChainReturning([updatedTier]) as any;

		const result = await updateTrainerTier(mockDb, TIER_ID, {
			name: "Platinum",
		});

		expect(result.name).toBe("Platinum");
	});

	test("throws when updated name collides with another tier", async () => {
		// Duplicate found (a DIFFERENT tier has this name)
		mockDb.select.mockReturnValueOnce(
			selectChainResolving([{ id: TIER_ID_2 }]),
		);

		await expect(
			updateTrainerTier(mockDb, TIER_ID, { name: "Silver" }),
		).rejects.toThrow("A tier with this name already exists");
	});

	test("updates isActive field", async () => {
		const updatedTier = makeTier({ isActive: false });
		mockDb.update = updateChainReturning([updatedTier]) as any;

		const result = await updateTrainerTier(mockDb, TIER_ID, {
			isActive: false,
		});

		expect(result.isActive).toBe(false);
	});
});

// ─── deactivateTrainerTier ───────────────────────────────────────────────────
describe("deactivateTrainerTier", () => {
	test("sets isActive=false and returns the tier", async () => {
		const deactivatedTier = makeTier({ isActive: false });
		mockDb.update = updateChainReturning([deactivatedTier]) as any;

		const result = await deactivateTrainerTier(mockDb, TIER_ID);

		expect(result.isActive).toBe(false);
		expect(result.id).toBe(TIER_ID);
	});

	test("does not hard-delete (calls update, not delete)", async () => {
		mockDb.update = updateChainReturning([
			makeTier({ isActive: false }),
		]) as any;

		await deactivateTrainerTier(mockDb, TIER_ID);

		expect(mockDb.delete).not.toHaveBeenCalled();
	});

	test("throws when tier not found", async () => {
		// update returns empty → not found
		mockDb.update = updateChainReturning([]) as any;

		await expect(
			deactivateTrainerTier(mockDb, "nonexistent-id"),
		).rejects.toThrow("Trainer tier not found");
	});
});

// ─── reactivateTrainerTier ───────────────────────────────────────────────────
describe("reactivateTrainerTier", () => {
	test("sets isActive=true and returns tier with missingRateCategories", async () => {
		const reactivatedTier = makeTier({ isActive: true });
		mockDb.update = updateChainReturning([reactivatedTier]) as any;
		// getConfigsMissingRateForTier → no configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await reactivateTrainerTier(mockDb, TIER_ID);

		expect(result.tier.isActive).toBe(true);
		expect(result.missingRateCategories).toEqual([]);
	});

	test("throws when tier not found", async () => {
		mockDb.update = updateChainReturning([]) as any;

		await expect(reactivateTrainerTier(mockDb, "bad-id")).rejects.toThrow(
			"Trainer tier not found",
		);
	});

	test("returns missingRateCategories populated from configs", async () => {
		const tier = makeTier({ isActive: true });
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: false,
		};

		mockDb.update = updateChainReturning([tier]) as any;
		// configs select
		mockDb.select.mockReturnValueOnce(selectChainResolving([config]));
		// rate check → missing
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await reactivateTrainerTier(mockDb, TIER_ID);

		expect(result.missingRateCategories).toHaveLength(1);
		expect(result.missingRateCategories[0]!.categoryId).toBe(CATEGORY_ID);
	});
});

// ─── assignTierToMember ──────────────────────────────────────────────────────
describe("assignTierToMember", () => {
	test("assigns tier to a trainer successfully", async () => {
		const trainer = makeMember({ role: "trainer" });
		const updatedMember = { ...trainer, trainerTierId: TIER_ID };

		// 1st select: member lookup
		mockDb.select.mockReturnValueOnce(selectChainResolving([trainer]));
		// 2nd select: tier existence check
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ id: TIER_ID }]));
		// update returns the updated member
		mockDb.update = updateChainReturning([updatedMember]) as any;

		const result = await assignTierToMember(mockDb, MEMBER_ID, TIER_ID);

		expect(result.trainerTierId).toBe(TIER_ID);
	});

	test("throws when member has a non-trainer role", async () => {
		const staffMember = makeMember({ role: "staff" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([staffMember]));

		await expect(
			assignTierToMember(mockDb, MEMBER_ID, TIER_ID),
		).rejects.toThrow("Only trainers can be assigned a tier");
	});

	test("throws when member is not found", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(
			assignTierToMember(mockDb, "no-member", TIER_ID),
		).rejects.toThrow("Member not found");
	});

	test("throws when tier does not exist", async () => {
		const trainer = makeMember({ role: "trainer" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([trainer]));
		// Tier lookup → empty
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(
			assignTierToMember(mockDb, MEMBER_ID, "bad-tier-id"),
		).rejects.toThrow("Trainer tier not found");
	});

	test("null tierId clears the assignment (skips tier existence check)", async () => {
		const trainer = makeMember({ role: "trainer", trainerTierId: TIER_ID });
		const updatedMember = { ...trainer, trainerTierId: null };

		mockDb.select.mockReturnValueOnce(selectChainResolving([trainer]));
		// no tier lookup when tierId === null
		mockDb.update = updateChainReturning([updatedMember]) as any;

		const result = await assignTierToMember(mockDb, MEMBER_ID, null);

		expect(result.trainerTierId).toBeNull();
		// Only one select (member), not two (no tier lookup)
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});
});

// ─── getConfigsMissingRateForTier ─────────────────────────────────────────────
describe("getConfigsMissingRateForTier", () => {
	test("returns empty array when no active configs exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toEqual([]);
	});

	test("marks non-conditional config as missing when no rate found for the tier", async () => {
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: false,
		};
		mockDb.select.mockReturnValueOnce(selectChainResolving([config])); // configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // rate check → missing

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ categoryId: CATEGORY_ID, configId: CONFIG_ID });
	});

	test("does NOT mark non-conditional config as missing when rate exists", async () => {
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: false,
		};
		mockDb.select.mockReturnValueOnce(selectChainResolving([config])); // configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ id: "rate-1" }])); // rate found

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toEqual([]);
	});

	test("marks conditional config as missing when it has no conditions at all", async () => {
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: true,
		};
		mockDb.select.mockReturnValueOnce(selectChainResolving([config])); // configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // conditions → none

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ categoryId: CATEGORY_ID, configId: CONFIG_ID });
	});

	test("marks conditional config as missing when no condition has a rate for the tier", async () => {
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: true,
		};
		const condition = { id: CONDITION_ID };

		mockDb.select.mockReturnValueOnce(selectChainResolving([config])); // configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([condition])); // conditions
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // condition rate → missing

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toHaveLength(1);
	});

	test("does NOT mark conditional config as missing when at least one condition has a rate", async () => {
		const config = {
			id: CONFIG_ID,
			categoryId: CATEGORY_ID,
			isConditional: true,
		};
		const condition = { id: CONDITION_ID };

		mockDb.select.mockReturnValueOnce(selectChainResolving([config])); // configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([condition])); // conditions
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ id: "cr-1" }])); // rate found → not missing

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toEqual([]);
	});

	test("handles multiple configs — only those missing rates are returned", async () => {
		const configA = { id: "cfg-A", categoryId: "cat-A", isConditional: false };
		const configB = { id: "cfg-B", categoryId: "cat-B", isConditional: false };

		mockDb.select.mockReturnValueOnce(selectChainResolving([configA, configB])); // configs
		mockDb.select.mockReturnValueOnce(selectChainResolving([{ id: "rate-A" }])); // configA has rate
		mockDb.select.mockReturnValueOnce(selectChainResolving([])); // configB missing

		const result = await getConfigsMissingRateForTier(mockDb, TIER_ID);

		expect(result).toHaveLength(1);
		expect(result[0]!.configId).toBe("cfg-B");
	});
});
