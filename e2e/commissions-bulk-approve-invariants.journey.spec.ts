/**
 * Journey: Bulk Approve invariant — mixed-staff selection shows frontend error toast
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Background: The mixed-staff guard lives in BulkActionBar (frontend), NOT the backend.
 * When pending rows from different staff members are selected and "Approve Selected"
 * is clicked, toast.error fires BEFORE the API is called:
 *   "Cannot approve splits for N different staff members at once.
 *    Filter by a single staff member first."
 *
 * Phase 4 note: A single sales order may now produce MULTIPLE commission splits —
 * one per track/roleType (e.g. a "sales" split + a "delivery_legacy" split for the
 * same staff member). The `listLedger` API still returns these as separate rows each
 * with their own `id`. The bulk-approve invariant (mixed-staff check) operates on
 * `staffId`, so stacked splits for the SAME staff member do NOT trigger the error —
 * only selecting rows from 2+ different staff members does. This test verifies the
 * invariant still holds under stacked splits: we explicitly pick rows from staff A
 * and staff B (not just 2 rows from staff A with different tracks).
 *
 * Steps:
 *   1. Navigate to /dashboard/commissions/view?tab=all
 *   2. Switch to the Pending inner-tab (enables checkboxes)
 *   3. Read the table rows and find rows belonging to at least 2 different staff members
 *   4. Select one row from each distinct staff member (different staffId, not just different trackId)
 *   5. Click "Approve Selected"
 *   6. Assert: error toast appears without a dialog opening
 *
 * Skip conditions:
 *   - Fewer than 2 distinct staff members have pending splits (can't test the invariant)
 *   - No pending splits at all
 *   - Admin lacks commission_management:read (page shows Permission Denied)
 *
 * Run: bunx playwright test e2e/commissions-bulk-approve-invariants.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { orpcCall } from "./helpers/orpc-client";
import { TEST_ORG_ID } from "./helpers/seed-data";

type LedgerRow = {
	id: string;
	staffId: string;
	staffName: string | null;
	status: string;
	/** Phase 4: one order can produce multiple splits (one per track/roleType) */
	trackId?: string | null;
	roleType?: string | null;
};

type LedgerResult = { rows?: LedgerRow[]; total?: number };

test("bulk approve — selecting mixed-staff pending splits shows frontend error toast", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── Precondition: fetch pending splits via API ─────────────────────────────
	let pendingRows: LedgerRow[] = [];
	try {
		const result = await orpcCall<object, LedgerResult>(
			page,
			"commissionSplits",
			"listLedger",
			{
				organizationId: TEST_ORG_ID,
				status: "pending",
				limit: 200,
				offset: 0,
			},
		);
		pendingRows = result.rows ?? [];
	} catch {
		test.skip(true, "listLedger failed — cannot check pending splits");
	}

	// Need at least 2 distinct staff to trigger the invariant.
	// Phase 4: a single staff member may have MULTIPLE pending rows (stacked
	// track splits). De-duplicate by staffId, not by row count.
	const staffIds = [...new Set(pendingRows.map((r) => r.staffId))];
	test.skip(
		staffIds.length < 2,
		`Only ${staffIds.length} distinct staff member(s) have pending splits — need ≥2 to test mixed-batch invariant`,
	);

	// Pick one row per staff (the first two staff members' first rows).
	// We deliberately pick rows with DIFFERENT staffId (not just different trackId)
	// because the invariant guards against mixing staff, not tracks.
	const targetStaffA = staffIds[0]!;
	const targetStaffB = staffIds[1]!;
	const rowA = pendingRows.find((r) => r.staffId === targetStaffA)!;
	const rowB = pendingRows.find((r) => r.staffId === targetStaffB)!;

	// ── Navigate to All Commissions tab ───────────────────────────────────────
	await page.goto("/dashboard/commissions/view?tab=all");
	await page.waitForLoadState("networkidle");

	// Guard: permission denied
	const permDenied = page.getByText(/permission denied/i);
	const isPermDenied = await permDenied
		.isVisible({ timeout: 3_000 })
		.catch(() => false);
	test.skip(isPermDenied, "Admin lacks commission_management:read — skip");

	// ── Switch to Pending inner-tab (enables selection checkboxes) ────────────
	const pendingTabButton = page.getByRole("button", { name: /^Pending$/i });
	await pendingTabButton.waitFor({ timeout: 10_000 });
	await pendingTabButton.click();

	// Wait for table to refresh
	await page.waitForTimeout(600);

	// Ensure there are rows in the pending view
	await page.waitForSelector("table, :text('No commission splits found.')", {
		timeout: 10_000,
	});

	const noSplits = await page
		.getByText(/no commission splits found/i)
		.isVisible({ timeout: 2_000 })
		.catch(() => false);
	test.skip(noSplits, "No pending splits visible in the All tab");

	// ── Select one row from staff A, one from staff B ─────────────────────────
	// Rows have per-row checkboxes with aria-label `Select commission {id}`.
	const checkboxA = page.locator(`[aria-label="Select commission ${rowA.id}"]`);
	const checkboxB = page.locator(`[aria-label="Select commission ${rowB.id}"]`);

	const checkboxAVisible = await checkboxA
		.isVisible({ timeout: 5_000 })
		.catch(() => false);
	const checkboxBVisible = await checkboxB
		.isVisible({ timeout: 5_000 })
		.catch(() => false);

	if (!checkboxAVisible || !checkboxBVisible) {
		// Rows may be paginated below or not yet visible; skip rather than fail
		test.skip(
			true,
			"Target rows for both staff members not visible on the current page — may need scrolling or pagination",
		);
	}

	await checkboxA.check();
	await checkboxB.check();

	// ── Assert: BulkActionBar appears with "Approve Selected" button ──────────
	const approveBtn = page.getByRole("button", { name: /approve selected/i });
	await expect(approveBtn).toBeVisible({ timeout: 5_000 });

	// ── Click Approve Selected ─────────────────────────────────────────────────
	// The frontend guard in BulkActionBar calls toast.error() and returns early,
	// so NO dialog should open.
	await approveBtn.click();

	// ── Assert: error toast appears ───────────────────────────────────────────
	// Sonner renders toasts as [data-sonner-toast] with role="status".
	// The message contains "different staff members" (frontend guard message).
	const errorToast = page
		.locator("[data-sonner-toast]")
		.filter({ hasText: /different staff members/i });
	await expect(errorToast.first()).toBeVisible({ timeout: 8_000 });

	// ── Assert: no approval dialog opened ────────────────────────────────────
	// The ApproveConfirmDialog has title "Approve Commission Splits"
	const approveDialog = page.getByRole("heading", {
		name: /approve commission splits/i,
	});
	await expect(approveDialog).not.toBeVisible({ timeout: 2_000 });
});
