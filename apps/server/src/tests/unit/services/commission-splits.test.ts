import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeCommissionSplit } from "../../helpers/fixtures";

import {
	listCommissionSplits,
	getCommissionsByAppointment,
	getMyCommissions,
} from "@avantej-core/services/commission-splits.service";

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

// ─── listCommissionSplits ────────────────────────────────────────────────────
describe("listCommissionSplits", () => {
	test("returns commission splits from select chain", async () => {
		const splits = [makeCommissionSplit(), makeCommissionSplit()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(splits));

		const result = await listCommissionSplits(mockDb, {});

		expect(result).toEqual(splits);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no splits exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await listCommissionSplits(mockDb, {});

		expect(result).toEqual([]);
	});

	test("filters by memberId (maps to staffId)", async () => {
		const split = makeCommissionSplit({ staffId: MEMBER_ID });
		mockDb.select.mockReturnValueOnce(selectChainResolving([split]));

		const result = await listCommissionSplits(mockDb, { memberId: MEMBER_ID });

		expect(result).toHaveLength(1);
	});
});

// ─── getCommissionsByAppointment ─────────────────────────────────────────────
describe("getCommissionsByAppointment", () => {
	test("returns splits for a specific appointment", async () => {
		const appointmentId = "appt-uuid";
		const splits = [
			makeCommissionSplit({ appointmentId }),
			makeCommissionSplit({ appointmentId }),
		];
		mockDb.select.mockReturnValueOnce(selectChainResolving(splits));

		const result = await getCommissionsByAppointment(mockDb, appointmentId);

		expect(result).toEqual(splits);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no splits for appointment", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getCommissionsByAppointment(mockDb, "no-appt-id");

		expect(result).toEqual([]);
	});
});

// ─── getMyCommissions ────────────────────────────────────────────────────────
describe("getMyCommissions", () => {
	test("returns splits and total amount for a member", async () => {
		const splits = [
			makeCommissionSplit({ staffId: MEMBER_ID, calculatedAmount: 5000 }),
			makeCommissionSplit({ staffId: MEMBER_ID, calculatedAmount: 3000 }),
		];
		mockDb.select.mockReturnValueOnce(selectChainResolving(splits));

		const result = await getMyCommissions(mockDb, MEMBER_ID);

		expect(result.splits).toEqual(splits);
		expect(result.totalAmount).toBe(8000);
	});

	test("returns zero totalAmount with empty splits", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getMyCommissions(mockDb, MEMBER_ID);

		expect(result.splits).toEqual([]);
		expect(result.totalAmount).toBe(0);
	});

	test("filters by date range when provided", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await getMyCommissions(mockDb, MEMBER_ID, {
			from: new Date("2026-01-01"),
			to: new Date("2026-01-31"),
		});

		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});
});
