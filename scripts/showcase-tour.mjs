/**
 * Platform Admin showcase video — standalone Playwright Node script.
 *
 * Runs Chromium with video recording, walks the major platform-admin
 * surfaces, and writes the result to
 * verification/showcase/platform-admin-tour.webm.
 *
 * Bypasses Playwright's @playwright/test webServer machinery because
 * the worktree shares a host with other dev servers — this driver
 * just talks to whatever WEB_URL + SERVER_URL the caller supplies.
 */

import { chromium } from "@playwright/test";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, sql } from "drizzle-orm";
import ws from "ws";
import { readFileSync, mkdirSync, renameSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as cps from "@avantej-core/db/schema/control-panel-schema";

neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const env = Object.fromEntries(
	readFileSync(resolve(repoRoot, "apps/server/.env"), "utf8")
		.split("\n")
		.filter((l) => l && !l.startsWith("#") && l.includes("="))
		.map((l) => {
			const i = l.indexOf("=");
			return [
				l.slice(0, i).trim(),
				l
					.slice(i + 1)
					.trim()
					.replace(/^"|"$/g, ""),
			];
		}),
);

const WEB = process.env.WEB_URL ?? "http://localhost:3011";
const SERVER = process.env.SERVER_URL ?? "http://localhost:3010";
const OUT_DIR = resolve(repoRoot, "verification/showcase");
mkdirSync(OUT_DIR, { recursive: true });

const pool = new Pool({ connectionString: env.DATABASE_URL });
const cp = drizzle({ client: pool, schema: cps });

const pause = (page, ms = 1500) => page.waitForTimeout(ms);

async function main() {
	console.log("[setup] ensuring snapshot columns");
	await cp.execute(sql`
		ALTER TABLE tenant_usage_snapshots
			ADD COLUMN IF NOT EXISTS health_score integer,
			ADD COLUMN IF NOT EXISTS risk_flags jsonb;
	`);

	// Provision a super-admin
	const suffix = `showcase-${Date.now()}`;
	const email = `e2e-admin-${suffix}@test.local`;
	const password = "TestPass123!";

	console.log("[setup] sign-up super-admin", email);
	const su = await fetch(`${SERVER}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Origin: WEB },
		body: JSON.stringify({
			email,
			password,
			name: "SaaS Owner (Demo)",
			firstName: "SaaS",
			lastName: "Owner",
		}),
	});
	const suBody = await su.json();
	if (!suBody.user) {
		throw new Error(`sign-up failed: ${JSON.stringify(suBody)}`);
	}
	const userId = suBody.user.id;
	await cp
		.update(cps.user)
		.set({ emailVerified: true, name: "SaaS Owner (Demo)" })
		.where(eq(cps.user.id, userId));
	await cp.insert(cps.platformAdmins).values({ userId, role: "super_admin" });

	// Pick a real v4 UUID org
	const [org] = await cp
		.select({ id: cps.organizations.id, name: cps.organizations.name })
		.from(cps.organizations)
		.where(sql`${cps.organizations.id}::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4'`)
		.limit(1);
	if (!org) throw new Error("no v4 org");
	const orgId = org.id;
	console.log("[setup] target org", orgId, org.name);

	// Seed sparkline data
	const today = new Date();
	const isoDate = (d) => d.toISOString().slice(0, 10);
	const seeds = [
		{ d: 10, score: 88 },
		{ d: 9, score: 84 },
		{ d: 8, score: 80 },
		{ d: 7, score: 76 },
		{ d: 6, score: 72 },
		{ d: 5, score: 70 },
		{ d: 4, score: 68 },
		{ d: 3, score: 65 },
		{ d: 2, score: 64 },
		{ d: 1, score: 62 },
	];
	for (const s of seeds) {
		const dt = new Date(today.getTime() - s.d * 86400000);
		await cp
			.insert(cps.tenantUsageSnapshots)
			.values({
				organizationId: orgId,
				snapshotDate: isoDate(dt),
				memberCount: 42,
				customerCount: 318,
				apptCount30d: 740,
				salesTotal30dMinor: 1450000,
				salesCurrency: "MYR",
				storageBytes: 0,
				ghlActive: true,
				healthScore: s.score,
				riskFlags: [],
			})
			.onConflictDoUpdate({
				target: [
					cps.tenantUsageSnapshots.organizationId,
					cps.tenantUsageSnapshots.snapshotDate,
				],
				set: { healthScore: s.score, riskFlags: [] },
			});
	}
	await cp
		.insert(cps.tenantUsageSnapshots)
		.values({
			organizationId: orgId,
			snapshotDate: isoDate(today),
			memberCount: 42,
			customerCount: 318,
			apptCount30d: 740,
			salesTotal30dMinor: 1450000,
			salesCurrency: "MYR",
			storageBytes: 0,
			ghlActive: true,
			healthScore: 58,
			riskFlags: [
				{
					code: "low_activity",
					severity: "warn",
					observedAt: today.toISOString(),
				},
				{
					code: "payment_stale",
					severity: "warn",
					observedAt: today.toISOString(),
				},
			],
		})
		.onConflictDoUpdate({
			target: [
				cps.tenantUsageSnapshots.organizationId,
				cps.tenantUsageSnapshots.snapshotDate,
			],
			set: {
				healthScore: 58,
				riskFlags: [
					{
						code: "low_activity",
						severity: "warn",
						observedAt: today.toISOString(),
					},
					{
						code: "payment_stale",
						severity: "warn",
						observedAt: today.toISOString(),
					},
				],
			},
		});

	console.log("[browser] launching chromium");
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		recordVideo: { dir: OUT_DIR, size: { width: 1440, height: 900 } },
	});
	const page = await context.newPage();
	page.on("pageerror", (e) => console.log("[pageerror]", e.message));

	try {
		console.log("[stop 1] login");
		await page.goto(`${WEB}/login`);
		await page.fill('input[type="email"]', email);
		await page.fill('input[type="password"]', password);
		await page.click('button[type="submit"]');
		await page.waitForURL(/\/(dashboard|customers|home|onboarding)/, {
			timeout: 20000,
		});
		await pause(page, 2000);

		console.log("[stop 2] mission control");
		await page.goto(`${WEB}/dashboard/platform-admin/`);
		await page.waitForLoadState("networkidle").catch(() => {});
		await pause(page, 3500);

		console.log("[stop 3] tenants list");
		await page.goto(`${WEB}/dashboard/platform-admin/tenants`);
		await page.waitForLoadState("networkidle").catch(() => {});
		await pause(page, 2500);
		const search = page.getByPlaceholder(/Search.*name.*slug.*owner/i).first();
		if ((await search.count()) > 0) {
			await search.fill(org.name.slice(0, Math.min(6, org.name.length)));
			await pause(page, 2500);
			await search.fill("");
			await pause(page, 800);
		}

		console.log("[stop 4] drill-in overview");
		await page.goto(`${WEB}/dashboard/platform-admin/tenants/${orgId}`);
		await page.waitForLoadState("networkidle").catch(() => {});
		await pause(page, 3500);

		console.log("[stop 5] risk tab");
		const riskTab = page.getByRole("tab", { name: "Risk" });
		if (await riskTab.count()) {
			await riskTab.click();
			await pause(page, 1500);
			await page
				.getByTestId("tenant-risk-tab")
				.waitFor({ state: "visible", timeout: 8000 })
				.catch(() => {});
			await pause(page, 4000);
		}

		console.log("[stop 6] usage tab");
		const usageTab = page.getByRole("tab", { name: "Usage" });
		if (await usageTab.count()) {
			await usageTab.click();
			await pause(page, 3500);
		}

		console.log("[stop 7] notes tab — pin a note");
		const notesTab = page.getByRole("tab", { name: "Notes" });
		if (await notesTab.count()) {
			await notesTab.click();
			await pause(page, 1500);
			const body = page.getByTestId("note-composer-body");
			if (await body.count()) {
				await body.fill(
					"Onboarding call with this franchiser next Mon — flag for follow-up.",
				);
				await pause(page, 1500);
				const pin = page.getByTestId("note-composer-pin");
				if (await pin.count()) await pin.check();
				await pause(page, 800);
				const submit = page.getByTestId("note-composer-submit");
				if (await submit.count()) await submit.click();
				await pause(page, 2500);
			}
		}

		console.log("[stop 8] comms tab");
		const commsTab = page.getByRole("tab", { name: "Comms" });
		if (await commsTab.count()) {
			await commsTab.click();
			await pause(page, 1500);
			const dmSubject = page.getByPlaceholder("Subject").first();
			const dmMsg = page.getByPlaceholder("Message").first();
			if (await dmSubject.count()) {
				await dmSubject.fill("Quarterly check-in");
				await pause(page, 600);
				await dmMsg.fill(
					"Hi — quick check-in on H1 milestones. Reach out anytime.",
				);
				await pause(page, 3000);
			}
		}

		console.log("[stop 9] actions tab");
		const actionsTab = page.getByRole("tab", { name: "Actions" });
		if (await actionsTab.count()) {
			await actionsTab.click();
			await pause(page, 4000);
		}

		console.log("[stop 10] health scoreboard");
		await page.goto(`${WEB}/dashboard/platform-admin/health`);
		await page.waitForLoadState("networkidle").catch(() => {});
		await pause(page, 3500);

		console.log("[stop 11] renewals");
		await page.goto(`${WEB}/dashboard/platform-admin/renewals`);
		await page.waitForLoadState("networkidle").catch(() => {});
		await pause(page, 3500);

		console.log("[stop 12] ⌘K palette");
		await page.goto(`${WEB}/dashboard/platform-admin/tenants`);
		await page.waitForLoadState("networkidle").catch(() => {});
		await pause(page, 1500);
		await page.keyboard.press("Meta+k");
		await pause(page, 1500);
		const palInput = page.getByTestId("command-palette-input");
		if (await palInput.count()) {
			await palInput.fill(org.name.slice(0, Math.min(4, org.name.length)));
			await pause(page, 3000);
			await page.keyboard.press("Escape");
			await pause(page, 800);
		}
	} finally {
		await context.close();
		await browser.close();
	}

	// Move the recorded webm to deterministic filename
	const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".webm"));
	files.sort();
	const recorded = files[files.length - 1];
	if (recorded) {
		const target = resolve(OUT_DIR, "platform-admin-tour.webm");
		renameSync(resolve(OUT_DIR, recorded), target);
		console.log("[done] video at", target);
	} else {
		console.log("[warn] no video produced");
	}

	await pool.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
