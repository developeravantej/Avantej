import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { getOrgId, expectForbidden } from "../_safe-mutation";

/**
 * UAT §3/4 — Client Portal. "Verify the client can see their own data only."
 * As a client-role login (seed-customers.ts → sarah.lim@example.com): the client
 * resolves their own context (portal login works), but cannot reach admin-scoped
 * listings of other people's data.
 */
const CLIENT_STATE = "_e2e/.auth/client.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("§3/4 client portal — self-scope", () => {
	test("client logs in to their own context but cannot list others' data", async ({
		playwright,
	}) => {
		test.skip(
			!existsSync(CLIENT_STATE),
			"no client session — run seed-customers.ts + fix-auth-password-scrypt, then global-setup",
		);
		const organizationId = getOrgId();
		const client: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: CLIENT_STATE,
		});

		// Positive — the client resolves their own context (portal login works).
		const ctx = await client.post("/rpc/auth/userContext", {
			data: { json: {} },
		});
		expect(ctx.status(), "client userContext should resolve").toBe(200);

		// Boundary — a client must NOT be able to list all members/customers.
		await expectForbidden(client, "members/list", { organizationId });

		await client.dispose();
	});
});
