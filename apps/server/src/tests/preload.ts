/**
 * Bun test preload — runs once before any test file in `apps/server`.
 *
 * Two responsibilities:
 *
 * 1. Pool teardown (always): drains every Neon pool opened via the
 *    integration-setup helpers so the test process exits on its own instead of
 *    hanging after the last test (the "long no-output stretch → killed" symptom
 *    on full-suite runs).
 *
 * 2. Per-run DB isolation (opt-in, ISOLATED_TEST_DB=true): create a copy-on-write
 *    Neon branch of the tenant project and point TENANT_DATABASE_URL at it BEFORE
 *    any test file loads. Because loadDevVars() only sets a key when it is unset,
 *    pre-setting process.env here wins — so every createTenantDb() call uses the
 *    private branch. The branch is deleted in the global afterAll. Without the
 *    flag, behaviour is unchanged (shared dev DB) so single-file runs stay fast.
 *
 * Wired via apps/server/bunfig.toml: [test] preload = ["./src/tests/preload.ts"].
 */
import { afterAll } from "bun:test";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { runTenantMigrations } from "@avantej-core/db";
import { closeAllTestPools, loadDevVars } from "./helpers/integration-setup";
import { createTestBranch, deleteTestBranch } from "./helpers/neon-branch";

// Default to the known "tenant-test-integration" project; override via env.
const DEFAULT_TENANT_PROJECT_ID = "tiny-fog-53227130";

let provisionedBranch: { projectId: string; branchId: string } | null = null;

if (process.env.ISOLATED_TEST_DB === "true") {
	loadDevVars(); // populate NEON_API_KEY / project id from .dev.vars if present
	const apiKey = process.env.NEON_API_KEY;
	if (!apiKey) {
		throw new Error(
			"ISOLATED_TEST_DB=true requires NEON_API_KEY (set it in .dev.vars or the environment)",
		);
	}
	const projectId =
		process.env.TENANT_NEON_PROJECT_ID ?? DEFAULT_TENANT_PROJECT_ID;
	// Unique, sortable, sweepable name. preload is a plain script, so Date.now()
	// is available (unlike Workflow scripts). Prefer CI's run id for traceability.
	const runId =
		process.env.TEST_RUN_ID ?? process.env.GITHUB_RUN_ID ?? `local-${process.pid}`;
	const name = `itest-tenant-${runId}-${Date.now().toString(36)}`;

	const branch = await createTestBranch({ apiKey, projectId, name });
	process.env.TENANT_DATABASE_URL = branch.connectionUri;
	provisionedBranch = { projectId, branchId: branch.branchId };

	// The parent project's schema can lag behind the committed tenant migrations,
	// so bring the fresh branch fully up to date (idempotent — applies only the
	// pending ones). Without this, tests on newer columns fail (e.g.
	// notifications.email_sent_at from migration 0076). Needs the ws transport;
	// set it here since getSharedPool hasn't run yet at preload time.
	neonConfig.webSocketConstructor = ws;
	const applied = await runTenantMigrations(branch.connectionUri);
	// eslint-disable-next-line no-console
	console.log(
		`[preload] isolated tenant DB ready — branch ${branch.branchId} (${name}); migrations: ${applied}`,
	);
}

afterAll(async () => {
	await closeAllTestPools();
	if (provisionedBranch && process.env.NEON_API_KEY) {
		try {
			await deleteTestBranch({
				apiKey: process.env.NEON_API_KEY,
				projectId: provisionedBranch.projectId,
				branchId: provisionedBranch.branchId,
			});
			// eslint-disable-next-line no-console
			console.log(`[preload] deleted isolated branch ${provisionedBranch.branchId}`);
		} catch (err) {
			// Don't fail the run on cleanup error — the orphan sweep will catch it.
			// eslint-disable-next-line no-console
			console.warn(
				`[preload] branch cleanup failed (will be swept later): ${(err as Error).message}`,
			);
		}
	}
});
