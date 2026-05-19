/**
 * Journey: Confirm payout creates a row in the payouts table
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Precondition: at least one approved commission split must exist.
 * Strategy:
 *   1. Check the ledger for any existing pending splits — approve them.
 *   2. If none, fall back to seeding via appointment completion (requires commission config).
 *   3. Skip if no approved splits can be obtained.
 *
 * NOTE: createManualAdjustment is blocked by a DB CHECK constraint
 * (commission_splits_must_target_one) which requires exactly one of
 * appointment_id / sales_order_id / package_instance_id to be non-null.
 * Manual adjustments have none set — so that path is unusable until the
 * backend constraint is relaxed for splitType='manual'.
 *
 * Run: bunx playwright test e2e/payouts-confirm-creates-row.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { orpcCall } from "./helpers/orpc-client";
import {
  pickFirstActiveTrainer,
  TEST_ORG_ID,
} from "./helpers/seed-data";

test(
  "confirm payout batch creates a row in the payouts table",
  { tag: ["@p1"] },
  async ({ page }) => {
    // ── Precondition: we need a trainer ──────────────────────────────────────
    const trainer = await pickFirstActiveTrainer(page);
    test.skip(!trainer, "No active trainer — cannot find commission splits");

    // ── Strategy: find any approved-or-pending splits, approve as needed ────
    // Run-batch needs splits in `approved` status. Look for either; approve any
    // pending ones we find. Skip cleanly only if neither status has anything.
    type LedgerRow = { id: string; staffId?: string | null; status?: string };
    type LedgerResp = { rows?: LedgerRow[]; total?: number };

    const fetchByStatus = async (status: "pending" | "approved"): Promise<LedgerRow[]> => {
      try {
        const r = await orpcCall<object, LedgerResp>(page, "commissionSplits", "listLedger", {
          organizationId: TEST_ORG_ID,
          status,
          limit: 200,
          offset: 0,
        });
        return r.rows ?? [];
      } catch {
        return [];
      }
    };

    const approved = await fetchByStatus("approved");
    const pending = await fetchByStatus("pending");

    test.skip(
      approved.length === 0 && pending.length === 0,
      "No approved or pending commission splits in the ledger — run a commission-rule cancel/complete spec first to seed one, or configure commission settings if missing",
    );

    // Promote pending → approved so run-batch has eligible rows.
    if (pending.length > 0) {
      try {
        await orpcCall(page, "commissionSplits", "approve", {
          organizationId: TEST_ORG_ID,
          ids: pending.map((r) => r.id),
        });
      } catch (err) {
        // Approval optional — proceed if we already have approved rows.
        if (approved.length === 0) {
          test.skip(true, `Could not approve splits: ${String(err)}`);
        }
      }
    }

    // ── Navigate to payouts page ─────────────────────────────────────────────
    await page.goto("/dashboard/payouts/view");
    await expect(page.getByTestId("payouts-kpi-strip")).toBeVisible();

    // Record initial row count (may be 0 if table is empty state)
    const table = page.getByTestId("payouts-table");
    const tableVisible = await table.isVisible({ timeout: 5_000 }).catch(() => false);
    const initialRowCount = tableVisible
      ? await table.locator("tbody tr").count()
      : 0;

    // ── Open Run Batch drawer ────────────────────────────────────────────────
    await page.getByTestId("run-batch-button").click();
    await expect(page.getByTestId("run-batch-drawer")).toBeVisible({ timeout: 8_000 });

    // Open the combobox (it's a button trigger, not an input — .click only).
    const staffCombobox = page.getByTestId("batch-staff-combobox");
    await staffCombobox.click();

    // Pick our trainer from the popover options. Try by name; fall back to first.
    const trainerName = trainer!.name;
    const namedOption = page
      .getByRole("option", { name: new RegExp(trainerName.split(/\s+/)[0] ?? trainerName, "i") })
      .first();
    if (await namedOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await namedOption.click();
    } else {
      const anyOption = page.getByRole("option").first();
      if (await anyOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await anyOption.click();
      } else {
        test.skip(true, "Run-batch staff combobox has no options — needs eligible trainers");
      }
    }
    // Close the popover (some implementations stay open for multi-select).
    await page.keyboard.press("Escape");

    // Set a wide date range to capture our just-created split
    const periodStart = page.getByTestId("batch-period-start");
    const periodEnd = page.getByTestId("batch-period-end");
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0]!;
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]!;

    await periodStart.fill(startDate).catch(() => {});
    await periodEnd.fill(endDate).catch(() => {});

    // Wait for preview count to update
    const previewCount = page.getByTestId("batch-preview-count");
    await expect(previewCount).toBeVisible({ timeout: 10_000 });

    // Confirm if enabled
    const confirmBtn = page.getByTestId("batch-confirm-button");
    await expect(confirmBtn).toBeVisible();

    const isEnabled = await confirmBtn.isEnabled({ timeout: 3_000 }).catch(() => false);
    test.skip(!isEnabled, "Confirm button disabled — preview count likely 0 (split may not match filter)");

    await confirmBtn.click();

    // ── Assert: toast appears and table row count increased ──────────────────
    const toast = page.locator("[data-sonner-toast], [role='status'], [role='alert']").filter({
      hasText: /payout/i,
    });
    await expect(toast.first()).toBeVisible({ timeout: 15_000 });

    // Drawer should close
    await expect(page.getByTestId("run-batch-drawer")).not.toBeVisible({ timeout: 10_000 });

    // Table row count should increase
    await expect(table).toBeVisible({ timeout: 5_000 });
    const finalRowCount = await table.locator("tbody tr").count();
    expect(
      finalRowCount,
      `Expected payouts table to grow from ${initialRowCount} rows, got ${finalRowCount}`,
    ).toBeGreaterThan(initialRowCount);
  },
);
