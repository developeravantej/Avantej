import { describe, test, expect } from "bun:test";
import { TENANT_MIGRATIONS } from "./migrate-tenant";

/**
 * Tenant migration sanity guard.
 *
 * Background: tenant migrations live in two places —
 *  1. On-disk SQL files in `migrations/tenant/*.sql` (drizzle-kit history)
 *  2. Inline TENANT_MIGRATIONS array in migrate-tenant.ts (Cloudflare Workers
 *     runtime migrator — fs is unavailable at request time)
 *
 * Per the audit at `docs/migration-drift-audit.md`, the inline array is the
 * single source of truth for what actually runs against tenant databases.
 * The on-disk files are drizzle-kit's bookkeeping; not enforced parity.
 *
 * What we DO enforce on TENANT_MIGRATIONS:
 *  - Hashes are unique (no double-applies).
 *  - Every entry has a non-empty `hash` and `sql`.
 *  - Hashes loosely follow the lexicographic naming pattern (`NNNN_name`)
 *    so insertions don't accidentally land out of order.
 *
 * Drift between on-disk and inline (other direction) is captured in the
 * audit doc and tracked as a follow-up cleanup PR. This test does NOT
 * compare against on-disk files because the audit confirms they can drift
 * harmlessly — the runtime migrator never reads them.
 */

describe("TENANT_MIGRATIONS sanity", () => {
	test("hashes are unique", () => {
		const seen = new Set<string>();
		const duplicates: string[] = [];
		for (const m of TENANT_MIGRATIONS) {
			if (seen.has(m.hash)) duplicates.push(m.hash);
			seen.add(m.hash);
		}
		expect(duplicates).toEqual([]);
	});

	test("every entry has non-empty hash + sql", () => {
		const invalid: string[] = [];
		for (const m of TENANT_MIGRATIONS) {
			if (!m.hash || typeof m.hash !== "string") {
				invalid.push(`bad hash: ${JSON.stringify(m.hash)}`);
			}
			if (!m.sql || typeof m.sql !== "string" || m.sql.trim().length === 0) {
				invalid.push(`bad sql for hash ${m.hash}`);
			}
		}
		expect(invalid).toEqual([]);
	});

	test("hashes follow the NNNN_name pattern", () => {
		const re = /^\d{4}_[a-z0-9_]+$/;
		const malformed: string[] = [];
		for (const m of TENANT_MIGRATIONS) {
			if (!re.test(m.hash)) malformed.push(m.hash);
		}
		expect(malformed).toEqual([]);
	});

	test("non-empty array (regression: silently emptied list would skip all migrations)", () => {
		expect(TENANT_MIGRATIONS.length).toBeGreaterThan(0);
	});
});
