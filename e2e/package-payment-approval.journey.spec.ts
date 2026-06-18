/**
 * Journey: A purchased package awaiting payment is approved on the Approvals page
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P1
 *
 * Why not a literal POS sale?
 *   Offline POS payments (cash/card) auto-activate the package — pos.service sets
 *   status="active" for everything except stripe, so they never reach Approvals.
 *   The Approvals "Awaiting payment" tab is fed by purchased packages whose
 *   payment is still pending (online/installment sales, or packageInstances.create).
 *   This test seeds that exact row via the create API and drives the real
 *   "Confirm payment received" approval UI — the same gate a pending-payment sale hits.
 *
 * Steps:
 *   1. Create a uniquely-named customer (so the inbox row is unambiguous).
 *   2. Enable the approval gate, then create a purchased package with
 *      paymentStatus="pending" → it lands in `awaiting_payment` (status=pending).
 *   3. Approvals page → "Awaiting payment" tab → search the unique name → expand.
 *   4. STAGE 1 (payment approval): "Confirm payment received" → confirm dialog.
 *   5. Assert the "Payment confirmed …" toast; via API it moved to `pending`.
 *   6. STAGE 2 (assignment approval): "Pending" tab → "Approve & assign" a trainer.
 *   7. Assert the "Trainer assigned. Package is now active." toast; via API `approved`.
 *   8. Cleanup: deactivate the package, soft-delete the customer, restore the gate.
 *
 * Run: bunx playwright test e2e/package-payment-approval.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstService,
	pickFirstActiveTrainer,
	seedWalkInCustomer,
	cleanupWalkInCustomer,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

type Page = import("@playwright/test").Page;
const APPROVAL_KEY = "package_approval.required";

type PendingRow = {
	id: string;
	serviceName: string | null;
	customerName: string | null;
	status: string;
	paymentStatus: string | null;
};

async function listApprovals(
	page: Page,
	approvalStatus: "pending" | "approved" | "awaiting_payment" | "rejected",
): Promise<PendingRow[]> {
	try {
		return await orpcCall<object, PendingRow[]>(
			page,
			"packageInstances",
			"listPending",
			{
				organizationId: TEST_ORG_ID,
				scope: "all",
				limit: 200,
				approvalStatus,
			},
		);
	} catch {
		return [];
	}
}

async function getSetting(page: Page, key: string): Promise<string | null> {
	try {
		const res = await orpcCall<object, { key: string; value: string | null }>(
			page,
			"organizationSettings",
			"get",
			{ organizationId: TEST_ORG_ID, key },
		);
		return res.value ?? null;
	} catch {
		return null;
	}
}

async function setSetting(
	page: Page,
	key: string,
	value: string,
): Promise<void> {
	await orpcCall(page, "organizationSettings", "upsert", {
		organizationId: TEST_ORG_ID,
		key,
		value,
	});
}

test("Package approval: admin confirms payment then assigns a trainer to activate it", {
	tag: ["@p1"],
}, async ({ page }) => {
	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");

	const service = await pickFirstService(page, {
		isPackage: true,
		hasSessions: true,
	});
	test.skip(!service, "No package service (expirable + sessions) — skip");

	const trainer = await pickFirstActiveTrainer(page);
	test.skip(!trainer, "No active trainer to assign — skip");

	// Unique customer so the Approvals inbox row is unambiguous. A unique phone is
	// required — createUnclaimed dedupes by phone, so the fixed default phone would
	// reuse a prior run's customer (with its original name) and break the name match.
	const rand = Math.floor(Math.random() * 1e6);
	const uniqueName = `ApprovalPay ${rand}`;
	const uniquePhone = `+60 11-${String(rand).padStart(4, "0").slice(0, 4)} ${String(rand).padStart(4, "0").slice(-4)}`;
	const customer = await seedWalkInCustomer(page, {
		name: uniqueName,
		phone: uniquePhone,
	});
	test.skip(!customer, "Could not seed a unique customer — skip");

	const priorGate = await getSetting(page, APPROVAL_KEY);
	let packageInstanceId = "";

	try {
		// ── 1. Enable the approval gate ──────────────────────────────────────────
		await setSetting(page, APPROVAL_KEY, "true");

		// ── 2. Create a purchased package with payment still pending ──────────────
		const now = new Date("2026-06-01T00:00:00.000Z").getTime(); // fixed (Date.now unavailable in some ctx)
		const startsAt = new Date(now).toISOString();
		const expiresAt = new Date(now + 180 * 86_400_000).toISOString();

		const created = await orpcCall<object, { id: string }>(
			page,
			"packageInstances",
			"create",
			{
				organizationId: TEST_ORG_ID,
				serviceId: service!.id,
				clientId: customer!.userId,
				source: "purchased",
				paymentStatus: "pending", // → lands in awaiting_payment
				paymentMethod: "cash",
				totalPrice: 30000,
				creditsTotal:
					service!.sessionCount && service!.sessionCount > 0
						? service!.sessionCount
						: 10,
				startsAt,
				expiresAt,
			},
		);
		packageInstanceId = created.id;
		expect(packageInstanceId).toBeTruthy();

		// Confirm it is in the awaiting_payment bucket
		await expect
			.poll(
				async () =>
					(await listApprovals(page, "awaiting_payment")).some(
						(r) => r.id === packageInstanceId,
					),
				{ timeout: 8_000, message: "package should be awaiting payment" },
			)
			.toBe(true);

		// ── 3. Approvals page → Awaiting payment tab → find our row ──────────────
		await page.goto("/dashboard/operations/approvals");
		await page.waitForLoadState("networkidle");

		const awaitingTab = page.getByRole("button", { name: /awaiting payment/i });
		await expect(awaitingTab).toBeVisible({ timeout: 10_000 });
		await awaitingTab.click();

		// The Approvals inbox search box (NOT the sidebar "Power search…").
		const searchBox = page.getByPlaceholder(/search customer/i);
		await expect(searchBox).toBeVisible({ timeout: 5_000 });
		await searchBox.fill(uniqueName);
		await page.waitForTimeout(400);

		const row = page
			.locator('[class*="cursor-pointer"], li, tr, div[role="button"]')
			.filter({ hasText: uniqueName })
			.first();
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.click();

		// ── 4. Confirm payment received ──────────────────────────────────────────
		const confirmReceivedBtn = page.getByRole("button", {
			name: /confirm payment received/i,
		});
		await expect(confirmReceivedBtn).toBeVisible({ timeout: 5_000 });
		await confirmReceivedBtn.click();

		const dialog = page.locator('[role="dialog"]');
		await expect(dialog).toBeVisible({ timeout: 5_000 });
		const confirmPayBtn = dialog.getByRole("button", {
			name: /^confirm payment$/i,
		});
		await expect(confirmPayBtn).toBeEnabled({ timeout: 5_000 });
		await confirmPayBtn.click();

		// ── 5. Assert success toast ──────────────────────────────────────────────
		await expect(
			page.getByText(/payment confirmed|already confirmed/i),
		).toBeVisible({ timeout: 10_000 });

		// ── 6. Verify via API: left awaiting_payment, now pending ────────────────
		await expect
			.poll(
				async () =>
					(await listApprovals(page, "awaiting_payment")).some(
						(r) => r.id === packageInstanceId,
					),
				{
					timeout: 10_000,
					message: "package should leave awaiting_payment after confirmation",
				},
			)
			.toBe(false);

		expect(
			(await listApprovals(page, "pending")).some(
				(r) => r.id === packageInstanceId,
			),
		).toBe(true);

		// ── 7. Second approval stage: assign a trainer (= activate) ──────────────
		// The package now sits in the "Pending" tab awaiting trainer assignment.
		const pendingTab = page.getByRole("button", { name: /^pending$/i });
		await expect(pendingTab).toBeVisible({ timeout: 5_000 });
		await pendingTab.click();

		// Re-filter to our unique customer (switching tabs resets the expanded row).
		const searchBox2 = page.getByPlaceholder(/search customer/i);
		await searchBox2.fill(uniqueName);
		await page.waitForTimeout(400);

		const pendingRow = page
			.locator('[class*="cursor-pointer"], li, tr, div[role="button"]')
			.filter({ hasText: uniqueName })
			.first();
		await expect(pendingRow).toBeVisible({ timeout: 10_000 });
		await pendingRow.click();

		// Open the trainer picker popover
		const approveBtn = page.getByRole("button", { name: /approve & assign/i });
		await expect(approveBtn).toBeVisible({ timeout: 5_000 });
		await approveBtn.click();

		await expect(page.getByText(/select trainer/i).first()).toBeVisible({
			timeout: 5_000,
		});

		// Each popover entry's accessible name is "<initials> <Name> <role>", e.g.
		// "AW Alex Wong Trainer". Matching name + the trailing "trainer" role word
		// uniquely targets a popover entry (and avoids the portal-DOM ordering trap
		// a bare .first() fell into). Click whichever active trainer we picked; if
		// that exact name isn't listed, fall back to the first "… Trainer" entry.
		const esc = trainer!.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const namedTrainer = page.getByRole("button", {
			name: new RegExp(`${esc}\\s+trainer`, "i"),
		});
		const trainerBtn =
			(await namedTrainer.count()) > 0
				? namedTrainer.first()
				: page
						.getByRole("button", { name: /^[A-Z]{1,3}\s+.+\s+trainer$/i })
						.first();
		await trainerBtn.click();

		// Selecting flips the footer button from "Select a trainer above" to
		// "Assign <name>". Anchor on "Assign " + a non-space so it can't collide
		// with the "Assignable to me" filter button.
		const assignFooterBtn = page.getByRole("button", { name: /^assign \S/i });
		await expect(assignFooterBtn).toBeEnabled({ timeout: 5_000 });
		await assignFooterBtn.click();

		// ── 8. Assert trainer-assignment toast ──────────────────────────────────
		await expect(
			page.getByText(/trainer assigned\. package is now active/i),
		).toBeVisible({ timeout: 10_000 });

		// ── 9. Verify via API: left pending, now approved (active) ───────────────
		await expect
			.poll(
				async () =>
					(await listApprovals(page, "pending")).some(
						(r) => r.id === packageInstanceId,
					),
				{
					timeout: 10_000,
					message: "package should leave the pending tab after assignment",
				},
			)
			.toBe(false);

		expect(
			(await listApprovals(page, "approved")).some(
				(r) => r.id === packageInstanceId,
			),
		).toBe(true);
	} finally {
		// ── 10. Cleanup ──────────────────────────────────────────────────────────
		if (packageInstanceId) {
			try {
				await orpcCall(page, "packageInstances", "reject", {
					organizationId: TEST_ORG_ID,
					packageInstanceId,
					reason: "E2E cleanup",
				});
			} catch (err) {
				if (!(err instanceof OrpcClientError)) throw err;
			}
		}
		if (customer?.userId) await cleanupWalkInCustomer(page, customer.userId);
		try {
			await setSetting(page, APPROVAL_KEY, priorGate ?? "false");
		} catch {
			/* best-effort */
		}
	}
});
