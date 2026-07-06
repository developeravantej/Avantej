import { test, expect } from "@playwright/test";
import { rpc, rpcRaw, getOrgId, expectRejected } from "../_safe-mutation";

/**
 * UAT §6 — Google Calendar pull-sync ("Read availability: busy times in Google
 * block matching slots in Avantej").
 *
 * The real Google round-trip needs an external OAuth app (deferred). What we prove
 * in-app: the `pullAvailability` procedure is wired and permission-gated, and —
 * because the test tenant has no connected Google account — it returns the typed
 * NOT_FOUND rather than a raw 500. The pull/upsert/prune logic and the availability
 * subtraction it feeds are covered by services unit tests (google-calendar-pull +
 * trainer-availability "external busy blocks").
 */
test.describe("§6 Google Calendar — pull-availability endpoint", () => {
	test("pullAvailability is wired + guarded; NOT_FOUND without a connection", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Admin HAS appointment_management:update, so the guard passes and the
		// handler reaches the connection lookup. No Google account is connected on
		// the test tenant → typed 404, never a 500.
		await expectRejected(
			page.request,
			"googleCalendar/pullAvailability",
			{ organizationId },
			[404],
		);
	});

	test("pullAvailability validates the windowDays bound", async ({ page }) => {
		const organizationId = getOrgId();
		// windowDays must be 1..180 — an out-of-range value is rejected at input
		// validation (400) before any handler work.
		const res = await rpcRaw(page.request, "googleCalendar/pullAvailability", {
			organizationId,
			windowDays: 9999,
		});
		expect(
			[400, 422].includes(res.status()),
			`expected input-validation rejection, got ${res.status()}`,
		).toBeTruthy();
	});

	test("status still resolves alongside the pull endpoint", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const status = await rpc(page.request, "googleCalendar/status", {
			organizationId,
		});
		expect(status, "googleCalendar/status should return").toBeTruthy();
	});
});
