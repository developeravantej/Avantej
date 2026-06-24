import { test, expect } from "@playwright/test";
import { getOrgId } from "../_safe-mutation";

/**
 * UAT §6 — Google Calendar OAuth: CONNECT half of the round-trip.
 *
 * The server-side OAuth flow is fully wired (initiate + callback + token
 * encryption + sync). The token-exchange half needs a real Google Cloud OAuth
 * app (CLIENT_ID/SECRET + registered redirect URI) and cannot run in-sandbox.
 * The CONNECT half does not: `/auth/google-calendar/initiate` builds the Google
 * consent URL and 302-redirects to it. This spec proves that redirect carries
 * the correct scopes + offline access, which is everything Avantej controls.
 *
 * (Proxied: vite forwards /auth → server, so we hit it via the web base URL with
 * the admin session cookie from storageState.)
 */
test.describe("§6 google calendar — OAuth initiate (connect half)", () => {
	test("initiate redirects to the Google consent screen with calendar scopes", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const res = await page.request.get(
			`/auth/google-calendar/initiate?organizationId=${organizationId}`,
			{ maxRedirects: 0 },
		);

		// It must be a redirect (302/307), not a 200 page render.
		expect(
			[301, 302, 303, 307, 308].includes(res.status()),
			`initiate -> ${res.status()} (expected a redirect)`,
		).toBeTruthy();

		const location = res.headers()["location"] ?? "";
		// If the session cookie wasn't carried, the route redirects to /login —
		// surface that clearly instead of a cryptic scope assertion failure.
		expect(
			!location.endsWith("/login"),
			"initiate redirected to /login — admin session cookie not carried (re-run global-setup)",
		).toBeTruthy();

		expect(
			location.startsWith("https://accounts.google.com/o/oauth2/v2/auth"),
			`initiate Location should be the Google consent URL, got: ${location.slice(0, 120)}`,
		).toBeTruthy();

		const u = new URL(location);
		const scope = u.searchParams.get("scope") ?? "";
		expect(scope).toContain("calendar.events");
		expect(scope).toContain("userinfo.email");
		expect(u.searchParams.get("access_type")).toBe("offline");
		expect(u.searchParams.get("response_type")).toBe("code");
		// A signed, time-boxed state envelope must be present (CSRF protection).
		expect(
			(u.searchParams.get("state") ?? "").length,
			"OAuth state envelope must be present",
		).toBeGreaterThan(0);
	});

	test("initiate without organizationId is rejected", async ({ page }) => {
		const res = await page.request.get("/auth/google-calendar/initiate", {
			maxRedirects: 0,
		});
		// Missing org → 400 (authed) or a redirect to /login (unauthed) — never a
		// redirect to Google.
		const location = res.headers()["location"] ?? "";
		expect(
			res.status() === 400 ||
				!location.startsWith("https://accounts.google.com"),
			`initiate without org should not reach Google, got ${res.status()} ${location.slice(0, 80)}`,
		).toBeTruthy();
	});
});
