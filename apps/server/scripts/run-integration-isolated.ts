/**
 * Isolated integration-suite runner.
 *
 * Why: under bun's test runner a single wedged DB test (a query that blocks
 * waiting for a leaked pool client — pg has no acquire timeout) stalls the WHOLE
 * runner, so the full `bun test src/tests/integration/` never completes. Running
 * each file in its OWN bun process with a hard per-file timeout contains that:
 * a wedged file is killed and the runner moves on, and every other file still
 * reports real pass/fail. All files share ONE Neon branch (created once here),
 * so there's no per-process branch explosion and no cross-run contention.
 *
 * Usage:  bun run scripts/run-integration-isolated.ts [--timeout 90]
 * Env:    NEON_API_KEY (+ TENANT_NEON_PROJECT_ID) for the shared branch.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTestBranch, deleteTestBranch } from "../src/tests/helpers/neon-branch";

const DEFAULT_TENANT_PROJECT_ID = "tiny-fog-53227130";
const INTEGRATION_DIR = join(import.meta.dir, "../src/tests/integration");

function loadEnv(): void {
	for (const p of [join(import.meta.dir, "../.dev.vars"), join(process.cwd(), ".dev.vars")]) {
		try {
			for (const line of readFileSync(p, "utf-8").split("\n")) {
				const t = line.trim();
				if (!t || t.startsWith("#")) continue;
				const i = t.indexOf("=");
				if (i < 0) continue;
				const k = t.slice(0, i).trim();
				if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
			}
			return;
		} catch {
			/* next */
		}
	}
}

async function main() {
	loadEnv();
	const apiKey = process.env.NEON_API_KEY;
	if (!apiKey) throw new Error("NEON_API_KEY is required");
	const projectId = process.env.TENANT_NEON_PROJECT_ID ?? DEFAULT_TENANT_PROJECT_ID;
	const tIdx = process.argv.indexOf("--timeout");
	const perFileTimeout = tIdx >= 0 ? Number(process.argv[tIdx + 1]) : 90;

	const files = readdirSync(INTEGRATION_DIR)
		.filter((f) => f.endsWith(".integration.test.ts"))
		.sort();

	console.log(`Provisioning shared test branch on ${projectId}…`);
	const branch = await createTestBranch({
		apiKey,
		projectId,
		name: `itest-runner-${process.pid}`,
	});
	// Bring the branch schema current (parent project lags migrations).
	const { runTenantMigrations } = await import("@avantej-core/db");
	await runTenantMigrations(branch.connectionUri);
	console.log(`Branch ${branch.branchId} ready. Running ${files.length} files (per-file timeout ${perFileTimeout}s)\n`);

	const results: Array<{ file: string; status: "pass" | "fail" | "timeout"; code: number }> = [];
	try {
		for (const file of files) {
			const path = `src/tests/integration/${file}`;
			const proc = Bun.spawn(
				["timeout", String(perFileTimeout), "bun", "test", path],
				{
					env: {
						...process.env,
						TENANT_DATABASE_URL: branch.connectionUri,
						ISOLATED_TEST_DB: "", // we inject the URL; don't let preload provision
					},
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			const code = await proc.exited;
			const status = code === 0 ? "pass" : code === 124 ? "timeout" : "fail";
			results.push({ file, status, code });
			const mark = status === "pass" ? "✓" : status === "timeout" ? "⏱ TIMEOUT" : "✗";
			console.log(`${mark}  ${file}${status !== "pass" ? ` (exit ${code})` : ""}`);
		}
	} finally {
		await deleteTestBranch({ apiKey, projectId, branchId: branch.branchId }).catch(() => {});
	}

	const pass = results.filter((r) => r.status === "pass").length;
	const fail = results.filter((r) => r.status === "fail").length;
	const timeout = results.filter((r) => r.status === "timeout").length;
	console.log(`\n=== ${pass} files pass / ${fail} fail / ${timeout} timeout (of ${files.length}) ===`);
	if (timeout > 0) {
		console.log("Timed-out (wedged) files:", results.filter((r) => r.status === "timeout").map((r) => r.file).join(", "));
	}
	process.exit(fail + timeout > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
