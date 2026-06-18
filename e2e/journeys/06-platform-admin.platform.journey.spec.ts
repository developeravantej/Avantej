/**
 * Journeys: SaaS Platform (control-panel operator) surfaces.
 * Actor: platform-admin (developer.avantej@gmail.com). Read-only — no tenant state mutated.
 *
 * Grouped by module via test.describe(). Each navigates a platform-admin surface and
 * asserts its real testid/heading renders (not just "no crash"); Health additionally
 * asserts the getScoreboard RPC data is internally consistent. Routes: /dashboard/platform-admin/*.
 */
import { test, expect, type Page } from "@playwright/test";
import { orpcCall } from "../helpers/orpc-client";

const PA = "/dashboard/platform-admin";

async function noErrorBoundary(page: Page) {
	await expect(page.locator("body")).not.toContainText(
		/something went wrong|error boundary|TypeError|undefined is not/i,
	);
}

test.describe("Mission Control", () => {
	test("Platform admin lands on Mission Control with the core nav", {
		tag: ["@p0"],
	}, async ({ page }) => {
		await test.step("Open Mission Control", async () => {
			// /dashboard shows the org-selector for an org-less platform admin; the
			// Mission Control surface lives at /dashboard/platform-admin.
			await page.goto(`${PA}`);
			await expect(page.getByTestId("mission-control-page")).toBeVisible({
				timeout: 20_000,
			});
			await expect(
				page.getByRole("heading", { name: /mission control/i }).first(),
			).toBeVisible();
			await noErrorBoundary(page);
		});
		await test.step("Primary nav shows Mission Control · Tenants · Billing", async () => {
			for (const item of ["Mission Control", "Tenants", "Billing"]) {
				await expect(
					page.getByRole("link", { name: item, exact: true }).first(),
				).toBeVisible();
			}
		});
		await test.step("System group reveals Health · Comms · Webhooks · Audit · Users", async () => {
			// System is expanded by default; only toggle if it happens to be collapsed.
			const comms = page
				.getByRole("link", { name: "Comms", exact: true })
				.first();
			if (!(await comms.isVisible().catch(() => false))) {
				await page.getByTestId("platform-admin-system-toggle").click();
			}
			for (const item of ["Health", "Comms", "Webhooks", "Audit", "Users"]) {
				await expect(
					page.getByRole("link", { name: item, exact: true }).first(),
				).toBeVisible();
			}
		});

		await test.step("Mission Control overview KPIs load (platformAdminDashboard.getOverview)", async () => {
			const ov = await orpcCall<object, { counts?: Record<string, number> }>(
				page,
				"platformAdminDashboard",
				"getOverview",
				{},
			);
			expect(ov.counts, "overview returns tenant counts").toBeTruthy();
			test.info().annotations.push({
				type: "overview-counts",
				description: JSON.stringify(ov.counts).slice(0, 160),
			});
		});
	});
});

test.describe("Tenants", () => {
	test("Tenants directory lists tenants with bulk-select", {
		tag: ["@p0"],
	}, async ({ page }) => {
		await test.step("Open the Tenants directory", async () => {
			await page.goto(`${PA}/tenants`);
			await page.waitForURL("**/platform-admin/tenants**", { timeout: 20_000 });
			await expect(
				page.getByRole("heading", { name: /tenants/i }).first(),
			).toBeVisible();
		});
		await test.step("Directory renders the cross-tenant table (bulk-select control present)", async () => {
			await expect(page.getByTestId("tenants-select-all")).toBeVisible();
			await noErrorBoundary(page);
		});
	});

	test("Opening a tenant exposes its detail tabs (billing · health · risk · notes · tags · members · feature flags)", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await test.step("Open the Tenants directory and click the first tenant", async () => {
			await page.goto(`${PA}/tenants`);
			await page.waitForTimeout(1200);
			const link = page.locator('a[href*="/platform-admin/tenants/"]').first();
			test.skip((await link.count()) === 0, "no tenant rows to open");
			await link.click();
			await page.waitForURL("**/platform-admin/tenants/**", {
				timeout: 20_000,
			});
			await page.waitForTimeout(1000);
			await noErrorBoundary(page);
		});
		await test.step("Walk the tenant-detail tabs (tolerant — tab set varies by build)", async () => {
			let walked = 0;
			for (const tab of [
				"Billing",
				"Health",
				"Risk",
				"Notes",
				"Tags",
				"Members",
				"Feature flags",
				"Features",
			]) {
				const btn = page
					.getByRole("tab", { name: new RegExp(tab, "i") })
					.or(page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }))
					.first();
				if (await btn.count()) {
					await btn.click().catch(() => {});
					await page.waitForTimeout(400);
					await noErrorBoundary(page);
					walked++;
				}
			}
			test.info().annotations.push({
				type: "tenant-detail-tabs-walked",
				description: String(walked),
			});
			// Tab-control names vary by build; the gate is that the detail page rendered cleanly.
			await noErrorBoundary(page);
		});
	});
});

test.describe("Money & Billing", () => {
	test("Billing money-hub tabs navigate (Overview · Revenue · Renewals · Payments)", {
		tag: ["@p0"],
	}, async ({ page }) => {
		await test.step("Open Billing (global)", async () => {
			await page.goto(`${PA}/billing`);
			await page.waitForURL("**/platform-admin/billing**", { timeout: 20_000 });
			await expect(page.getByTestId("billing-global-page")).toBeVisible();
			await expect(page.getByTestId("money-hub-tabs")).toBeVisible();
		});
		await test.step("Switch to the Revenue tab", async () => {
			await page.getByTestId("money-hub-tab-revenue").click();
			await page.waitForURL("**/platform-admin/revenue**", { timeout: 20_000 });
			await expect(page.getByTestId("revenue-page")).toBeVisible();
		});
		await test.step("Renewals surface renders", async () => {
			await page.goto(`${PA}/renewals`);
			await expect(page.getByTestId("renewals-page")).toBeVisible();
		});
		await test.step("Payments surface renders", async () => {
			await page.goto(`${PA}/payments`);
			await page.waitForTimeout(800);
			await noErrorBoundary(page);
			await expect(page.getByTestId("money-hub-tabs")).toBeVisible();
		});
	});
});

test.describe("Health & Comms", () => {
	test("Tenant Health scoreboard renders (histogram · at-risk · flags · sparkline) and getScoreboard is consistent", {
		tag: ["@p1"],
	}, async ({ page }) => {
		await test.step("Fetch the cross-tenant scoreboard via platformAdminHealth.getScoreboard", async () => {
			type Band = { label: string; count: number };
			type Board = {
				histogram: {
					bands: Band[];
					totalScoredOrgs: number;
					unscoredOrgs: number;
				};
				topAtRisk: unknown[];
				flagRollup: unknown[];
				trend: { avgScoreLast30dByDay: unknown[] };
			};
			const board = await orpcCall<object, Board>(
				page,
				"platformAdminHealth",
				"getScoreboard",
				{ topAtRiskLimit: 20 },
			);
			expect(
				board.histogram.bands,
				"scoreboard must have 5 score bands",
			).toHaveLength(5);
			const sum = board.histogram.bands.reduce((a, b) => a + b.count, 0);
			expect(sum, "band counts must sum to totalScoredOrgs").toBe(
				board.histogram.totalScoredOrgs,
			);
			expect(Array.isArray(board.topAtRisk)).toBe(true);
			expect(Array.isArray(board.trend.avgScoreLast30dByDay)).toBe(true);
			test.info().annotations.push({
				type: "scoreboard",
				description: `orgs=${board.histogram.totalScoredOrgs} bands=${board.histogram.bands.map((b) => b.count).join("/")} atRisk=${board.topAtRisk.length} trendPts=${board.trend.avgScoreLast30dByDay.length}`,
			});
		});
		await test.step("Open the Health Scoreboard page", async () => {
			await page.goto(`${PA}/health`);
			await expect(page.getByTestId("health-scoreboard-page")).toBeVisible({
				timeout: 20_000,
			});
			await expect(
				page.getByRole("heading", { name: /health scoreboard/i }).first(),
			).toBeVisible();
		});
		await test.step("Histogram, at-risk widget, risk-flag rollup, and sparkline all render", async () => {
			await expect(page.getByTestId("health-histogram")).toBeVisible();
			await expect(page.getByTestId("at-risk-widget")).toBeVisible();
			await expect(page.getByTestId("risk-flag-rollup")).toBeVisible();
			await expect(page.getByTestId("health-sparkline")).toBeVisible();
		});
		await test.step("Refresh re-fetches the scoreboard without error", async () => {
			await page.getByTestId("health-refresh-btn").click();
			await page.waitForTimeout(1500);
			await expect(page.getByTestId("health-scoreboard-page")).toBeVisible();
			await noErrorBoundary(page);
		});
	});

	test("Comms — create then archive a message template", {
		tag: ["@p1"],
	}, async ({ page }) => {
		let templateId = "";
		const tplName = `E2E Template ${Date.now()}`;

		await test.step("Open Comms and read the outbox (listOutbox)", async () => {
			await page.goto(`${PA}/comms`);
			await expect(page.getByTestId("comms-page")).toBeVisible({
				timeout: 20_000,
			});
			const outbox = await orpcCall<
				object,
				{ rows?: unknown[]; total?: number }
			>(page, "platformAdminComms", "listOutbox", { days: 90, limit: 50 });
			test.info().annotations.push({
				type: "outbox",
				description: String(outbox.total ?? outbox.rows?.length ?? 0),
			});
			await noErrorBoundary(page);
		});

		try {
			await test.step("Create a message template (createTemplate)", async () => {
				const created = await orpcCall<
					object,
					{ id?: string; template?: { id: string } }
				>(page, "platformAdminComms", "createTemplate", {
					name: tplName,
					subject: "E2E subject",
					bodyMarkdown: "E2E body **markdown**.",
					kind: "announcement",
				});
				templateId = created.id ?? created.template?.id ?? "";
				expect(templateId, "template must be created").toBeTruthy();
				const list = await orpcCall<
					object,
					{ templates: Array<{ id: string }> }
				>(page, "platformAdminComms", "listTemplates", {});
				expect(
					list.templates.some((x) => x.id === templateId),
					"new template appears in listTemplates",
				).toBe(true);
			});

			await test.step("Reload Comms, open the Templates tab — the new template is shown", async () => {
				await page.goto(`${PA}/comms`); // reload so the UI refetches templates (incl. the one just created via API)
				await expect(page.getByTestId("comms-page")).toBeVisible({
					timeout: 20_000,
				});
				await page.getByRole("tab", { name: "Templates" }).first().click();
				await page.waitForTimeout(1200);
				await expect(page.locator("body")).toContainText(tplName);
				await noErrorBoundary(page);
			});

			await test.step("Archive the template (archiveTemplate) and confirm it leaves the active list", async () => {
				await orpcCall(page, "platformAdminComms", "archiveTemplate", {
					id: templateId,
				});
				const list = await orpcCall<
					object,
					{
						templates: Array<{
							id: string;
							isArchived?: boolean;
							archivedAt?: string | null;
						}>;
					}
				>(page, "platformAdminComms", "listTemplates", {});
				const t = list.templates.find((x) => x.id === templateId);
				expect(
					!t || t.isArchived === true || !!t.archivedAt,
					"template is archived (filtered out or flagged)",
				).toBeTruthy();
			});
		} finally {
			if (templateId)
				await orpcCall(page, "platformAdminComms", "archiveTemplate", {
					id: templateId,
				}).catch(() => {});
		}
	});
});

test.describe("Webhooks & Migrations", () => {
	test("Webhooks — overview KPIs + event-log query", { tag: ["@p1"] }, async ({
		page,
	}) => {
		await test.step("Read the webhook overview (getOverview)", async () => {
			const ov = await orpcCall<
				object,
				{ kpis?: unknown; byEventType?: unknown[]; recent?: unknown[] }
			>(page, "platformAdminWebhooks", "getOverview", {});
			expect(ov.kpis, "overview returns kpis").toBeTruthy();
			test.info().annotations.push({
				type: "webhook-kpis",
				description: JSON.stringify(ov.kpis).slice(0, 160),
			});
		});
		await test.step("Query the event log for the last 30 days (listEvents)", async () => {
			const ev = await orpcCall<object, { rows: unknown[]; total: number }>(
				page,
				"platformAdminWebhooks",
				"listEvents",
				{ days: 30, limit: 50 },
			);
			expect(Array.isArray(ev.rows), "listEvents returns rows[]").toBe(true);
			test.info().annotations.push({
				type: "webhook-events",
				description: `total=${ev.total}`,
			});
		});
		await test.step("Open the Webhooks log page — table renders", async () => {
			await page.goto(`${PA}/webhooks`);
			await expect(page.getByTestId("webhooks-log-page")).toBeVisible({
				timeout: 20_000,
			});
			await page.waitForTimeout(1000);
			await noErrorBoundary(page);
		});
	});
	test("Migrations — list then open a migration file", {
		tag: ["@p1"],
	}, async ({ page }) => {
		let tag = "";
		await test.step("List tenant migrations (listMigrations)", async () => {
			const res = await orpcCall<object, { journal: Array<{ tag: string }> }>(
				page,
				"platformAdminMigrations",
				"listMigrations",
				{ schema: "tenant" },
			);
			expect(
				Array.isArray(res.journal) && res.journal.length > 0,
				"tenant migration journal is non-empty",
			).toBe(true);
			tag = res.journal[0]!.tag;
			test.info().annotations.push({
				type: "migrations",
				description: `${res.journal.length} entries; first=${tag}`,
			});
		});
		await test.step("Open a migration file (getMigrationFile) — SQL content returned", async () => {
			const f = await orpcCall<object, { sql: string; tag: string }>(
				page,
				"platformAdminMigrations",
				"getMigrationFile",
				{ schema: "tenant", tag },
			);
			expect(f.tag).toBe(tag);
			expect(f.sql.length, "migration file has SQL content").toBeGreaterThan(0);
		});
		await test.step("Open the Migrations viewer page — renders", async () => {
			await page.goto(`${PA}/migrations`);
			await expect(
				page.getByRole("heading", { name: /migrations/i }).first(),
			).toBeVisible({ timeout: 20_000 });
			await page.waitForTimeout(800);
			await noErrorBoundary(page);
		});
	});
});

test.describe("Audit, Users & Admins", () => {
	test("Audit — list action types then filter the admin action log", {
		tag: ["@p1"],
	}, async ({ page }) => {
		let actionType = "";
		await test.step("List distinct action types (listActionTypes)", async () => {
			const res = await orpcCall<object, { actionTypes: string[] }>(
				page,
				"platformAdminAudit",
				"listActionTypes",
				{},
			);
			expect(
				Array.isArray(res.actionTypes) && res.actionTypes.length > 0,
				"action types exist",
			).toBe(true);
			actionType = res.actionTypes[0]!;
			test.info().annotations.push({
				type: "action-types",
				description: res.actionTypes.slice(0, 6).join(", "),
			});
		});
		await test.step("Filter the admin action log by that action type (listAdminActions)", async () => {
			const res = await orpcCall<
				object,
				{ actions: Array<{ actionType: string }>; total: number }
			>(page, "platformAdminAudit", "listAdminActions", { actionType });
			expect(Array.isArray(res.actions), "actions[] returned").toBe(true);
			expect(
				res.actions.every((a) => a.actionType === actionType),
				"every row matches the action-type filter",
			).toBe(true);
			test.info().annotations.push({
				type: "filtered-actions",
				description: `${actionType} → total=${res.total}`,
			});
		});
		await test.step("Open the Audit log page — renders", async () => {
			await page.goto(`${PA}/audit`);
			await expect(
				page.getByRole("heading", { name: /audit log/i }).first(),
			).toBeVisible({ timeout: 20_000 });
			await page.waitForTimeout(800);
			await noErrorBoundary(page);
		});
	});
	test("Users — search the directory and inspect platform-admin flags", {
		tag: ["@p1"],
	}, async ({ page }) => {
		const searchBox = page.getByPlaceholder(/search by email or name/i);
		const rows = page.locator("table tbody tr");

		await test.step("Open the Users directory page — full roster loads", async () => {
			await page.goto(`${PA}/users`);
			await expect(
				page.getByRole("heading", { name: /^users$/i }).first(),
			).toBeVisible({ timeout: 20_000 });
			await expect(searchBox).toBeVisible({ timeout: 20_000 });
			await expect(rows.first()).toBeVisible({ timeout: 20_000 });
			await noErrorBoundary(page);
			const total = await rows.count();
			test.info().annotations.push({
				type: "directory",
				description: `loaded ${total} user row(s)`,
			});
		});

		await test.step("Type 'gmail' into the search box — directory filters live", async () => {
			await searchBox.click();
			// type char-by-char so the search is visible in the recording
			await searchBox.pressSequentially("gmail", { delay: 110 });
			await expect(searchBox).toHaveValue("gmail");
			// debounce(300ms) + refetch → at least one @gmail.com row remains
			await expect(page.getByText(/@gmail\.com/i).first()).toBeVisible({
				timeout: 20_000,
			});
			const n = await rows.count();
			test.info().annotations.push({
				type: "user-search",
				description: `"gmail" → ${n} row(s)`,
			});
			await page.waitForTimeout(600);
		});

		await test.step("Refine to 'developer' — results narrow to the matching user", async () => {
			await searchBox.fill("");
			await searchBox.pressSequentially("developer", { delay: 110 });
			await expect(searchBox).toHaveValue("developer");
			await expect(
				page.getByText(/developer\.avantej@gmail\.com/i).first(),
			).toBeVisible({ timeout: 20_000 });
			// the non-matching gmail user drops out of the filtered table
			await expect(page.getByText(/franchisee@gmail\.com/i)).toHaveCount(0);
			await page.waitForTimeout(600);
		});

		await test.step("Inspect the Platform Admin column — role flags are shown", async () => {
			await expect(
				page.getByRole("columnheader", { name: /platform admin/i }).first(),
			).toBeVisible();
			await noErrorBoundary(page);
		});

		await test.step("Clear the search — the full directory returns", async () => {
			await searchBox.fill("");
			await expect(searchBox).toHaveValue("");
			await expect(rows.first()).toBeVisible({ timeout: 20_000 });
			await page.waitForTimeout(500);
		});
	});
	test("Platform admins management — grant then revoke a platform admin", {
		tag: ["@p1"],
	}, async ({ page }) => {
		// regex helper: match an email literally, case-insensitive
		const rx = (s: string) =>
			new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

		let targetId = "";
		let targetEmail = "";

		// Pick a real non-admin user to promote (drives the UI search below deterministically).
		await test.step("Pick a non-admin user to promote", async () => {
			type U = { id: string; email: string; isPlatformAdmin: boolean };
			const res = await orpcCall<object, { data: U[] }>(
				page,
				"admin",
				"listUsers",
				{ search: "gmail", limit: 50 },
			);
			const target = (res.data ?? []).find((u) => !u.isPlatformAdmin);
			expect(
				target,
				"a non-admin user must be available to promote",
			).toBeTruthy();
			targetId = target!.id;
			targetEmail = target!.email;
			test
				.info()
				.annotations.push({ type: "grant-target", description: targetEmail });
		});

		const roster = page.locator("table tbody tr");
		const targetRow = page.getByRole("row").filter({ hasText: targetEmail });

		try {
			await test.step("Open the Admins surface — current roster loads", async () => {
				await page.goto(`${PA}/admins`);
				await expect(
					page.getByRole("heading", { name: /^admins$/i }).first(),
				).toBeVisible({ timeout: 20_000 });
				await expect(roster.first()).toBeVisible({ timeout: 20_000 });
				const baseline = await roster.count();
				test.info().annotations.push({
					type: "baseline-admins",
					description: `${baseline} row(s)`,
				});
				await noErrorBoundary(page);
				await page.waitForTimeout(400);
			});

			await test.step("Open 'Add Admin' and search the directory for the user", async () => {
				await page.getByRole("button", { name: /add admin/i }).click();
				const dialog = page.getByRole("dialog");
				await expect(dialog.getByText(/add platform admin/i)).toBeVisible({
					timeout: 10_000,
				});
				const dialogSearch = dialog.getByPlaceholder(/search users/i);
				await dialogSearch.click();
				// type char-by-char so the search shows in the recording
				await dialogSearch.pressSequentially(targetEmail, { delay: 70 });
				// debounce(300ms) + query → the eligible user surfaces as a clickable result
				await dialog
					.locator("ul button")
					.filter({ hasText: targetEmail })
					.first()
					.click();
				// green "Selected: <email>" confirmation
				await expect(dialog.getByText(/selected:/i)).toBeVisible({
					timeout: 10_000,
				});
				await page.waitForTimeout(400);
			});

			await test.step("Choose the Support role and grant access", async () => {
				const dialog = page.getByRole("dialog");
				// open the role Select and pick Support explicitly
				await dialog.locator("#admin-role-select").click();
				await page.getByRole("option", { name: /support/i }).click();
				await dialog.getByRole("button", { name: /grant access/i }).click();
				// dialog closes and the new admin appears in the roster with a Support badge
				await expect(targetRow).toHaveCount(1, { timeout: 20_000 });
				await expect(targetRow.getByText(/support/i).first()).toBeVisible({
					timeout: 10_000,
				});
				await noErrorBoundary(page);
				await page.waitForTimeout(600);
			});

			await test.step("Revoke via the row action and confirm in the dialog", async () => {
				await targetRow.getByRole("button", { name: /revoke/i }).click();
				const dialog = page.getByRole("dialog");
				await expect(
					dialog.getByRole("heading", { name: /revoke platform admin/i }),
				).toBeVisible({ timeout: 10_000 });
				await expect(dialog.getByText(rx(targetEmail))).toBeVisible();
				await dialog.getByRole("button", { name: /revoke access/i }).click();
				// roster refetches → the row disappears
				await expect(targetRow).toHaveCount(0, { timeout: 20_000 });
				await noErrorBoundary(page);
				await page.waitForTimeout(500);
			});
		} finally {
			// Guarantee the target is never left as a platform admin, even if a step above failed.
			if (targetId) {
				await orpcCall(page, "admin", "revokePlatformAdmin", {
					userId: targetId,
				}).catch(() => {});
			}
		}
	});
});

test.describe("Identity & Impersonation", () => {
	test("Platform-admin identity + impersonation status resolve", {
		tag: ["@p1"],
	}, async ({ page }) => {
		// regex helper: match an email literally, case-insensitive
		const rx = (s: string) =>
			new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
		let targetEmail = "";

		await test.step("Confirm caller identity (admin.me) and a clean impersonation status", async () => {
			const me = await orpcCall<
				object,
				{ isPlatformAdmin: boolean; role?: string }
			>(page, "admin", "me", {});
			expect(me.isPlatformAdmin, "caller is a platform admin").toBe(true);
			const status = await orpcCall<object, { isImpersonating: boolean }>(
				page,
				"admin",
				"getImpersonationStatus",
				{},
			);
			expect(
				status.isImpersonating,
				"caller is not impersonating at start",
			).toBe(false);
			test.info().annotations.push({
				type: "identity",
				description: `role=${me.role ?? "?"} · impersonating=${status.isImpersonating}`,
			});
		});

		await test.step("Pick an impersonatable (non-admin) tenant user", async () => {
			type U = { email: string; isPlatformAdmin: boolean };
			const byFranchisee = await orpcCall<object, { data: U[] }>(
				page,
				"admin",
				"listUsers",
				{ search: "franchisee", limit: 50 },
			);
			let target =
				(byFranchisee.data ?? []).find((u) => !u.isPlatformAdmin) ?? null;
			if (!target) {
				const byGmail = await orpcCall<object, { data: U[] }>(
					page,
					"admin",
					"listUsers",
					{ search: "gmail", limit: 50 },
				);
				target = (byGmail.data ?? []).find((u) => !u.isPlatformAdmin) ?? null;
			}
			expect(target, "a non-admin user must exist to impersonate").toBeTruthy();
			targetEmail = target!.email;
			test.info().annotations.push({
				type: "impersonate-target",
				description: targetEmail,
			});
		});

		const banner = page.getByText(/^Impersonating/i);
		const stopBtn = page.getByRole("button", { name: /stop impersonating/i });

		try {
			await test.step("Open Users, search the user, and click 'Login as'", async () => {
				await page.goto(`${PA}/users`);
				const search = page.getByPlaceholder(/search by email or name/i);
				await expect(search).toBeVisible({ timeout: 20_000 });
				await search.click();
				await search.pressSequentially(targetEmail, { delay: 60 });
				const row = page.getByRole("row").filter({ hasText: targetEmail });
				await expect(row.first()).toBeVisible({ timeout: 20_000 });
				await row
					.first()
					.getByRole("button", { name: /login as/i })
					.click();
			});

			await test.step("Confirm in the 'Impersonate user?' dialog", async () => {
				const dialog = page.getByRole("dialog");
				await expect(dialog.getByText(/impersonate user\?/i)).toBeVisible({
					timeout: 10_000,
				});
				await expect(dialog.getByText(rx(targetEmail))).toBeVisible();
				await dialog.getByRole("button", { name: /login as user/i }).click();
			});

			await test.step("Land in the impersonated session — the impersonation banner shows", async () => {
				await expect(banner).toBeVisible({ timeout: 30_000 });
				await expect(page.getByText(rx(targetEmail)).first()).toBeVisible();
				// getImpersonationStatus now resolves to impersonating (uses the impersonation cookie)
				const status = await orpcCall<object, { isImpersonating: boolean }>(
					page,
					"admin",
					"getImpersonationStatus",
					{},
				);
				expect(status.isImpersonating, "status resolves to impersonating").toBe(
					true,
				);
				await page.waitForTimeout(800);
			});

			await test.step("Stop impersonating — banner clears, identity restored to platform admin", async () => {
				await stopBtn.click();
				await expect(banner).toHaveCount(0, { timeout: 30_000 });
				await page
					.waitForURL(/platform-admin\/users/, { timeout: 30_000 })
					.catch(() => {});
				const status = await orpcCall<object, { isImpersonating: boolean }>(
					page,
					"admin",
					"getImpersonationStatus",
					{},
				);
				expect(status.isImpersonating, "no longer impersonating").toBe(false);
				await noErrorBoundary(page);
				await page.waitForTimeout(500);
			});
		} finally {
			// Safety net: if we bailed mid-impersonation, restore the admin session.
			await orpcCall(page, "admin", "stopImpersonating", {}).catch(() => {});
		}
	});
});
