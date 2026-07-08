import { test, expect } from "@playwright/test";
import { getOrgId, rpc, rpcRaw } from "../_safe-mutation";

/**
 * Installments — reschedule CONFLICT maps to 409, not 500 (regression guard).
 *
 * The bug this locks down: reschedule/waive handlers returned the service promise
 * WITHOUT `await`, so a CONFLICT/BAD_REQUEST rejection escaped the try/catch and
 * surfaced as an opaque 500 instead of the mapped 409. Rescheduling an installment
 * on a LOCKED (severely-overdue) package is exactly the CONFLICT path.
 *
 * API-boundary + read-only: the call is REJECTED before any write, so nothing is
 * mutated. The sibling installments.deep.spec.ts deliberately AVOIDS locked rows
 * (it exercises the success path); this file asserts the locked → 409 contract
 * the deep spec skips.
 */
test.describe("installments — reschedule CONFLICT (locked package) → 409", () => {
	test("rescheduling a locked installment is rejected 409 CONFLICT, not 500", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Locked installments live in the overdue window; fall back to the
		// unbounded "all" window if none surface there.
		const findLocked = async (window: "overdue" | "all") => {
			const rows = await rpc(page.request, "installments/listUpcoming", {
				organizationId,
				window,
				limit: 200,
			});
			const arr = Array.isArray(rows) ? rows : (rows?.rows ?? []);
			return arr.find((r: { isLocked?: boolean }) => r.isLocked) ?? null;
		};
		const locked = (await findLocked("overdue")) ?? (await findLocked("all"));
		test.skip(
			!locked,
			"no locked installment in the dev seed to exercise the CONFLICT path",
		);

		const installmentId = locked.installmentId ?? locked.id;
		expect(installmentId, "locked row exposes an installment id").toBeTruthy();

		const future = new Date();
		future.setUTCDate(future.getUTCDate() + 14);

		const res = await rpcRaw(page.request, "installments/reschedule", {
			organizationId,
			installmentId,
			newDueDate: future.toISOString(),
			reason: "E2E: assert locked reschedule maps to 409",
		});

		// The exact contract the missing-`await` bug broke: mapped 409, never 500.
		expect(
			res.status(),
			`locked reschedule must map to 409 CONFLICT, got ${res.status()}`,
		).toBe(409);
		expect(res.status()).not.toBe(500);
		const body = await res.json().catch(() => null);
		expect(JSON.stringify(body)).toContain("CONFLICT");
	});
});
