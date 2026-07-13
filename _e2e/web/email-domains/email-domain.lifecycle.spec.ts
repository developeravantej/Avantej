import { test, expect } from "@playwright/test";
import {
	Cleanup,
	expectRejected,
	getOrgId,
	rpc,
	rpcRaw,
	testId,
} from "../_safe-mutation";

/**
 * Email-domains deep lifecycle (Plan 5, Task 1) — API-driven, self-cleaning.
 *
 * Covers the core of the 14 emailDomains.* procedures:
 *   create → list/get → update → verify (pending/failed STATE MACHINE only)
 *   → sendTest guard → addAlias/listAliases/removeAlias → delete
 *   → getNotificationRouting / upsertNotificationRoute / deleteNotificationRoute.
 *
 * Hard constraints honored here:
 *  - Real DNS verification can NEVER complete in a test (no DNS is touched),
 *    so we assert the domain stays in the pending/verifying/failed states and
 *    that sendTest is refused for an unverified domain. We never send email.
 *  - `emailDomains.create` registers the domain at Resend. We use a throwaway
 *    unresolvable test domain, delete it at the end (delete also removes it at
 *    Resend), and SKIP (not fail) when the environment can't reach Resend
 *    (missing/invalid RESEND_API_KEY) or the tenant hit the create rate limit.
 *  - Conditional test.skip guard when the tenant lacks the feature entirely
 *    (router absent / non-admin session → 401/403/404).
 */

/** Probe feature availability without mutating anything. */
async function probeFeature(
	request: import("@playwright/test").APIRequestContext,
): Promise<{ ok: boolean; status: number }> {
	const res = await rpcRaw(request, "emailDomains/list", {
		organizationId: getOrgId(),
	});
	return { ok: res.ok(), status: res.status() };
}

test.describe("email-domains", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("domain lifecycle — register → pending state machine → aliases → delete", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const probe = await probeFeature(page.request);
		test.skip(
			!probe.ok,
			`emailDomains.list unavailable (${probe.status}) — feature not enabled for this tenant/session`,
		);

		// ── CREATE ────────────────────────────────────────────────────────────
		// Throwaway domain that can never verify (no DNS is ever published).
		const domainName = `${testId("dom")
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, "-")}.example.com`;
		const createRes = await rpcRaw(page.request, "emailDomains/create", {
			organizationId,
			domain: domainName,
			fromName: testId("From Name"),
			defaultLocalPart: "noreply",
		});
		// Environment-dependent: Resend unreachable / bad key → 5xx; per-hour
		// create rate limit → 429. Both mean "can't exercise the lifecycle here".
		test.skip(
			!createRes.ok(),
			`emailDomains.create unavailable (${createRes.status()}) — Resend not configured or rate-limited in this environment`,
		);
		const createBody = await createRes.json();
		const created =
			createBody && typeof createBody === "object" && "json" in createBody
				? createBody.json
				: createBody;
		const domainId: string = created?.id;
		expect(
			domainId,
			`create returned: ${JSON.stringify(created)}`,
		).toBeTruthy();
		cleanup.add(`email domain ${domainId}`, async () => {
			await rpcRaw(page.request, "emailDomains/delete", {
				organizationId,
				id: domainId,
			});
		});

		// State machine entry point: a fresh domain is pending/verifying — never
		// verified — and the Resend DNS records snapshot is surfaced for the
		// tenant to publish.
		expect(["pending", "verifying"]).toContain(created.status);
		expect(Array.isArray(created.dnsRecords)).toBe(true);
		expect(created.dnsRecords.length).toBeGreaterThan(0);
		for (const rec of created.dnsRecords) {
			expect(rec).toHaveProperty("name");
			expect(rec).toHaveProperty("type");
			expect(rec).toHaveProperty("value");
		}

		// Re-registering the SAME domain is rejected with 409 CONFLICT. The create
		// handler maps the pg unique-violation (23505) off drizzle's wrapped error
		// cause (getPgErrorCode cause-walk) rather than surfacing a raw 500.
		await expectRejected(
			page.request,
			"emailDomains/create",
			{
				organizationId,
				domain: domainName,
				fromName: testId("Dup From"),
				defaultLocalPart: "noreply",
			},
			[409],
		);

		// ── LIST + GET ────────────────────────────────────────────────────────
		const list = await rpc(page.request, "emailDomains/list", {
			organizationId,
		});
		expect(JSON.stringify(list)).toContain(domainName);

		const got = await rpc(page.request, "emailDomains/get", {
			organizationId,
			id: domainId,
		});
		expect(got?.domain).toBe(domainName);
		expect(got?.defaultLocalPart).toBe("noreply");

		// ── UPDATE sender settings ────────────────────────────────────────────
		const newFromName = testId("Renamed From");
		const updated = await rpc(page.request, "emailDomains/update", {
			organizationId,
			id: domainId,
			fromName: newFromName,
			defaultLocalPart: "hello",
		});
		expect(updated?.fromName).toBe(newFromName);
		expect(updated?.defaultLocalPart).toBe("hello");

		// ── VERIFY: state machine only — DNS is never published, so the domain
		// must land back in pending/verifying/failed, NEVER verified. ──────────
		const verified = await rpc(page.request, "emailDomains/verify", {
			organizationId,
			id: domainId,
		});
		expect(["pending", "verifying", "failed"]).toContain(verified?.status);
		expect(verified?.status).not.toBe("verified");

		// sendTest is refused for an unverified domain (and therefore no email
		// is ever sent by this suite).
		await expectRejected(
			page.request,
			"emailDomains/sendTest",
			{ organizationId, id: domainId },
			[400],
		);

		// ── ALIASES: add → list → duplicate guard → remove ────────────────────
		const alias = await rpc(page.request, "emailDomains/addAlias", {
			organizationId,
			emailDomainId: domainId,
			localPart: "support",
			label: testId("alias"),
		});
		expect(alias?.id).toBeTruthy();
		expect(alias?.localPart).toBe("support");

		const aliases = await rpc(page.request, "emailDomains/listAliases", {
			organizationId,
			emailDomainId: domainId,
		});
		expect(
			(Array.isArray(aliases) ? aliases : []).some(
				(a: { id: string }) => a.id === alias.id,
			),
		).toBe(true);

		// Same local-part twice is rejected with 409 CONFLICT. The router maps
		// the pg unique-violation (23505) off drizzle's wrapped error cause.
		await expectRejected(
			page.request,
			"emailDomains/addAlias",
			{ organizationId, emailDomainId: domainId, localPart: "support" },
			[409],
		);

		const removed = await rpc(page.request, "emailDomains/removeAlias", {
			organizationId,
			emailDomainId: domainId,
			id: alias.id,
		});
		expect(removed?.deleted).toBe(true);
		const aliasesAfter = await rpc(page.request, "emailDomains/listAliases", {
			organizationId,
			emailDomainId: domainId,
		});
		expect(
			(Array.isArray(aliasesAfter) ? aliasesAfter : []).some(
				(a: { id: string }) => a.id === alias.id,
			),
		).toBe(false);

		// ── DELETE + ASSERT GONE ──────────────────────────────────────────────
		const deleted = await rpc(page.request, "emailDomains/delete", {
			organizationId,
			id: domainId,
		});
		expect(deleted?.deleted).toBe(true);
		const listAfter = await rpc(page.request, "emailDomains/list", {
			organizationId,
		});
		expect(JSON.stringify(listAfter)).not.toContain(domainName);
	});

	test("existing domain — get/verify state machine + alias lifecycle (fallback when create is unavailable)", async ({
		page,
	}) => {
		// Environments where the Resend account can't register new domains
		// (plan/domain limit, restricted key) still expose the full alias +
		// verification-state surface on the tenant's existing domain rows.
		// Everything here is additive + self-cleaning; sendTest is deliberately
		// NOT called (on a verified domain it would send a real email).
		const organizationId = getOrgId();

		const probe = await probeFeature(page.request);
		test.skip(
			!probe.ok,
			`emailDomains.list unavailable (${probe.status}) — feature not enabled for this tenant/session`,
		);

		const domains = await rpc(page.request, "emailDomains/list", {
			organizationId,
		});
		const domain = (Array.isArray(domains) ? domains : [])[0];
		test.skip(!domain, "tenant has no registered sending domain to exercise");

		// GET returns the persisted row with a valid status.
		const VALID_STATUSES = ["pending", "verifying", "verified", "failed"];
		const got = await rpc(page.request, "emailDomains/get", {
			organizationId,
			id: domain.id,
		});
		expect(got?.id).toBe(domain.id);
		expect(VALID_STATUSES).toContain(got.status);

		// VERIFY is an idempotent DNS re-check: the status must stay inside the
		// state machine, and an unverified domain can never flip to verified
		// here (this suite never publishes DNS records). Tolerated failure: in
		// some environments the local Resend key can't see this pre-existing
		// resendDomainId (different Resend account) → 5xx. That's an env
		// mismatch, not a state-machine violation, so it's annotated, not fatal.
		const verifyRes = await rpcRaw(page.request, "emailDomains/verify", {
			organizationId,
			id: domain.id,
		});
		if (verifyRes.ok()) {
			const verifyBody = await verifyRes.json().catch(() => null);
			const verified =
				verifyBody && typeof verifyBody === "object" && "json" in verifyBody
					? verifyBody.json
					: verifyBody;
			expect(VALID_STATUSES).toContain(verified?.status);
			if (got.status !== "verified") {
				expect(verified?.status).not.toBe("verified");
			}
		} else {
			test.info().annotations.push({
				type: "warning",
				description: `emailDomains.verify -> ${verifyRes.status()} — local Resend key cannot manage this pre-existing domain; verify state-machine assertion skipped`,
			});
		}

		// ALIASES: add a test-prefixed alias → list → duplicate guard → remove.
		const localPart = testId("alias").toLowerCase();
		const alias = await rpc(page.request, "emailDomains/addAlias", {
			organizationId,
			emailDomainId: domain.id,
			localPart,
			label: testId("alias-label"),
		});
		expect(alias?.id).toBeTruthy();
		cleanup.add(`alias ${alias?.id}`, async () => {
			await rpcRaw(page.request, "emailDomains/removeAlias", {
				organizationId,
				emailDomainId: domain.id,
				id: alias.id,
			});
		});
		expect(alias.localPart).toBe(localPart);

		const aliases = await rpc(page.request, "emailDomains/listAliases", {
			organizationId,
			emailDomainId: domain.id,
		});
		expect(
			(Array.isArray(aliases) ? aliases : []).some(
				(a: { id: string }) => a.id === alias.id,
			),
		).toBe(true);

		// Duplicate local-part is rejected with 409 CONFLICT. The router maps the
		// pg unique-violation (23505) off drizzle's wrapped error cause, rather
		// than string-matching err.message (which misses the wrapped case).
		await expectRejected(
			page.request,
			"emailDomains/addAlias",
			{ organizationId, emailDomainId: domain.id, localPart },
			[409],
		);

		const removed = await rpc(page.request, "emailDomains/removeAlias", {
			organizationId,
			emailDomainId: domain.id,
			id: alias.id,
		});
		expect(removed?.deleted).toBe(true);
		const after = await rpc(page.request, "emailDomains/listAliases", {
			organizationId,
			emailDomainId: domain.id,
		});
		expect(
			(Array.isArray(after) ? after : []).some(
				(a: { id: string }) => a.id === alias.id,
			),
		).toBe(false);
	});

	test("notification routing — set/unset an override route (no Resend involved)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const probe = await rpcRaw(
			page.request,
			"emailDomains/getNotificationRouting",
			{
				organizationId,
			},
		);
		test.skip(
			!probe.ok(),
			`emailDomains.getNotificationRouting unavailable (${probe.status()}) — feature not enabled for this tenant/session`,
		);
		const probeBody = await probe.json();
		const routing =
			probeBody && typeof probeBody === "object" && "json" in probeBody
				? probeBody.json
				: probeBody;
		expect(routing).toHaveProperty("routes");
		expect(routing).toHaveProperty("aliases");
		expect(routing).toHaveProperty("verifiedDomain");

		// Pick a type this tenant has no route for yet, so unset restores the
		// exact pre-test state. Fall back to member_invitation and restore it.
		const NOTIFICATION_TYPE = "member_invitation";
		const preExisting = (routing.routes ?? []).find(
			(r: { notificationType: string }) =>
				r.notificationType === NOTIFICATION_TYPE,
		);
		test.skip(
			!!preExisting,
			`tenant already has a live ${NOTIFICATION_TYPE} route — not overwriting real config`,
		);

		// SET: override the from-name only (aliasId null works without a
		// verified domain — no Resend call is made).
		const fromNameOverride = testId("Route From");
		const row = await rpc(
			page.request,
			"emailDomains/upsertNotificationRoute",
			{
				organizationId,
				notificationType: NOTIFICATION_TYPE,
				aliasId: null,
				fromNameOverride,
			},
		);
		expect(row?.id).toBeTruthy();
		cleanup.add(`notification route ${NOTIFICATION_TYPE}`, async () => {
			await rpcRaw(page.request, "emailDomains/deleteNotificationRoute", {
				organizationId,
				notificationType: NOTIFICATION_TYPE,
			});
		});

		const afterSet = await rpc(
			page.request,
			"emailDomains/getNotificationRouting",
			{ organizationId },
		);
		const setRoute = (afterSet.routes ?? []).find(
			(r: { notificationType: string }) =>
				r.notificationType === NOTIFICATION_TYPE,
		);
		expect(setRoute, "route should exist after upsert").toBeTruthy();
		expect(JSON.stringify(setRoute)).toContain(fromNameOverride);

		// Cross-org binding guard: without a verified domain (or with a foreign
		// alias id) binding an alias must be rejected as BAD_REQUEST.
		if (!routing.verifiedDomain) {
			await expectRejected(
				page.request,
				"emailDomains/upsertNotificationRoute",
				{
					organizationId,
					notificationType: NOTIFICATION_TYPE,
					aliasId: "00000000-0000-4000-8000-000000000000",
				},
				[400],
			);
		}

		// UNSET: reset back to the domain default sender.
		const del = await rpc(
			page.request,
			"emailDomains/deleteNotificationRoute",
			{ organizationId, notificationType: NOTIFICATION_TYPE },
		);
		expect(del?.deleted).toBe(true);

		const afterDelete = await rpc(
			page.request,
			"emailDomains/getNotificationRouting",
			{ organizationId },
		);
		expect(
			(afterDelete.routes ?? []).some(
				(r: { notificationType: string }) =>
					r.notificationType === NOTIFICATION_TYPE,
			),
		).toBe(false);
	});
});
