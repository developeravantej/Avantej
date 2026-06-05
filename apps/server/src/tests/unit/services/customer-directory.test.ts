import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
	getCustomerStats,
	listCustomerDirectory,
} from "@avantej-core/services/customer-directory.service";
import {
	createMockTenantDb,
	selectChainResolving,
} from "../../helpers/db-mock.factory";

/**
 * Regression coverage for db076f3e
 * ("fix(customers): stop directory list/stats 500 from JOIN fan-out overflow").
 *
 * The bug: customerDirectory.list / getStats LEFT JOINed payments + installments
 * alongside package_instances + appointment_clients, producing a cartesian
 * fan-out. The un-DISTINCT SUM(...) was multiplied by that fan-out and cast with
 * ::INTEGER, so a customer with enough joined rows overflowed Postgres' 32-bit
 * INT (`integer out of range`) → the whole query 500'd and the directory was
 * permanently stuck "loading" (every customer appeared missing).
 *
 * The fix decorrelated the money aggregates into per-member scalar subqueries
 * cast to ::BIGINT, then coerces the driver's BIGINT-as-string back to a number
 * at the JS mapping boundary (`Number(...)`).
 *
 * These tests pin the half of the fix that is deterministic without a live
 * Postgres: the mapping boundary. The pg driver returns BIGINT columns as
 * STRINGS, and whale totals exceed the old ::INTEGER ceiling (2_147_483_647).
 * If db076f3e is reverted, the service hands the raw string straight through
 * (no `Number()`), so the numeric assertions below fail — i.e. this file is a
 * true revert-detector. The SQL-level overflow itself is exercised by the
 * gated integration suite against a real branch.
 */

// 32-bit signed INT ceiling — the value that used to overflow `::INTEGER`.
const INT4_MAX = 2_147_483_647;

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";

/** Minimal control-panel DB whose only use here is the user name/email lookup. */
function controlPanelDbResolving(userRows: unknown[]) {
	return {
		select: mock(() => selectChainResolving(userRows)),
	} as any;
}

let tenantDb: ReturnType<typeof createMockTenantDb>;

beforeEach(() => {
	tenantDb = createMockTenantDb();
});

describe("listCustomerDirectory — BIGINT money mapping (db076f3e regression)", () => {
	test("coerces BIGINT-as-string money columns to numbers", async () => {
		// pg returns ::BIGINT casts as strings.
		tenantDb.execute
			.mockResolvedValueOnce({
				rows: [
					{
						member_id: MEMBER_ID,
						user_id: USER_ID,
						hierarchy_scope_id: NODE_ID,
						joined_at: new Date("2026-01-01"),
						phone: "+60123456789",
						is_deleted: false,
						is_unclaimed: false,
						active_package_count: 1,
						active_package_name: "Gold",
						lifetime_value_cents: "300000",
						outstanding_balance_cents: "150000",
						appointment_count: 4,
						last_visit_at: new Date("2026-05-01"),
						lifecycle_status: "active",
					},
				],
			})
			.mockResolvedValueOnce({ rows: [{ total: 1 }] });
		// hierarchy node-name lookup (tenantDb.select)
		tenantDb.select.mockReturnValueOnce(
			selectChainResolving([{ id: NODE_ID, name: "Main Branch" }]),
		);

		const controlPanelDb = controlPanelDbResolving([
			{
				id: USER_ID,
				name: "Ahmad Firdaus",
				email: "member@test.my",
				emailVerified: true,
			},
		]);

		const { rows } = await listCustomerDirectory(
			controlPanelDb,
			tenantDb,
			"org-1",
			{ accessibleNodeIds: [NODE_ID] },
		);

		expect(rows).toHaveLength(1);
		const row = rows[0]!;
		// The crux: numbers, not the driver's raw strings.
		expect(typeof row.lifetimeValueCents).toBe("number");
		expect(typeof row.outstandingBalanceCents).toBe("number");
		expect(row.lifetimeValueCents).toBe(300000);
		expect(row.outstandingBalanceCents).toBe(150000);
	});

	test("represents whale totals above the old INT4 overflow ceiling", async () => {
		// A lifetime value beyond INT4_MAX is exactly what overflowed ::INTEGER and
		// produced the 500. Post-fix it arrives as a BIGINT string and must survive.
		const whale = String(INT4_MAX + 1_000_000); // 2_148_483_647
		tenantDb.execute
			.mockResolvedValueOnce({
				rows: [
					{
						member_id: MEMBER_ID,
						user_id: USER_ID,
						hierarchy_scope_id: NODE_ID,
						joined_at: new Date("2026-01-01"),
						phone: null,
						is_deleted: false,
						is_unclaimed: false,
						active_package_count: 0,
						active_package_name: null,
						lifetime_value_cents: whale,
						outstanding_balance_cents: "0",
						appointment_count: 0,
						last_visit_at: null,
						lifecycle_status: "lead",
					},
				],
			})
			.mockResolvedValueOnce({ rows: [{ total: 1 }] });
		tenantDb.select.mockReturnValueOnce(
			selectChainResolving([{ id: NODE_ID, name: "Main Branch" }]),
		);

		const controlPanelDb = controlPanelDbResolving([
			{
				id: USER_ID,
				name: "Whale Customer",
				email: "whale@test.my",
				emailVerified: false,
			},
		]);

		const { rows } = await listCustomerDirectory(
			controlPanelDb,
			tenantDb,
			"org-1",
			{ accessibleNodeIds: [NODE_ID] },
		);

		const whaleRow = rows[0]!;
		expect(whaleRow.lifetimeValueCents).toBe(INT4_MAX + 1_000_000);
		expect(Number.isFinite(whaleRow.lifetimeValueCents)).toBe(true);
		expect(Number.isNaN(whaleRow.lifetimeValueCents)).toBe(false);
	});

	test("returns empty without touching the DB when no nodes are accessible", async () => {
		const controlPanelDb = controlPanelDbResolving([]);
		const { rows, total } = await listCustomerDirectory(
			controlPanelDb,
			tenantDb,
			"org-1",
			{ accessibleNodeIds: [] },
		);
		expect(rows).toEqual([]);
		expect(total).toBe(0);
		expect(tenantDb.execute).not.toHaveBeenCalled();
	});
});

describe("getCustomerStats — BIGINT avg mapping (db076f3e regression)", () => {
	test("coerces avg_lifetime_value_cents BIGINT string to a number", async () => {
		const avg = String(INT4_MAX + 5); // beyond old ::INTEGER ceiling
		tenantDb.execute.mockResolvedValueOnce({
			rows: [
				{
					total_count: 10,
					active_count: 4,
					lapsed_count: 2,
					lead_count: 3,
					avg_lifetime_value_cents: avg,
				},
			],
		});

		const stats = await getCustomerStats(tenantDb, {
			accessibleNodeIds: [NODE_ID],
		});

		expect(typeof stats.avgLifetimeValueCents).toBe("number");
		expect(stats.avgLifetimeValueCents).toBe(INT4_MAX + 5);
		expect(stats.totalCount).toBe(10);
		expect(stats.activeCount).toBe(4);
		expect(stats.lapsedCount).toBe(2);
		expect(stats.leadCount).toBe(3);
	});

	test("returns zeroed stats without touching the DB when no nodes are accessible", async () => {
		const stats = await getCustomerStats(tenantDb, { accessibleNodeIds: [] });
		expect(stats).toEqual({
			totalCount: 0,
			activeCount: 0,
			lapsedCount: 0,
			leadCount: 0,
			avgLifetimeValueCents: 0,
		});
		expect(tenantDb.execute).not.toHaveBeenCalled();
	});
});
