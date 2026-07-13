import { chromium, request } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3022";
const OUT = "_e2e/results/proof";
mkdirSync(OUT, { recursive: true });
const api = await request.newContext({ baseURL: BASE });
await api.post("/api/auth/sign-in/email", {
	headers: { origin: BASE, "content-type": "application/json" },
	data: { email: "franchisee@gmail.com", password: "password123" },
});
const st = await api.storageState();
const uc = await api.post("/rpc/auth/userContext", {
	headers: { origin: BASE, "content-type": "application/json" },
	data: { json: {} },
});
const org = (await uc.json()).json.currentOrganizationId;
const b = await chromium.launch();
const ctx = await b.newContext({
	baseURL: BASE,
	storageState: st,
	viewport: { width: 1280, height: 800 },
});
await ctx.addInitScript(
	(o) => localStorage.setItem("current_organization_id", o),
	org,
);
const p = await ctx.newPage();
await p.goto("/dashboard/branch/view", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(3500);
// expand tree toward Ara Damansara, then select it
for (const label of ["Malaysia", "Selangor", "Klang Valley", "Central"]) {
	const el = p.getByText(label, { exact: true }).first();
	if (await el.count().catch(() => 0)) {
		await el.click().catch(() => {});
		await p.waitForTimeout(700);
	}
}
const target = p.getByText("Ara Damansara", { exact: true }).first();
if (await target.count().catch(() => 0)) {
	await target.click().catch(() => {});
	await p.waitForTimeout(2500);
	console.log("clicked Ara Damansara");
} else {
	console.log("Ara Damansara not directly visible");
}
await p.screenshot({ path: `${OUT}/avantej-16-opening-hours.png` });
console.log("done", p.url());
await b.close();
await api.dispose();
