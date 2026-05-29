import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

export const TEST_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";
export const TEST_BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
export const TEST_MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
export const TEST_USER_ID = "cccccccc-0000-4000-8000-000000000001";

/**
 * Load environment variables from .dev.vars.
 * Must be called before any DB connections are created.
 */
export function loadDevVars(): void {
	// Try multiple candidate paths so loader works whether tests run from
	// project root, apps/server, or via dist/ compiled output.
	const candidates = [
		join(import.meta.dir, "../../../.dev.vars"), // apps/server/src/tests/helpers → apps/server/.dev.vars
		join(import.meta.dir, "../../../../.dev.vars"),
		join(process.cwd(), ".dev.vars"),
		join(process.cwd(), "apps/server/.dev.vars"),
	];
	for (const devVarsPath of candidates) {
		try {
			const content = readFileSync(devVarsPath, "utf-8");
			for (const line of content.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const eqIdx = trimmed.indexOf("=");
				if (eqIdx === -1) continue;
				const key = trimmed.slice(0, eqIdx).trim();
				const value = trimmed.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, "$1");
				if (!process.env[key]) {
					process.env[key] = value;
				}
			}
			return;
		} catch {
			// try next candidate
		}
	}
	console.warn("[integration-setup] .dev.vars not found in any candidate path; using process.env as-is");
}

/**
 * Returns true if integration tests should be skipped.
 * Skips when SKIP_INTEGRATION_TESTS=true OR when TENANT_DATABASE_URL is missing.
 * Auto-loads .dev.vars first so callers don't need to remember.
 */
export function shouldSkipIntegration(): boolean {
	if (process.env.SKIP_INTEGRATION_TESTS === "true") return true;
	if (!process.env.TENANT_DATABASE_URL) {
		// Try loading .dev.vars on demand before declaring skip
		loadDevVars();
		if (!process.env.TENANT_DATABASE_URL) return true;
	}
	return false;
}

/**
 * Pools use a WebSocket transport (`ws`). A Neon branch has a finite connection
 * cap, so the previous behaviour — every integration file opening its own pool
 * via `createTenantDb()` and never closing it — accumulated open connections
 * across the ~45-file suite until the cap was hit, at which point the next
 * connection attempt blocked indefinitely (the "long no-output stretch → killed"
 * hang). Single files and small batches stayed under the cap, which is why they
 * passed while the full suite hung.
 *
 * Fix: memoise one pool per connection URL for the whole test process. Every
 * file shares the same pool, so the connection count stays flat regardless of
 * how many files run. `closeAllTestPools()` (a global afterAll, wired in
 * src/tests/preload.ts) ends the shared pools so the process exits on its own
 * instead of being kept alive by open sockets.
 */
const poolByUrl = new Map<string, Pool>();

function getSharedPool(url: string): Pool {
	neonConfig.webSocketConstructor = ws;
	let pool = poolByUrl.get(url);
	if (!pool) {
		pool = new Pool({
			connectionString: url,
			// Safety net for runaway SERVER-side queries: a query that blocks on a
			// row lock self-aborts instead of hanging indefinitely.
			statement_timeout: 20_000,
			connectionTimeoutMillis: 15_000,
			// NOTE: this does NOT cover the per-test hangs in membership-holds /
			// branch-invite. Those are pool-CLIENT exhaustion — an earlier test in
			// the file leaks a checked-out client (an unreleased transaction), and a
			// pg-style pool has no acquire timeout, so a later test waits forever for
			// a free client (hits Bun's 30s test timeout, not statement_timeout).
			// Tracked as a separate follow-up; see zplan/2026-05-29-future-work-omnibus.
		});
		poolByUrl.set(url, pool);
	}
	return pool;
}

/**
 * End every shared pool. Idempotent. Registered as a global afterAll in
 * `src/tests/preload.ts` so the suite process exits without being killed.
 */
export async function closeAllTestPools(): Promise<void> {
	const pools = [...poolByUrl.values()];
	poolByUrl.clear();
	await Promise.all(
		pools.map((pool) =>
			pool.end().catch(() => {
				// Already ended elsewhere — swallow so one failure doesn't block
				// the rest from draining.
			}),
		),
	);
}

/**
 * Create a Drizzle client for the tenant test database.
 * Uses a process-shared WebSocket Neon pool (required for Bun on Windows/Node).
 */
export function createTenantDb() {
	const url = process.env.TENANT_DATABASE_URL;
	if (!url) throw new Error("TENANT_DATABASE_URL is not set in .dev.vars");
	return drizzle({ client: getSharedPool(url), schema: tenantSchema });
}

/**
 * Create a Drizzle client for the control panel database.
 * Uses a process-shared WebSocket Neon pool.
 */
export function createControlPanelDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set in .dev.vars");
	return drizzle({ client: getSharedPool(url), schema: controlPanelSchema });
}

/**
 * Standard integration test member context for admin role.
 */
export function makeIntegrationAdminContext(
	tenantDb: ReturnType<typeof createTenantDb>,
) {
	return {
		tenantDb,
		organizationId: TEST_ORG_ID,
		accessibleNodeIds: [] as string[], // empty = admin (all access)
		member: {
			id: TEST_MEMBER_ID,
			userId: TEST_USER_ID,
			organizationId: TEST_ORG_ID,
			role: "admin" as const,
			status: "active" as const,
			hierarchyScopeId: null,
		},
		session: {
			user: {
				id: TEST_USER_ID,
				email: "franchisee@gmail.com",
				name: "Test Admin",
			},
		},
	};
}
