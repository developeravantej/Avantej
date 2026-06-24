import { test, expect } from "@playwright/test";

/**
 * UAT §3/4 — Client Portal: password reset. Better-Auth's forget-password route
 * (sendResetPassword is configured) accepts a reset request and responds 200
 * (it does not leak whether the email exists). Covers the §3 "password reset"
 * check item at the API boundary.
 */
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("§3/4 client portal — password reset", () => {
	test("forget-password endpoint accepts a reset request", async ({
		playwright,
	}) => {
		const ctx = await playwright.request.newContext({ baseURL: BASE });
		const res = await ctx.post("/api/auth/request-password-reset", {
			// Better-Auth CSRF: the request must carry a trusted Origin.
			headers: { origin: BASE, "content-type": "application/json" },
			data: {
				email: "sarah.lim@example.com",
				redirectTo: "/reset-password",
			},
		});
		expect(
			[200, 201].includes(res.status()),
			`forget-password -> ${res.status()} (expected 200)`,
		).toBeTruthy();
		await ctx.dispose();
	});
});
