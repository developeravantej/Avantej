import { describe, test, expect } from "bun:test";
import {
	checkEmailDomainCreateAllowed,
	MAX_TOTAL_DOMAINS,
	MAX_CREATES_PER_HOUR,
} from "@avantej-core/services/email-domain.service";

/**
 * Minimal control-panel DB stub. Each `.select()` call returns the next
 * queued count result (the helper runs the total-count query first, then the
 * recent-window query). Chain methods (.from/.where) are no-ops; the chain is
 * thenable so `await db.select().from().where()` resolves to the queued array.
 */
function dbReturning(...countsInOrder: number[]) {
	let i = 0;
	return {
		select() {
			const result = [{ n: countsInOrder[i++] ?? 0 }];
			const chain: Record<string, unknown> = {};
			for (const m of ["from", "where"]) chain[m] = () => chain;
			chain.then = (resolve: (v: unknown) => unknown) =>
				Promise.resolve(result).then(resolve);
			return chain;
		},
	} as never;
}

const ORG = "11111111-1111-4111-8111-111111111111";

describe("checkEmailDomainCreateAllowed", () => {
	test("allows when under both caps", async () => {
		const res = await checkEmailDomainCreateAllowed(dbReturning(2, 1), ORG);
		expect(res).toEqual({ allowed: true });
	});

	test("rejects with BAD_REQUEST at the total cap", async () => {
		const res = await checkEmailDomainCreateAllowed(
			dbReturning(MAX_TOTAL_DOMAINS, 0),
			ORG,
		);
		expect(res.allowed).toBe(false);
		if (!res.allowed) {
			expect(res.code).toBe("BAD_REQUEST");
			expect(res.reason).toContain(String(MAX_TOTAL_DOMAINS));
		}
	});

	test("rejects with TOO_MANY_REQUESTS at the hourly cap", async () => {
		// under total, at hourly
		const res = await checkEmailDomainCreateAllowed(
			dbReturning(3, MAX_CREATES_PER_HOUR),
			ORG,
		);
		expect(res.allowed).toBe(false);
		if (!res.allowed) {
			expect(res.code).toBe("TOO_MANY_REQUESTS");
			expect(res.reason).toContain(String(MAX_CREATES_PER_HOUR));
		}
	});

	test("total cap takes precedence over hourly when both exceeded", async () => {
		const res = await checkEmailDomainCreateAllowed(
			dbReturning(MAX_TOTAL_DOMAINS, MAX_CREATES_PER_HOUR),
			ORG,
		);
		expect(res.allowed).toBe(false);
		if (!res.allowed) expect(res.code).toBe("BAD_REQUEST");
	});

	test("respects custom opts overrides", async () => {
		const res = await checkEmailDomainCreateAllowed(dbReturning(2, 2), ORG, {
			maxTotal: 5,
			maxPerHour: 2,
		});
		expect(res.allowed).toBe(false);
		if (!res.allowed) expect(res.code).toBe("TOO_MANY_REQUESTS");
	});
});
