import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { rpcRaw } from "../_safe-mutation";

// SaaS subscription-state gating. Needs the SECOND tenant (org B) with a member
// SESSION and org B's paymentStatus toggled to the state under test:
//
//   cd apps/server
//   bun run scripts/seed-second-tenant.ts                      # provision org B (+ owner accepts invite)
//   # capture _e2e/.auth/orgB-session.json for the org B member, then per state:
//   bun run scripts/seed-second-tenant.ts --set-status=suspended
//   E2E_SECOND_TENANT=1 E2E_SAAS_STATE=suspended bunx playwright test ... _e2e/web/saas
//
// Self-skips unless E2E_SECOND_TENANT=1, a B session exists, and E2E_SAAS_STATE
// names the state org B is currently in. All other runs stay green.
const ENABLED = process.env.E2E_SECOND_TENANT === "1";
const ORGB_FILE = "_e2e/.auth/orgB.json";
const ORGB_SESSION = "_e2e/.auth/orgB-session.json";
const SAAS_STATE = process.env.E2E_SAAS_STATE ?? ""; // suspended | cancelled | past_due
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

const orgBId = (): string | null => {
	try {
		return JSON.parse(readFileSync(ORGB_FILE, "utf8"))?.orgId ?? null;
	} catch {
		return null;
	}
};

async function bCtx(playwright: any): Promise<APIRequestContext> {
	return playwright.request.newContext({
		baseURL: BASE,
		storageState: ORGB_SESSION,
	});
}

test.describe("saas — subscription-state gating (org B)", () => {
	test("suspended/cancelled tenant returns 403 on tenant procedures", async ({
		playwright,
	}) => {
		test.skip(
			!ENABLED ||
				!existsSync(ORGB_SESSION) ||
				!["suspended", "cancelled"].includes(SAAS_STATE),
			"needs org B session + E2E_SAAS_STATE=suspended|cancelled",
		);
		const orgB = orgBId();
		const b = await bCtx(playwright);
		// Any tenant procedure is blocked by the middleware with a 403 naming the state.
		const res = await rpcRaw(b, "members/list", { organizationId: orgB });
		expect(res.status()).toBe(403);
		const body = await res.json().catch(() => ({}));
		expect(JSON.stringify(body)).toContain(SAAS_STATE);
		await b.dispose();
	});

	test("past-due tenant is read-only: a write procedure is blocked, a read succeeds", async ({
		playwright,
	}) => {
		// Past-due read-only is decided by require-active-saas-sub.middleware from the
		// SUBSCRIPTION record + grace deadline (saas_subscriptions), NOT the org's
		// paymentStatus column. It needs a past_due subscription whose grace has
		// expired — gate on an explicit fixture flag so it skips until that's seeded.
		test.skip(
			!ENABLED ||
				!existsSync(ORGB_SESSION) ||
				process.env.E2E_SAAS_PASTDUE_SUBSCRIPTION !== "1",
			"needs a past_due subscription past grace (saas_subscriptions fixture)",
		);
		const orgB = orgBId();
		const b = await bCtx(playwright);

		// A read still works under past-due read-only.
		const read = await rpcRaw(b, "members/list", { organizationId: orgB });
		expect(read.status()).toBe(200);

		// A write procedure (create*/update*/delete*) is blocked.
		const write = await rpcRaw(b, "hierarchy/createNode", {
			organizationId: orgB,
			type: "country",
			name: "E2E-DEEP-pastdue-should-block",
		});
		expect(write.status()).toBe(403);
		await b.dispose();
	});
});
