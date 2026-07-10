/**
 * Reusable Linear proof capture (built for scale).
 *
 * Records ONE walkthrough video + per-route screenshots of the given dashboard
 * routes, authenticated via the API-only flow (no dashboard-crash risk at login).
 * Use it to attach visual proof to a Linear issue after the executable e2e spec
 * passes. See _rules/working-with-linear/README.md.
 *
 * Usage:
 *   BASE=http://localhost:3022 \
 *   ROUTES="/dashboard/reports/view,/dashboard/overview" \
 *   LABEL=avantej-9 \
 *   node _e2e/proof-capture.mjs
 *
 * Env:
 *   BASE    web origin (default http://localhost:3022)
 *   ROUTES  comma-separated dashboard routes to walk (required)
 *   LABEL   output basename (default "proof")
 *   WAITMS  settle time per route (default 3500)
 * Output: _e2e/results/proof/<LABEL>.webm  and  <LABEL>-<n>-<slug>.png
 */
import { chromium, request } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3022";
const ROUTES = (process.env.ROUTES ?? "")
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);
const LABEL = process.env.LABEL ?? "proof";
const WAITMS = Number(process.env.WAITMS ?? 3500);
if (ROUTES.length === 0) throw new Error("ROUTES env is required");

const OUT = "_e2e/results/proof";
const VIDEO_DIR = `${OUT}/_video-${LABEL}`;
mkdirSync(OUT, { recursive: true });

const H = { origin: BASE, "content-type": "application/json" };
const api = await request.newContext({ baseURL: BASE });
const si = await api.post("/api/auth/sign-in/email", {
	headers: H,
	data: {
		email: process.env.E2E_EMAIL ?? "franchisee@gmail.com",
		password: process.env.E2E_PASSWORD ?? "password123",
	},
});
if (!si.ok()) throw new Error(`sign-in ${si.status()}`);
const storageState = await api.storageState();
const uc = await api.post("/rpc/auth/userContext", {
	headers: H,
	data: { json: {} },
});
const orgId = ((await uc.json()).json ?? {}).currentOrganizationId;
if (!orgId) throw new Error("no orgId from userContext");

const browser = await chromium.launch();
const ctx = await browser.newContext({
	baseURL: BASE,
	storageState,
	recordVideo: { dir: VIDEO_DIR, size: { width: 1280, height: 720 } },
	viewport: { width: 1280, height: 720 },
});
await ctx.addInitScript(
	(o) => localStorage.setItem("current_organization_id", o),
	orgId,
);
const page = await ctx.newPage();

const errs = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));

let i = 0;
for (const route of ROUTES) {
	i += 1;
	const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
	try {
		await page.goto(route, { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(WAITMS);
		await page.screenshot({ path: `${OUT}/${LABEL}-${i}-${slug}.png` });
		console.log("captured", route, "->", page.url());
	} catch (e) {
		console.warn("route failed", route, String(e).slice(0, 140));
	}
}

await page.close();
await ctx.close(); // finalizes the video
await browser.close();
await api.dispose();

// Rename the single recorded video to a stable name.
const vids = readdirSync(VIDEO_DIR).filter((f) => f.endsWith(".webm"));
if (vids[0]) {
	renameSync(`${VIDEO_DIR}/${vids[0]}`, `${OUT}/${LABEL}.webm`);
	console.log("video ->", `${OUT}/${LABEL}.webm`);
}
console.log("consoleErrors", errs.length);
