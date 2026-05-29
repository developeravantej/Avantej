import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

const { Pool } = pg;
type Pool = pg.Pool;

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
 * Tests connect via `node-postgres` (`pg`) over direct TCP — NOT the
 * `@neondatabase/serverless` driver used in the Cloudflare Worker. Both
 * neon-serverless transports misbehave under Bun's test runner: the `ws`
 * WebSocket wedges on transaction ROLLBACK (throw-in-transaction tests hang to
 * the 30s timeout), and `poolQueryViaFetch` intermittently throws "socket
 * connection was closed unexpectedly". `pg` over TCP is solid under Bun and
 * handles transactions + multi-statement cleanly.
 *
 * One pool per connection URL is memoised for the whole process so the Neon
 * branch connection count stays flat across the ~45-file suite (per-call pools
 * with no teardown previously exhausted the cap and hung). `closeAllTestPools()`
 * (a global afterAll in src/tests/preload.ts) drains them so the process exits.
 */
const poolByUrl = new Map<string, Pool>();

function getSharedPool(url: string): Pool {
	let pool = poolByUrl.get(url);
	if (!pool) {
		pool = new Pool({
			connectionString: url,
			// Neon requires TLS; test env trusts the endpoint cert.
			ssl: { rejectUnauthorized: false },
			statement_timeout: 20_000,
			connectionTimeoutMillis: 15_000,
			// Break the cascade: when a transaction's rollback wedges under bun:test,
			// the session sits "idle in transaction" holding row locks, so later
			// tests block on those locks (one 30s hang stalls the whole run). These
			// make Postgres terminate the stuck session and time out lock waits, so a
			// wedged test fails FAST and the suite still runs to completion.
			idle_in_transaction_session_timeout: 10_000,
			lock_timeout: 10_000,
			max: 10,
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
 * Wrap `db.transaction` with a JS-level timeout race. Under bun's test runner
 * drizzle's transaction ROLLBACK promise can fail to settle when the callback
 * throws — the JS await hangs forever even though the server-side session is
 * already idle/aborted. No DB-level timeout fixes a never-settling promise, so a
 * wedged transaction would stall the test to bun's 30s timeout and (via held
 * locks) cascade to the rest of the run. Racing against a 15s timeout makes a
 * wedged transaction reject FAST; the idle_in_transaction/lock timeouts on the
 * pool then release the server-side locks. Healthy transactions (sub-second) are
 * unaffected — the race only fires on a genuine wedge.
 */
function withTxTimeout<T extends { transaction: (...args: any[]) => Promise<any> }>(
	db: T,
): T {
	const original = db.transaction.bind(db);
	(db as { transaction: unknown }).transaction = (...args: unknown[]) =>
		Promise.race([
			original(...args),
			new Promise((_resolve, reject) =>
				setTimeout(
					() => reject(new Error("integration test transaction timed out (15s)")),
					15_000,
				),
			),
		]);
	return db;
}

/**
 * Create a Drizzle client for the tenant test database (node-postgres over TCP).
 */
export function createTenantDb() {
	const url = process.env.TENANT_DATABASE_URL;
	if (!url) throw new Error("TENANT_DATABASE_URL is not set in .dev.vars");
	return withTxTimeout(drizzle({ client: getSharedPool(url), schema: tenantSchema }));
}

/**
 * Create a Drizzle client for the control panel database (node-postgres over TCP).
 */
export function createControlPanelDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set in .dev.vars");
	return withTxTimeout(
		drizzle({ client: getSharedPool(url), schema: controlPanelSchema }),
	);
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
