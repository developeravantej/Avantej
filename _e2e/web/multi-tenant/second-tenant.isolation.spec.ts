import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { getOrgId, expectIsolated, rpc } from "../_safe-mutation";

// Cross-tenant isolation that needs a SECOND provisioned tenant (org B).
// Provision it first:  cd apps/server && bun run scripts/seed-second-tenant.ts
// then run:            E2E_SECOND_TENANT=1 bunx playwright test --config _e2e/playwright.config.ts
// Without org B these self-skip, so the normal suite stays green.
//
// org B is owned/membered by developer.avantej (NOT the franchisee), so the
// admin (franchisee, member of org A only) must be denied on org B. The reverse
// (a B-session denied on org A) is asserted when a B storageState is present.
const ENABLED = process.env.E2E_SECOND_TENANT === "1";
const ORGB_FILE = "_e2e/.auth/orgB.json";
const ORGB_SESSION = "_e2e/.auth/orgB-session.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

function orgBId(): string | null {
	try {
		return JSON.parse(readFileSync(ORGB_FILE, "utf8"))?.orgId ?? null;
	} catch {
		return null;
	}
}

test.describe("multi-tenant — second-tenant isolation", () => {
	test("the admin (member of org A only) is denied on org B", async ({
		page,
	}) => {
		test.skip(
			!ENABLED || !existsSync(ORGB_FILE),
			"no second tenant (run seed-second-tenant.ts)",
		);
		const orgB = orgBId();
		expect(orgB, "orgB.json must contain orgId").toBeTruthy();

		// The franchisee session has no member row in org B → tenant procedures
		// for org B must be rejected (403/404), never served.
		await expectIsolated(page.request, "hierarchy/listNodes", {
			organizationId: orgB,
		});
		await expectIsolated(page.request, "members/list", {
			organizationId: orgB,
		});
	});

	test("a member of org B sees org B data but is denied on org A", async ({
		playwright,
	}) => {
		test.skip(
			!ENABLED || !existsSync(ORGB_SESSION),
			"no org B session (capture _e2e/.auth/orgB-session.json for the org B owner)",
		);
		const orgA = getOrgId();
		const orgB = orgBId();
		const b: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: ORGB_SESSION,
		});

		// B session resolves to B's own tenant DB (proves per-org tenantDb routing).
		const nodes = await rpc(b, "hierarchy/listNodes", { organizationId: orgB });
		const list = Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
		expect(list.length).toBeGreaterThan(0);

		// …and the same session is denied on org A (not a member there).
		await expectIsolated(b, "hierarchy/listNodes", { organizationId: orgA });
		await b.dispose();
	});
});
