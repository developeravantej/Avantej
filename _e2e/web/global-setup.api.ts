import { request, type FullConfig } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * API-only global setup for the AVANTEJ-9 regression run.
 *
 * The default browser global-setup navigates to /dashboard, whose ~10 concurrent
 * tenant RPCs intermittently crash the local wrangler dev server. This variant
 * authenticates purely over HTTP (sign-in -> capture cookies -> resolve org via
 * userContext) and never loads the dashboard, so it stays light and stable.
 * Produces the same artifacts the specs expect: _e2e/.auth/admin.json (cookies)
 * and _e2e/.auth/org.json ({ orgId }).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
	const baseURL =
		config.projects[0]?.use?.baseURL ??
		process.env.PLAYWRIGHT_BASE_URL ??
		"http://localhost:3022";
	const email = process.env.E2E_EMAIL ?? "franchisee@gmail.com";
	const password = process.env.E2E_PASSWORD ?? "password123";

	mkdirSync("_e2e/.auth", { recursive: true });
	const ctx = await request.newContext({ baseURL });

	const signin = await ctx.post("/api/auth/sign-in/email", {
		headers: { origin: baseURL, "content-type": "application/json" },
		data: { email, password },
	});
	if (!signin.ok()) {
		throw new Error(
			`[global-setup.api] sign-in failed: ${signin.status()} ${await signin.text()}`,
		);
	}

	// Persist the session cookies so specs authenticate via storageState.
	await ctx.storageState({ path: "_e2e/.auth/admin.json" });

	// Resolve the current org id (no dashboard load).
	const uc = await ctx.post("/rpc/auth/userContext", {
		headers: { origin: baseURL, "content-type": "application/json" },
		data: { json: {} },
	});
	const body = await uc.json();
	const r = body?.json ?? body;
	const orgId =
		r?.currentOrganizationId ??
		r?.organizations?.[0]?.organizationId ??
		r?.organizations?.[0]?.id;
	if (!orgId) {
		throw new Error(
			`[global-setup.api] could not resolve orgId from userContext: ${JSON.stringify(r).slice(0, 300)}`,
		);
	}
	writeFileSync("_e2e/.auth/org.json", JSON.stringify({ orgId }) + "\n");
	console.log(`[global-setup.api] authenticated; org ${orgId}`);

	await ctx.dispose();
}
