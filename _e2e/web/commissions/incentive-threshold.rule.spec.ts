import { test, expect } from "@playwright/test";
import { getOrgId, rpc } from "../_safe-mutation";

/**
 * UAT §12 — incentive thresholds.
 *
 * Proves the incentive rule lifecycle + the exactly-once award guarantee through
 * the live stack: a rule is created and listed, the period sweep is run TWICE
 * for the same window, and the second run creates zero new awards (idempotency
 * via UNIQUE(incentive_id, staff_id, period_key)) with a stable award count.
 *
 * The bonus math + period windowing are unit-tested separately
 * (commission-incentive.test.ts). This spec is data-independent: whether or not
 * any tenant staff qualify, re-running the sweep must never create MORE awards.
 */
const WIDE_FROM = "2020-01-01T00:00:00.000Z";
const WIDE_TO = "2035-01-01T00:00:00.000Z";
const PERIOD_KEY = "e2e-incentive-idem";

test.describe("§12 commission — incentive thresholds", () => {
	test("rule CRUD + idempotent period sweep (no double-pay)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Create a rule.
		const rule = await rpc(page.request, "commissionIncentives/create", {
			organizationId,
			name: "E2E Sales Bonus",
			roleType: "sales",
			thresholdCents: 0, // anyone with sales qualifies (data-independent)
			bonusType: "fixed",
			bonusValue: 5000,
		});
		expect(rule?.id, "create returns the rule").toBeTruthy();
		expect(rule.thresholdCents).toBe(0);
		expect(rule.bonusType).toBe("fixed");

		try {
			// It appears in the active list.
			const rules = await rpc(page.request, "commissionIncentives/list", {
				organizationId,
				activeOnly: true,
			});
			expect(
				(rules as any[]).some((r) => r.id === rule.id),
				"new rule appears in the active list",
			).toBeTruthy();

			// First sweep for a fixed period key.
			const run1 = await rpc(page.request, "commissionIncentives/evaluate", {
				organizationId,
				periodStart: WIDE_FROM,
				periodEnd: WIDE_TO,
				periodKey: PERIOD_KEY,
			});
			expect(run1.periodKey).toBe(PERIOD_KEY);
			expect(run1.rulesEvaluated).toBeGreaterThanOrEqual(1);

			const awardsAfter1 = await rpc(
				page.request,
				"commissionIncentives/listAwards",
				{ organizationId, periodKey: PERIOD_KEY },
			);
			const count1 = (awardsAfter1 as any[]).length;

			// Second sweep, same window — must create ZERO new awards.
			const run2 = await rpc(page.request, "commissionIncentives/evaluate", {
				organizationId,
				periodStart: WIDE_FROM,
				periodEnd: WIDE_TO,
				periodKey: PERIOD_KEY,
			});
			expect(
				run2.awardsCreated,
				"second sweep must create 0 new awards (idempotent)",
			).toBe(0);

			const awardsAfter2 = await rpc(
				page.request,
				"commissionIncentives/listAwards",
				{ organizationId, periodKey: PERIOD_KEY },
			);
			expect(
				(awardsAfter2 as any[]).length,
				"award count is stable across re-runs (no double-pay)",
			).toBe(count1);

			// Every award (if any) is well-formed: positive bonus, snapshot fields set.
			for (const a of awardsAfter2 as any[]) {
				expect(a.bonusCents).toBeGreaterThanOrEqual(0);
				expect(a.periodKey).toBe(PERIOD_KEY);
				expect(a.incentiveId).toBe(rule.id);
			}
		} finally {
			// Cleanup: deactivate the rule (awards cascade-delete with it if the
			// tenant is ever reset; deactivation keeps the rule out of future sweeps).
			await rpc(page.request, "commissionIncentives/deactivate", {
				organizationId,
				id: rule.id,
			});
		}
	});
});
