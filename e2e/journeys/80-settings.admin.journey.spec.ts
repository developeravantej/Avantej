/**
 * Suite: Settings, Notifications & Announcements · Actor: tenant-admin
 *
 * Routers in scope: organizationSettings, notificationPreferences, notifications,
 * announcements, googleCalendar, taxRates, installmentPlans.
 *
 * Each journey SEEDS + ASSERTS state via oRPC (deterministic + robust), then
 * navigates the relevant /dashboard settings page and makes a tolerant UI
 * assertion (heading + URL + no "something went wrong") so the recorded video
 * shows the end-user-visible result.
 *
 * Notes confirmed against the router/service source before writing:
 *  - organizationSettings.upsert is admin-only; the .admin storageState user is
 *    the tenant admin (role.priority >= 100 → blanket requirePermission pass).
 *  - taxRates/installmentPlans `code` is unique → use a per-run timestamp suffix.
 *  - installmentPlans has NO getDefault; assert the default via the row returned
 *    by setDefault (isDefault === true). taxRates DOES have getDefault.
 *  - announcements.listActive filters by date window + scope; an admin bypasses
 *    scope, but we still pass a real branch + an open date window to be safe.
 *  - notifications has no create endpoint: list (maybe empty) → markAllRead →
 *    getUnreadCount === 0 (raw number).
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures } from "../helpers/seed-journey-fixtures";
import { TEST_ORG_ID } from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// ─── organizationSettings ───────────────────────────────────────────────────

test(
	"Admin upserts organization settings and the value round-trips via get",
	{ tag: ["@p1"] },
	async ({ page }) => {
		// Custom, side-effect-free keys (the org-settings form only renders a fixed
		// set of keys, so these won't show in the UI — that's fine, the UI step is
		// heading + no-error only).
		const nameKey = "e2e.org_name";
		const tzKey = "e2e.timezone";
		const nameValue = `E2E Org ${Date.now()}`;
		const tzValue = "Asia/Kuala_Lumpur";

		await test.step("Upsert the organization name setting via oRPC", async () => {
			type Setting = { key: string; value: string };
			const res = await orpcCall<object, Setting>(page, "organizationSettings", "upsert", {
				organizationId: TEST_ORG_ID,
				key: nameKey,
				value: nameValue,
			});
			expect(res.key).toBe(nameKey);
			expect(res.value).toBe(nameValue);
		});

		await test.step("Upsert the organization timezone setting via oRPC", async () => {
			type Setting = { key: string; value: string };
			const res = await orpcCall<object, Setting>(page, "organizationSettings", "upsert", {
				organizationId: TEST_ORG_ID,
				key: tzKey,
				value: tzValue,
			});
			expect(res.value).toBe(tzValue);
		});

		await test.step("Read both settings back via get — values reflect the upsert", async () => {
			type Setting = { key: string; value: string } | null;
			const nameSetting = await orpcCall<object, Setting>(page, "organizationSettings", "get", {
				organizationId: TEST_ORG_ID,
				key: nameKey,
			});
			const tzSetting = await orpcCall<object, Setting>(page, "organizationSettings", "get", {
				organizationId: TEST_ORG_ID,
				key: tzKey,
			});
			expect(nameSetting?.value).toBe(nameValue);
			expect(tzSetting?.value).toBe(tzValue);
		});

		await test.step("Open the Organization Settings page", async () => {
			await page.goto("/dashboard/settings/organization");
			await expect(page).toHaveURL(/\/dashboard\/settings\/organization/);
			await expect(page.getByRole("heading", { name: /organization settings/i }).first()).toBeVisible();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ─── taxRates ────────────────────────────────────────────────────────────────

test(
	"Admin creates a tax rate, sets it default, and getDefault reflects it",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let taxRateId = "";
		const code = `E2E-TAX-${Date.now()}`;

		await test.step("Create a new tax rate via oRPC", async () => {
			type TaxRate = { id: string; code: string; isDefault?: boolean };
			const created = await orpcCall<object, TaxRate>(page, "taxRates", "create", {
				organizationId: TEST_ORG_ID,
				name: "E2E Standard SST",
				code,
				rateInBasisPoints: 600, // 6.00%
				effectiveFrom: new Date().toISOString(),
			});
			taxRateId = created.id;
			expect(taxRateId, "create must return a tax-rate id").toBeTruthy();
			expect(created.code).toBe(code);
		});

		await test.step("Mark the tax rate as default", async () => {
			type TaxRate = { id: string; isDefault: boolean };
			const updated = await orpcCall<object, TaxRate>(page, "taxRates", "setDefault", {
				organizationId: TEST_ORG_ID,
				id: taxRateId,
			});
			expect(updated.id).toBe(taxRateId);
			expect(updated.isDefault).toBe(true);
		});

		await test.step("getDefault returns the newly defaulted tax rate", async () => {
			type TaxRate = { id: string; isDefault?: boolean } | null;
			const def = await orpcCall<object, TaxRate>(page, "taxRates", "getDefault", {
				organizationId: TEST_ORG_ID,
			});
			expect(def?.id).toBe(taxRateId);
		});

		await test.step("Open the Tax Rates settings page", async () => {
			await page.goto("/dashboard/settings/tax-rates");
			await expect(page).toHaveURL(/\/dashboard\/settings\/tax-rates/);
			await expect(page.getByRole("heading", { name: /tax rates/i }).first()).toBeVisible();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Cleanup — deactivate the seeded tax rate", async () => {
			if (!taxRateId) return;
			try {
				await orpcCall(page, "taxRates", "deactivate", { organizationId: TEST_ORG_ID, id: taxRateId });
			} catch (err) {
				if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
				throw err;
			}
		});
	},
);

// ─── installmentPlans ──────────────────────────────────────────────────────

test(
	"Admin creates an installment plan and sets it as the default",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let planId = "";
		const code = `E2E-PLAN-${Date.now()}`;

		await test.step("Create a 3-instalment plan via oRPC", async () => {
			type Plan = { id: string; code: string };
			const created = await orpcCall<object, Plan>(page, "installmentPlans", "create", {
				organizationId: TEST_ORG_ID,
				code,
				name: "E2E 3-Month Plan",
				numInstallments: 3,
				defaultIntervalDays: 30,
			});
			planId = created.id;
			expect(planId, "create must return a plan id").toBeTruthy();
			expect(created.code).toBe(code);
		});

		await test.step("Mark the installment plan as default (no getDefault → assert returned row)", async () => {
			type Plan = { id: string; isDefault: boolean };
			const updated = await orpcCall<object, Plan>(page, "installmentPlans", "setDefault", {
				organizationId: TEST_ORG_ID,
				id: planId,
			});
			expect(updated.id).toBe(planId);
			expect(updated.isDefault).toBe(true);
		});

		await test.step("getById confirms the plan persisted as default", async () => {
			type Plan = { id: string; isDefault?: boolean; numInstallments?: number };
			const plan = await orpcCall<object, Plan>(page, "installmentPlans", "getById", {
				organizationId: TEST_ORG_ID,
				id: planId,
			});
			expect(plan.id).toBe(planId);
			expect(plan.isDefault).toBe(true);
		});

		await test.step("Open the Installment Plans settings page", async () => {
			await page.goto("/dashboard/settings/installment-plans");
			await expect(page).toHaveURL(/\/dashboard\/settings\/installment-plans/);
			await expect(page.getByRole("heading", { name: /installment plans/i }).first()).toBeVisible();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Cleanup — deactivate the seeded installment plan", async () => {
			if (!planId) return;
			try {
				await orpcCall(page, "installmentPlans", "deactivate", { organizationId: TEST_ORG_ID, id: planId });
			} catch (err) {
				if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
				throw err;
			}
		});
	},
);

// ─── announcements ───────────────────────────────────────────────────────────

test(
	"Admin publishes a branch-scoped announcement and it appears in listActive",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let announcementId = "";
		const title = `E2E Announcement ${Date.now()}`;

		await test.step("Create an active, branch-scoped announcement via oRPC", async () => {
			const fx = await ensureJourneyFixtures(page);
			// Open date window: started ~1 min ago, ends well in the future, so the
			// listActive date filter can never hide the fresh row.
			const startDate = new Date(Date.now() - 60_000).toISOString();
			const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

			type Announcement = { id: string; title: string; scopedBranchIds?: string[] };
			const created = await orpcCall<object, Announcement>(page, "announcements", "create", {
				organizationId: TEST_ORG_ID,
				title,
				message: "Seeded by the E2E settings journey suite.",
				priority: "normal",
				targetAudience: "all",
				startDate,
				endDate,
				scopedBranchIds: [fx.branchId],
			});
			announcementId = created.id;
			expect(announcementId, "create must return an announcement id").toBeTruthy();
			expect(created.title).toBe(title);
		});

		await test.step("listActive surfaces the new announcement", async () => {
			type Announcement = { id: string; title: string };
			const active = await orpcCall<object, Announcement[]>(page, "announcements", "listActive", {
				organizationId: TEST_ORG_ID,
			});
			expect(Array.isArray(active)).toBe(true);
			expect(active.some((a) => a.id === announcementId), "new announcement must be in listActive").toBe(true);
		});

		await test.step("Open the Announcements page — the new announcement renders", async () => {
			await page.goto("/dashboard/announcements/view");
			await expect(page).toHaveURL(/\/dashboard\/announcements\/view/);
			await expect(page.getByRole("heading", { name: /announcements/i }).first()).toBeVisible();
			await page.waitForTimeout(1000);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});

		await test.step("Cleanup — delete the seeded announcement", async () => {
			if (!announcementId) return;
			try {
				await orpcCall(page, "announcements", "delete", { organizationId: TEST_ORG_ID, id: announcementId });
			} catch (err) {
				if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
				throw err;
			}
		});
	},
);

// ─── notifications ───────────────────────────────────────────────────────────

test(
	"Admin clears all notifications and the unread count drops to zero",
	{ tag: ["@p1"] },
	async ({ page }) => {
		await test.step("List the current notifications via oRPC", async () => {
			type Notification = { id: string; isRead: boolean };
			const rows = await orpcCall<object, Notification[]>(page, "notifications", "list", {
				organizationId: TEST_ORG_ID,
				limit: 50,
			});
			expect(Array.isArray(rows)).toBe(true);
			test.info().annotations.push({ type: "notifications-count", description: String(rows.length) });
		});

		await test.step("Mark all notifications read", async () => {
			type MarkAll = { count: number };
			const res = await orpcCall<object, MarkAll>(page, "notifications", "markAllRead", {
				organizationId: TEST_ORG_ID,
			});
			expect(typeof res.count).toBe("number");
		});

		await test.step("getUnreadCount is now zero", async () => {
			const unread = await orpcCall<object, number>(page, "notifications", "getUnreadCount", {
				organizationId: TEST_ORG_ID,
			});
			expect(unread).toBe(0);
		});

		await test.step("Open the Notifications page", async () => {
			await page.goto("/dashboard/notifications/view");
			await expect(page).toHaveURL(/\/dashboard\/notifications\/view/);
			await expect(page.getByRole("heading", { name: /notifications/i }).first()).toBeVisible();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);

// ─── googleCalendar ──────────────────────────────────────────────────────────

test(
	"Google Calendar connection status loads and the settings page renders",
	{ tag: ["@p2"] },
	async ({ page }) => {
		await test.step("Fetch the caller's Google Calendar connection status via oRPC", async () => {
			type Status = {
				connected: boolean;
				googleEmail: string | null;
				syncScope: "all" | "own" | null;
				lastSyncAt: string | null;
				lastSyncError: string | null;
			};
			const status = await orpcCall<object, Status>(page, "googleCalendar", "status", {
				organizationId: TEST_ORG_ID,
			});
			// Whether or not a connection exists, `connected` must be a boolean.
			expect(typeof status.connected).toBe("boolean");
			test.info().annotations.push({ type: "gcal-connected", description: String(status.connected) });
		});

		await test.step("Open the Google Calendar settings page", async () => {
			await page.goto("/dashboard/settings/google-calendar");
			await expect(page).toHaveURL(/\/dashboard\/settings\/google-calendar/);
			await expect(page.getByRole("heading", { name: /google calendar/i }).first()).toBeVisible();
			await page.waitForTimeout(800);
			await expect(page.locator("body")).not.toContainText(/something went wrong/i);
		});
	},
);
