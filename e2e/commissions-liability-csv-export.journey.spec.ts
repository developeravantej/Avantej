/**
 * Journey: Liability tab — CSV export triggers a download with correct headers
 *
 * Actor: tenant_admin (franchisee@gmail.com) — must have commission_payout:read
 * Priority: P1
 *
 * Phase 4 update: CSV is now generated server-side via commissionSplits.exportLiabilityCsv.
 * The 7-column header matches the backend contract:
 *   "Staff Member","Role","Track ID","Approved Unpaid (RM)","Paid (RM)","Manual Adj (RM)","Net Payable (RM)"
 * NULL roleType renders as "Delivery (legacy)"; last row is TOTALS.
 *
 * Implementation note — URL.createObjectURL anchor click:
 *   The exportLiabilityCsv response is handed to a Blob + a.click() in the browser.
 *   Playwright captures this via page.waitForEvent("download"). Listener established
 *   BEFORE clicking.
 *
 * Steps:
 *   1. Navigate to /dashboard/commissions/view?tab=liability
 *   2. Skip if admin lacks commission_payout:read or if no staff rows exist
 *   3. Set up page.waitForEvent("download") promise
 *   4. Click "Export CSV"
 *   5. Assert: download event fires with a filename matching commission-liability_*.csv
 *   6. Save to a temp path, read first line
 *   7. Assert: header row = exact 7-column header (Phase 4)
 *   8. If at least one staff row exists, assert a data row appears and last row is TOTALS
 *
 * Skip conditions:
 *   - Admin lacks commission_payout:read
 *   - No staff rows in the current month's liability (disabled Export CSV button)
 *
 * Run: bunx playwright test e2e/commissions-liability-csv-export.journey.spec.ts --project=journeys-e2e
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { test, expect } from "@playwright/test";
import { TEST_ORG_ID } from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

function firstOfMonth(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayStr(): string {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toIsoStart(dateStr: string): string {
	return new Date(`${dateStr}T00:00:00`).toISOString();
}

function toIsoEnd(dateStr: string): string {
	return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

type LiabilitySummaryOutput = {
	trainers?: Array<{ memberId: string; name: string; netPayableCents: number }>;
};

// Phase 4: 7-column backend CSV header.
// NULL roleType renders as "Delivery (legacy)"; last row is TOTALS.
const EXPECTED_HEADER =
	'"Staff Member","Role","Track ID","Approved Unpaid (RM)","Paid (RM)","Manual Adj (RM)","Net Payable (RM)"';

test("liability tab — Export CSV fires a download with correct headers", {
	tag: ["@p1"],
}, async ({ page }) => {
	// ── Navigate ──────────────────────────────────────────────────────────────
	await page.goto("/dashboard/commissions/view?tab=liability");
	await page.waitForLoadState("networkidle");

	// ── Guard: permission denied ──────────────────────────────────────────────
	const permDenied = await page
		.getByText(/permission denied/i)
		.isVisible({ timeout: 4_000 })
		.catch(() => false);
	test.skip(
		permDenied,
		"Admin lacks commission_payout:read — Liability tab not accessible",
	);

	// ── Wait for content ──────────────────────────────────────────────────────
	// Toolbar heading is "Liability by Staff Member"; empty state is
	// "No commission activity in the selected period."
	await page.waitForSelector(
		":text('Liability by Staff Member'), :text('No commission activity')",
		{ timeout: 15_000 },
	);

	// ── Check if there are staff rows (Export CSV is disabled when empty) ────
	const from = firstOfMonth();
	const to = todayStr();

	let trainerCount = 0;
	let firstTrainerName = "";
	try {
		const result = await orpcCall<object, LiabilitySummaryOutput>(
			page,
			"commissionSplits",
			"liabilitySummary",
			{
				organizationId: TEST_ORG_ID,
				from: toIsoStart(from),
				to: toIsoEnd(to),
			},
		);
		const trainers = result.trainers ?? [];
		trainerCount = trainers.length;
		firstTrainerName = trainers[0]?.name ?? "";
	} catch {
		// Can't pre-check — proceed and let the disabled button skip handle it
	}

	const exportBtn = page.getByRole("button", { name: /export csv/i });
	await expect(exportBtn).toBeVisible({ timeout: 5_000 });

	const isDisabled = await exportBtn
		.isDisabled({ timeout: 3_000 })
		.catch(() => true);
	test.skip(
		isDisabled,
		"Export CSV button is disabled — no trainer rows in current month (trainerCount=0)",
	);

	// ── Set up download listener BEFORE clicking ──────────────────────────────
	// page.waitForEvent("download") must be established before the click that
	// triggers the download, otherwise the event may be missed.
	const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });

	// ── Click Export CSV ──────────────────────────────────────────────────────
	await exportBtn.click();

	// ── Assert: download event fires ──────────────────────────────────────────
	const download = await downloadPromise;

	// Verify filename matches commission-liability_{from}_{to}.csv
	const downloadedFilename = download.suggestedFilename();
	expect(
		downloadedFilename,
		"Download filename should match commission-liability pattern",
	).toMatch(/^commission-liability_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);

	// ── Save to temp path and read content ────────────────────────────────────
	const tmpDir = path.join(
		process.env.TEMP ?? process.env.TMP ?? "/tmp",
		"pw-e2e-commissions",
	);
	fs.mkdirSync(tmpDir, { recursive: true });
	const savePath = path.join(tmpDir, downloadedFilename);

	await download.saveAs(savePath);
	const csvContent = fs.readFileSync(savePath, "utf-8");
	const lines = csvContent.split("\n").filter((l) => l.trim().length > 0);

	expect(lines.length, "CSV should have at least a header row").toBeGreaterThan(
		0,
	);

	// ── Assert: header row matches expected columns ────────────────────────────
	const headerLine = lines[0]!.trim();
	expect(
		headerLine,
		`CSV header should be:\n  ${EXPECTED_HEADER}\nGot:\n  ${headerLine}`,
	).toBe(EXPECTED_HEADER);

	// ── Assert: data rows exist (if we have trainers) ─────────────────────────
	if (trainerCount > 0) {
		// There should be at least 2 lines: header + at least one data row (TOTALS counts too)
		expect(
			lines.length,
			"CSV should have header + at least one data row",
		).toBeGreaterThanOrEqual(2);

		// The last line is always the TOTALS row; check it contains "TOTALS"
		const lastLine = lines[lines.length - 1]!;
		expect(lastLine, "Last CSV row should be the TOTALS row").toContain(
			'"TOTALS"',
		);
	}

	// ── Assert: known trainer appears in the CSV (if we have a name) ──────────
	if (firstTrainerName) {
		const trainerFound = lines.some((line) => line.includes(firstTrainerName));
		expect(
			trainerFound,
			`Expected trainer "${firstTrainerName}" to appear in CSV`,
		).toBe(true);
	}

	// ── Cleanup temp file ─────────────────────────────────────────────────────
	try {
		fs.unlinkSync(savePath);
	} catch {
		// best-effort
	}
});
