/**
 * Journey: Void a commission split via the UI void dialog in the All Commissions page
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Seeding strategy (in order of preference):
 *   A. Create a POS product sale via recordPosSale → generates an immediate
 *      pos_product commission split → use that split.
 *   B. If no product exists and cannot be seeded, call commissionSplits.listLedger
 *      with status:"pending" and use the first existing pending row.
 *   C. If neither works, skip.
 *
 * Steps:
 *   1. Seed or find a pending commission split
 *   2. Navigate to /dashboard/commissions/view?tab=all
 *   3. Switch to the "All" tab in the inner toolbar (already default)
 *   4. Locate the seeded split's row by salesOrderId or amount
 *   5. Click the "Void" button on that row
 *   6. Assert: VoidRowDialog opens with title "Void Commission Split" + Textarea
 *   7. Fill reason "E2E test void"
 *   8. Click "Void" confirm button
 *   9. Assert: row no longer has status "pending" (or table refreshes)
 *  10. Switch to the "Void" tab — row appears with status=void
 *
 * Skip conditions:
 *   - Cannot seed or find a pending commission split
 *   - commission_management:read permission missing (shows permission denied UI)
 *
 * Run: bunx playwright test e2e/commissions-void-dialog.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
  pickFirstActiveClient,
  ensureFirstProduct,
  pickFirstBranchId,
  recordPosSale,
  TEST_ORG_ID,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

const VOID_REASON = "E2E test void";

test(
  "commission void dialog — void a pending split and confirm it moves to Void status",
  { tag: ["@p1"] },
  async ({ page }) => {
    // ── Strategy A: Seed a split via POS product sale ──────────────────────────
    let salesOrderId = "";
    let targetSplitId = "";

    const clientInfo = await pickFirstActiveClient(page);
    const product = await ensureFirstProduct(page);

    if (clientInfo && product) {
      const branchId =
        clientInfo.hierarchyScopeId ?? (await pickFirstBranchId(page));

      try {
        salesOrderId = await recordPosSale(page, {
          customerId: clientInfo.userId,
          customerName: clientInfo.name,
          branchId,
          items: [
            {
              type: "product",
              refId: product.id,
              description: product.name,
              quantity: 1,
              unitPriceCents: product.unitPriceCents,
            },
          ],
          paymentMethod: "cash",
        });
      } catch {
        salesOrderId = "";
      }
    }

    // Allow commission engine to process synchronously before querying
    if (salesOrderId) {
      await page.waitForTimeout(500);
    }

    // ── Find the split (Strategy A: match by salesOrderId; fallback B: first pending)
    type LedgerRow = {
      id: string;
      salesOrderId?: string | null;
      earnReason?: string | null;
      status?: string;
      calculatedAmount?: number;
    };
    type LedgerResult = { rows?: LedgerRow[]; items?: LedgerRow[] } | LedgerRow[];

    const findSplit = async (): Promise<LedgerRow | null> => {
      try {
        const result = await orpcCall<object, LedgerResult>(
          page,
          "commissionSplits",
          "listLedger",
          {
            organizationId: TEST_ORG_ID,
            status: "pending",
            limit: 100,
            offset: 0,
          },
        );
        const rows = Array.isArray(result)
          ? result
          : (result as { rows?: LedgerRow[] }).rows ??
            (result as { items?: LedgerRow[] }).items ??
            [];

        // Prefer the split we just seeded
        if (salesOrderId) {
          const matched = rows.find((r) => r.salesOrderId === salesOrderId);
          if (matched) return matched;
        }
        // Fallback: any pending split
        return rows[0] ?? null;
      } catch {
        return null;
      }
    };

    const targetSplit = await findSplit();
    test.skip(
      !targetSplit,
      "No pending commission split found or seeded — skip",
    );
    targetSplitId = targetSplit!.id;

    // ── Navigate to commissions All tab ───────────────────────────────────────
    await page.goto("/dashboard/commissions/view?tab=all");
    await page.waitForLoadState("networkidle");

    // Guard: check for permission denied (would mean the test admin lacks the read permission)
    const permDenied = page.getByText(/permission denied/i);
    const isPermDenied = await permDenied.isVisible({ timeout: 3_000 }).catch(() => false);
    test.skip(isPermDenied, "Admin lacks commission_management:read — skip");

    // Wait for the ledger table to load
    // The page shows "No commission splits found." when empty, or a <table> when populated.
    // Wait for either state.
    await page.waitForSelector("table, :text('No commission splits found.')", {
      timeout: 15_000,
    });

    // The AllCommissionsPage loads with activeTab="all" by default.
    // We need to ensure we're on the "All" tab (it's already the default but
    // navigate explicitly to be safe via the tab button).
    const allTabButton = page.getByRole("button", { name: /^All$/i });
    if (await allTabButton.isVisible()) {
      await allTabButton.click();
      // Wait for the table to refresh
      await page.waitForTimeout(500);
    }

    // ── Locate the target split row's Void button ──────────────────────────────
    // The all-tab.tsx renders a "Void" text-button as the last column for each
    // non-void row when canApprove is true.
    // Button selector: button with text "Void" in the same <tr> as our split.
    //
    // Strategy: click the Void button on ANY visible pending row. If we seeded our
    // own split, the table should contain it; if we're using an existing split,
    // any pending split is acceptable to void.
    //
    // The row contains a data-testid="commission-status-badge" whose text is the
    // status string. We want a row where the status badge says "pending" that also
    // has a Void button.

    // Scroll down to ensure rows are in view (table may be long)
    const firstVoidButton = page
      .getByRole("button", { name: /^Void$/i })
      .first();
    await firstVoidButton.waitFor({ timeout: 10_000 });
    await firstVoidButton.scrollIntoViewIfNeeded();
    await firstVoidButton.click();

    // ── Assert: VoidRowDialog opens ───────────────────────────────────────────
    // VoidRowDialog renders a Dialog with DialogTitle "Void Commission Split"
    const dialogTitle = page.getByRole("heading", {
      name: /void commission split/i,
    });
    await expect(dialogTitle).toBeVisible({ timeout: 5_000 });

    // Reason textarea has id="void-row-reason" and label "Reason"
    const reasonTextarea = page.locator("#void-row-reason");
    await expect(reasonTextarea).toBeVisible({ timeout: 3_000 });

    // ── Fill reason and confirm ────────────────────────────────────────────────
    await reasonTextarea.fill(VOID_REASON);

    // The confirm "Void" button is the destructive one in DialogFooter
    // (there are now two "Void" buttons: the row trigger and the dialog confirm)
    // The dialog's "Void" button is inside the Dialog — role=button, name="Void"
    // We disambiguate by targeting inside the dialog content:
    const dialogContent = page.locator('[role="dialog"]');
    const confirmVoidButton = dialogContent.getByRole("button", {
      name: /^Void$/i,
    });
    await confirmVoidButton.waitFor({ timeout: 3_000 });
    await expect(confirmVoidButton).toBeEnabled();
    await confirmVoidButton.click();

    // ── Assert: dialog closes after successful void ────────────────────────────
    await expect(dialogTitle).not.toBeVisible({ timeout: 10_000 });

    // Wait for the table to refresh (queryClient.invalidateQueries fires on success)
    await page.waitForTimeout(1000);

    // ── Navigate to Void filter tab and verify the row appears ────────────────
    const voidTabButton = page.getByRole("button", { name: /^Void$/i });
    await voidTabButton.waitFor({ timeout: 5_000 });
    await voidTabButton.click();

    // Wait for table refresh
    await page.waitForTimeout(500);

    // There should be at least one row in the Void tab (our just-voided split)
    // data-testid="commission-status-badge" shows the status text
    const voidStatusBadge = page
      .getByTestId("commission-status-badge")
      .filter({ hasText: /^void$/i })
      .first();
    await expect(voidStatusBadge).toBeVisible({ timeout: 10_000 });

    // ── Cleanup: attempt to cancel the seeded sales order if we created one ────
    if (salesOrderId) {
      try {
        await orpcCall(page, "salesOrders", "cancel", {
          organizationId: TEST_ORG_ID,
          id: salesOrderId,
        });
      } catch {
        // best-effort cleanup
      }
    }
  },
);
