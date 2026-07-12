/**
 * Plan F.6.1 (Agent D) — `/tenants/$id` drill-in stability.
 *
 * Triage finding (full notes in VERIFICATION-D.md):
 *   - Prior agents (N, R, M, B, Mb, Fo) reported "getTenantDetail 500"
 *     on tenant drill-in and added tolerant fallback. Reproduction
 *     against a fresh super-admin proved the proc returns 200 with the
 *     full payload for any real v4 org.
 *   - The actual symptom was the parent `tenants.tsx` list route
 *     mounting alongside `tenants.$id.tsx` (TanStack file routing) and
 *     fanning out `tags/listForOrg` calls for every row. Dev seed rows
 *     with synthetic ids like `00000000-0000-0000-0000-00000000ff0x`
 *     fail Zod's v4 uuid regex → 400 spam in the console.
 *   - Fix: filter `tenantIds` to v4-shaped UUIDs before the fan-out in
 *     `tenants.tsx`. Surgical, single-file.
 *
 * Scenarios:
 *   1. RPC happy path: getTenantDetail(real v4 org) → 200 with the
 *      documented shape.
 *   2. RPC well-formed-but-missing: getTenantDetail(unused v4 uuid) →
 *      clean NOT_FOUND (never 500).
 *   3. RPC bad-shape (Zod): getTenantDetail("not-a-uuid") → 400
 *      BAD_REQUEST (handler never runs).
 *   4. UI: navigating to `/dashboard/platform-admin/tenants/<orgId>`
 *      records ZERO 4xx/5xx responses for the platform-admin RPCs the
 *      page mounts.
 *   5. UI: page shows the tenant name (drill-in actually renders).
 *
 * Tagged @ship-f-6-1.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext, Response } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { getControlPanelDb } from "../../../fixtures/db";
import {
	cleanupSeededTestUsers,
	loginAsAdmin,
	signUpUser,
} from "../../../fixtures/auth";

test.use({ video: "on" });

test.afterAll(async () => {
	// Revoke platform-admin grants + delete throwaway @test.local users this
	// spec seeded, even if an assertion failed mid-test (see fixtures/auth.ts).
	await cleanupSeededTestUsers();
});

const WEB_ORIGIN = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001";

async function rpc(
	request: APIRequestContext,
	router: string,
	input: unknown,
): Promise<{ status: number; body: any }> {
	const res = await request.post(`${WEB_ORIGIN}/rpc/${router}`, {
		headers: { "Content-Type": "application/json" },
		data: { json: input },
	});
	const text = await res.text();
	let body: any = text;
	try {
		body = JSON.parse(text);
	} catch {}
	return { status: res.status(), body };
}

test.describe("@ship-f-6-1 Plan F.6.1 — Agent D drill-in 500 fix", () => {
	test("getTenantDetail proc + UI render with zero RPC 4xx/5xx", async ({
		page,
		context,
	}) => {
		test.setTimeout(180_000);

		const cp = getControlPanelDb();

		// ── Provision a fresh super-admin ──────────────────────────────
		const suffix = `plan-f-6-1-d-${Date.now()}`;
		const signed = await signUpUser(suffix, "admin");
		await cp
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, signed.userId));
		await cp
			.insert(platformAdmins)
			.values({ userId: signed.userId, role: "super_admin" })
			.onConflictDoNothing();

		// ── Find a real v4-shaped org from the dev DB ──────────────────
		const orgRows = (await cp.execute(sql`
			SELECT id::text AS id, name FROM organizations
			WHERE id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}'
			ORDER BY created_at DESC
			LIMIT 1;
		`)) as unknown as { rows: Array<{ id: string; name: string }> };
		const realOrg = orgRows.rows[0];
		if (!realOrg) {
			test.skip(true, "No v4 organization in dev DB");
			return;
		}

		// ── Login ──────────────────────────────────────────────────────
		await loginAsAdmin(page, signed.email, signed.password);
		const apiCtx = context.request;

		// ── Scenario 1: getTenantDetail happy path ─────────────────────
		const detailRes = await rpc(
			apiCtx,
			"platformAdminTenants/getTenantDetail",
			{ organizationId: realOrg.id },
		);
		console.log(
			`[scenario-1] status=${detailRes.status} keys=${Object.keys(
				detailRes.body?.json ?? {},
			).join(",")}`,
		);
		expect(detailRes.status).toBe(200);
		const detailBody = detailRes.body?.json ?? detailRes.body;
		expect(detailBody.organization).toBeDefined();
		expect(detailBody.organization.id).toBe(realOrg.id);
		expect(typeof detailBody.organization.name).toBe("string");
		expect(Array.isArray(detailBody.connectAccounts)).toBe(true);
		// `owner`, `subscription`, `lastPayment` may be null in dev — just
		// assert keys are present (not undefined) on the payload.
		expect("owner" in detailBody).toBe(true);
		expect("subscription" in detailBody).toBe(true);
		expect("lastPayment" in detailBody).toBe(true);

		// ── Scenario 2: well-formed-but-missing v4 uuid → NOT_FOUND ────
		const missingRes = await rpc(
			apiCtx,
			"platformAdminTenants/getTenantDetail",
			{ organizationId: "11111111-1111-4111-8111-111111111111" },
		);
		console.log(
			`[scenario-2] status=${missingRes.status} body=${JSON.stringify(missingRes.body).slice(0, 200)}`,
		);
		expect(missingRes.status).toBe(404);
		const missingBody = missingRes.body?.json ?? missingRes.body;
		expect(missingBody.code).toBe("NOT_FOUND");

		// ── Scenario 3: bad-shape uuid → 400 BAD_REQUEST ───────────────
		const badRes = await rpc(apiCtx, "platformAdminTenants/getTenantDetail", {
			organizationId: "not-a-uuid",
		});
		console.log(`[scenario-3] status=${badRes.status}`);
		expect(badRes.status).toBe(400);
		const badBody = badRes.body?.json ?? badRes.body;
		expect(badBody.code).toBe("BAD_REQUEST");

		// ── Scenario 4 + 5: navigate the page and record platform-admin
		// RPC traffic. After the fix, the parent route should NOT fan out
		// invalid UUIDs into `tags/listForOrg`, so we expect zero failing
		// platform-admin RPC responses. ───────────────────────────────
		const failingRpcs: Array<{ url: string; status: number }> = [];
		const onResponse = (r: Response) => {
			const u = r.url();
			if (u.includes("/rpc/platformAdminTenants/") && r.status() >= 400) {
				failingRpcs.push({ url: u, status: r.status() });
			}
		};
		page.on("response", onResponse);

		await page.goto(
			`${WEB_ORIGIN}/dashboard/platform-admin/tenants/${realOrg.id}`,
		);
		// Let queries settle. The page makes several queries (detail,
		// notes, tags-for-org, etc); 4s is enough for them all to land in
		// dev. Anything slower than that is a separate perf concern.
		await page.waitForTimeout(4000);

		page.off("response", onResponse);
		console.log(
			`[scenario-4] platform-admin RPC 4xx/5xx count=${failingRpcs.length}`,
		);
		for (const f of failingRpcs.slice(0, 5)) {
			console.log(`  failing rpc: ${f.status} ${f.url}`);
		}
		expect(failingRpcs).toEqual([]);

		// Scenario 5 — page rendered the tenant name. The breadcrumb /
		// header surfaces the org name on the drill-in.
		const content = await page.content();
		expect(content.length).toBeGreaterThan(1000);
		// We don't pin a specific selector (UI churn risk) — just confirm
		// the org name appears somewhere on the page.
		expect(content.toLowerCase()).toContain(
			realOrg.name.toLowerCase().slice(0, Math.min(8, realOrg.name.length)),
		);

		// Sanity — no "Internal Server Error" overlay anywhere.
		expect(/Internal Server Error/i.test(content)).toBe(false);
	});
});
