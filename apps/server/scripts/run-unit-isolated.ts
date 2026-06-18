/**
 * Isolated unit-suite runner.
 *
 * Why: bun's `mock.module` is process-global and first-factory-wins per module
 * specifier. When the whole unit suite runs in ONE process, a partial subpath
 * mock in one file (e.g. mocking "@avantej-core/services/invitation.service"
 * without re-exporting createInvitation, or "src/lib/db.ts" without
 * controlPanelDb) poisons the barrel re-export for every OTHER file, surfacing
 * as spurious "Export named 'X' not found" load errors and cross-file assertion
 * failures. Every file passes in isolation; only the combined run breaks.
 *
 * Running each file in its OWN bun process contains the contamination: each
 * file gets a fresh module registry, so its mocks never leak. Fast (unit tests
 * are fully mocked — no DB), so the per-process overhead is negligible.
 *
 * Usage:  bun run scripts/run-unit-isolated.ts [--timeout 60]
 */
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

const SERVER_ROOT = join(import.meta.dir, "..");

// Full unit-test tree. Covers routers + services + top-level unit files plus
// middleware/lib/cron. The combined (single-process) `bun run test` is unsafe
// here because bun's process-global mock.module poisons cross-file barrel
// re-exports; this per-file runner is the reliable green gate for the whole
// unit suite.
const SCOPE_DIRS = ["src/tests/unit", "src/middleware", "src/lib", "src/cron"];
const SCOPE_FILES = [
	"src/routers/payments.test.ts",
	"src/routers/stripe-connect.test.ts",
];

function collectTestFiles(dirRel: string): string[] {
	const abs = join(SERVER_ROOT, dirRel);
	let entries: string[] = [];
	try {
		entries = readdirSync(abs, { recursive: true }) as string[];
	} catch {
		return [];
	}
	return entries
		.map((e) => join(abs, e))
		.filter(
			(p) => p.endsWith(".test.ts") && !p.endsWith(".integration.test.ts"),
		)
		.map((p) => relative(SERVER_ROOT, p).replace(/\\/g, "/"));
}

async function runFile(path: string, timeoutSec: number): Promise<number> {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutSec * 1000);
	try {
		const proc = Bun.spawn(["bun", "test", path], {
			cwd: SERVER_ROOT,
			env: { ...process.env, SKIP_INTEGRATION_TESTS: "true" },
			stdout: "inherit",
			stderr: "inherit",
			signal: ac.signal,
		});
		return await proc.exited;
	} catch {
		return 124; // treat abort/spawn failure as timeout-ish
	} finally {
		clearTimeout(timer);
	}
}

async function main() {
	const tIdx = process.argv.indexOf("--timeout");
	const perFileTimeout = tIdx >= 0 ? Number(process.argv[tIdx + 1]) : 60;

	const files = [
		...new Set([...SCOPE_DIRS.flatMap(collectTestFiles), ...SCOPE_FILES]),
	].sort();

	console.log(
		`Running ${files.length} unit test files in isolation (per-file timeout ${perFileTimeout}s)\n`,
	);

	const results: Array<{ file: string; status: "pass" | "fail" | "timeout" }> =
		[];
	for (const file of files) {
		const code = await runFile(file, perFileTimeout);
		const status = code === 0 ? "pass" : code === 124 ? "timeout" : "fail";
		results.push({ file, status });
		const mark = status === "pass" ? "✓" : status === "timeout" ? "⏱" : "✗";
		console.log(`${mark}  ${file}`);
	}

	const pass = results.filter((r) => r.status === "pass").length;
	const fail = results.filter((r) => r.status === "fail").length;
	const timeout = results.filter((r) => r.status === "timeout").length;
	console.log(
		`\n=== ${pass} files pass / ${fail} fail / ${timeout} timeout (of ${files.length}) ===`,
	);
	if (fail + timeout > 0) {
		console.log(
			"Non-passing files:",
			results
				.filter((r) => r.status !== "pass")
				.map((r) => `${r.file} (${r.status})`)
				.join(", "),
		);
	}
	process.exit(fail + timeout > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
