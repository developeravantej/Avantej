import {
	test,
	expect,
	request as pwRequest,
	type APIRequestContext,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import { rpc } from "../_safe-mutation";

/**
 * Payments-integrity manual triggers (platform-admin, super_admin only).
 *
 * Asserts what the server code actually guarantees (read first, per plan-6):
 *   - runReconciliationNow (platform-admin-payments.ts:264) runs synchronously:
 *     it inserts a reconciliation_runs row, scans Stripe per connected acct, and
 *     returns a ReconciliationReport. The overview's lastReconciliation must then
 *     reflect that runId with status completed + matching driftCount — this is
 *     the transition the page's 30s poll surfaces.
 *   - runWebhookBackfillNow (…:278) replays ONLY events with no
 *     processed_webhook_events row (clean claim). Idempotency invariant from
 *     webhook-backfill.service.ts claimAndReplay: everything replayed by run 1 is
 *     recorded processed, so an immediate second run must replay 0 and count the
 *     run-1 replays in alreadyProcessed.
 *
 * Stripe gate: BOTH triggers construct a real Stripe client (getStripeClient) and
 * call the live API. STRICT conditional skip unless apps/server/.dev.vars carries
 * a TEST key (sk_test_…) — never run against a live key.
 */

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";
const SUPER_EMAIL =
	process.env.E2E_SUPER_ADMIN_EMAIL ?? "developer.avantej@gmail.com";
const SUPER_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? "password123";

function stripeTestKeyPresent(): boolean {
	try {
		const devVars = readFileSync("apps/server/.dev.vars", "utf8");
		const m = devVars.match(/^STRIPE_SECRET_KEY\s*=\s*"?([^"\r\n]+)"?/m);
		return !!m && m[1].startsWith("sk_test_");
	} catch {
		return false;
	}
}
const STRIPE_TEST_KEY = stripeTestKeyPresent();

test.describe("platform-admin — payments integrity (reconciliation + backfill)", () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	let superReq: APIRequestContext | null = null;
	let skipReason = "";

	test.beforeAll(async () => {
		try {
			const ctx = await pwRequest.newContext({ baseURL: BASE });
			const signin = await ctx.post("/api/auth/sign-in/email", {
				data: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
			});
			if (!signin.ok()) {
				skipReason = `super-admin sign-in failed (${signin.status()})`;
				await ctx.dispose();
				return;
			}
			const me = await rpc(ctx, "admin/me", {});
			if (!me?.isPlatformAdmin || me.role !== "super_admin") {
				skipReason = `${SUPER_EMAIL} is not a super_admin in this env`;
				await ctx.dispose();
				return;
			}
			superReq = ctx;
		} catch (e) {
			skipReason = `dev server unreachable at ${BASE}: ${e instanceof Error ? e.message : e}`;
		}
	});

	test.afterAll(async () => {
		await superReq?.dispose();
	});

	test("overview returns the KPI shape the dashboard polls", async () => {
		test.skip(!superReq, skipReason);
		const overview = await rpc(superReq!, "platformAdminPayments/overview", {});
		expect(typeof overview.applicationFeesThisMonth).toBe("number");
		expect(typeof overview.saasRevenueThisMonth).toBe("number");
		expect(typeof overview.openDisputes).toBe("number");
		expect(typeof overview.stuckOnboardings).toBe("number");
		expect(overview.drift).toMatchObject({
			critical: expect.any(Number),
			warn: expect.any(Number),
			info: expect.any(Number),
		});
		// lastReconciliation is null (never run) or the last run's summary
		if (overview.lastReconciliation !== null) {
			expect(overview.lastReconciliation).toMatchObject({
				id: expect.any(String),
				status: expect.any(String),
			});
		}
	});

	test("runReconciliationNow records a run and the overview reflects its terminal status", async () => {
		test.skip(!superReq, skipReason);
		test.skip(
			!STRIPE_TEST_KEY,
			"no Stripe TEST key (sk_test_) in apps/server/.dev.vars — refusing to hit Stripe",
		);
		test.setTimeout(180_000);

		const report = await rpc(
			superReq!,
			"platformAdminPayments/runReconciliationNow",
			{},
		);
		// ReconciliationReport shape (reconciler.service.ts)
		expect(report.runId).toEqual(expect.any(String));
		expect(report).toMatchObject({
			acctsScanned: expect.any(Number),
			resourcesExamined: expect.any(Number),
			driftFound: expect.any(Number),
			criticalCount: expect.any(Number),
			warnCount: expect.any(Number),
			infoCount: expect.any(Number),
			durationMs: expect.any(Number),
		});
		// Severity counts must add up.
		expect(report.criticalCount + report.warnCount + report.infoCount).toBe(
			report.driftFound,
		);

		// Poll the overview like the page does (page uses a 30s interval; the
		// procedure is synchronous so this converges immediately — the loop only
		// guards read-replica lag).
		let last: Record<string, unknown> | null = null;
		for (let i = 0; i < 10; i++) {
			const overview = await rpc(
				superReq!,
				"platformAdminPayments/overview",
				{},
			);
			last = overview.lastReconciliation;
			if (last && last.id === report.runId && last.completedAt) break;
			await new Promise((r) => setTimeout(r, 3_000));
		}
		expect(
			last,
			"overview.lastReconciliation must surface the new run",
		).toBeTruthy();
		expect(last!.id).toBe(report.runId);
		// Run transitioned out of "running" to a terminal, successful state.
		expect(last!.status).toBe("completed");
		expect(last!.completedAt).toBeTruthy();
		expect(last!.driftCount).toBe(report.driftFound);
	});

	test("runWebhookBackfillNow is idempotent: an immediate second run replays nothing", async () => {
		test.skip(!superReq, skipReason);
		test.skip(
			!STRIPE_TEST_KEY,
			"no Stripe TEST key (sk_test_) in apps/server/.dev.vars — refusing to hit Stripe",
		);
		test.setTimeout(180_000);

		const run1 = await rpc(
			superReq!,
			"platformAdminPayments/runWebhookBackfillNow",
			{},
		);
		expect(run1).toMatchObject({
			acctsScanned: expect.any(Number),
			eventsExamined: expect.any(Number),
			replayed: expect.any(Number),
			alreadyProcessed: expect.any(Number),
			errors: expect.any(Number),
		});
		expect(run1.errors, "backfill run 1 must not error").toBe(0);

		const run2 = await rpc(
			superReq!,
			"platformAdminPayments/runWebhookBackfillNow",
			{},
		);
		expect(run2.errors, "backfill run 2 must not error").toBe(0);

		// THE invariant (claimAndReplay): every event replayed in run 1 now has a
		// processed_webhook_events row, so run 2 skips it (alreadyProcessed) and
		// replays nothing. (Assumes no NEW Stripe events land between the two
		// back-to-back runs — true in a quiet test environment.)
		expect(
			run2.replayed,
			"second immediate backfill must not double-process any event",
		).toBe(0);
		expect(run2.alreadyProcessed).toBeGreaterThanOrEqual(run1.replayed);
	});
});
