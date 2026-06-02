/**
 * AUDIT-PROVE single-session proof (2026-05-29 remediation).
 *
 * One continuous recorded session. Each test.step proves one remediation target
 * end-to-end through the REAL stack: browser → /rpc proxy (3021→3020) → oRPC
 * handler → service → tenant Neon DB, authenticated via the stored admin cookie.
 *
 * All assertions are expect.soft so a failing step is recorded but the session
 * keeps running to the end (the whole point of the single video).
 *
 * Run: npx playwright test -c gap-prove.config.ts
 */

import { expect, test } from "@playwright/test";
import { OrpcClientError, orpcCall } from "./helpers/orpc-client";

const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

test("audit-prove single-session proof", async ({ page }) => {
	// GP-01 — golden path: app boots and dashboard renders with the remediation applied.
	await test.step("GP-01 dashboard golden path", async () => {
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/dashboard/);
		await expect(page.locator("body")).toBeVisible();
	});

	// F-INV-08 — createTaxRate must reject effectiveUntil <= effectiveFrom, accept a
	// valid range, and the valid row must actually persist (read-back) — then clean up.
	await test.step("F-INV-08 tax-rate date validation + persistence", async () => {
		const code = `AUDITPROVE_${Date.now()}`;

		// (a) invalid range → must be rejected
		let rejected = false;
		try {
			await orpcCall(page, "taxRates", "create", {
				organizationId: ORG_ID,
				name: "Audit-Prove Invalid Range",
				code: `${code}_BAD`,
				rateInBasisPoints: 800,
				effectiveFrom: "2026-06-01T00:00:00.000Z",
				effectiveUntil: "2026-01-01T00:00:00.000Z", // before From → invalid
			});
		} catch (e) {
			rejected = e instanceof OrpcClientError || e instanceof Error;
		}
		expect
			.soft(rejected, "invalid effective range should be rejected")
			.toBe(true);

		// (b) valid range → must succeed and persist
		let createdId: string | null = null;
		try {
			const created = await orpcCall<
				Record<string, unknown>,
				{ id?: string } | { taxRate?: { id: string } }
			>(page, "taxRates", "create", {
				organizationId: ORG_ID,
				name: "Audit-Prove Valid Range",
				code,
				rateInBasisPoints: 600,
				effectiveFrom: "2026-01-01T00:00:00.000Z",
				effectiveUntil: "2026-12-31T00:00:00.000Z",
			});
			// tolerate either { id } or { taxRate: { id } } response shapes
			createdId =
				(created as { id?: string }).id ??
				(created as { taxRate?: { id: string } }).taxRate?.id ??
				null;
		} catch (e) {
			expect
				.soft(e, "valid tax rate should create without error")
				.toBeUndefined();
		}
		expect.soft(createdId, "valid tax rate returns an id").toBeTruthy();

		// (c) persistence read-back: the created row appears in list
		const list = await orpcCall<
			Record<string, unknown>,
			| Array<{ id: string; code: string }>
			| { rows: Array<{ id: string; code: string }> }
		>(page, "taxRates", "list", { organizationId: ORG_ID });
		const rows = Array.isArray(list)
			? list
			: ((list as { rows: Array<{ id: string; code: string }> }).rows ?? []);
		expect
			.soft(
				rows.some((r) => r.code === code),
				"created tax rate persisted",
			)
			.toBe(true);

		// (d) cleanup
		if (createdId) {
			try {
				await orpcCall(page, "taxRates", "deactivate", {
					organizationId: ORG_ID,
					id: createdId,
				});
			} catch {
				// best-effort teardown
			}
		}
	});

	// F-COM-07 — liabilityByStaff now returns { rows, totalCount, hasMore } instead of a
	// bare array. Prove the new contract through the real handler + analytics passthrough.
	await test.step("F-COM-07 liabilityByStaff pagination contract", async () => {
		const res = await orpcCall<
			Record<string, unknown>,
			{ rows?: unknown[]; totalCount?: number; hasMore?: boolean }
		>(page, "commissionSplits", "liabilityByStaff", {
			organizationId: ORG_ID,
			from: "2020-01-01T00:00:00.000Z",
			to: "2030-01-01T00:00:00.000Z",
		});
		expect
			.soft(Array.isArray(res?.rows), "liabilityByStaff returns rows[]")
			.toBe(true);
		expect
			.soft(typeof res?.totalCount, "liabilityByStaff returns totalCount")
			.toBe("number");
		expect
			.soft(typeof res?.hasMore, "liabilityByStaff returns hasMore")
			.toBe("boolean");
	});

	// F-AUTH-09 — listNodes now calls requirePermissionOrpc. Admin holds the permission,
	// so it must still return the hierarchy (proves the new guard didn't break admin access).
	await test.step("F-AUTH-09 listNodes still serves admin after permission guard", async () => {
		let ok = false;
		try {
			const nodes = await orpcCall<Record<string, unknown>, unknown>(
				page,
				"hierarchy",
				"listNodes",
				{
					organizationId: ORG_ID,
				},
			);
			ok =
				Array.isArray(nodes) || (typeof nodes === "object" && nodes !== null);
		} catch (e) {
			expect.soft(e, "admin listNodes should not be forbidden").toBeUndefined();
		}
		expect.soft(ok, "listNodes returns data for admin").toBe(true);
	});
});
