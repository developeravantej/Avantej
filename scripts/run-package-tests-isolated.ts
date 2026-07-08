/**
 * Isolated package-test runner (per-file process).
 *
 * Why: bun's `mock.module` is process-global and first-factory-wins per module
 * specifier. When a whole package suite runs in ONE process, a top-level,
 * unrestored `mock.module` in one file (e.g. routers/appointments.router.test.ts
 * stubbing the "@avantej-core/services" barrel) poisons the barrel re-export for
 * every OTHER file — the real `getDescendantNodeIds` / `resolveScopeNodeIds` get
 * replaced by stubs, so sibling hierarchy-scope tests fail spuriously. Every file
 * passes in isolation; only the combined `bun test src` run breaks.
 *
 * Running each file in its OWN bun process contains the contamination: each file
 * gets a fresh module registry, so its mocks never leak. Unit tests are fully
 * mocked (no DB), so the per-process overhead is negligible.
 *
 * This mirrors apps/server/scripts/run-unit-isolated.ts but is package-agnostic:
 * it takes the package dir as the first arg and runs everything under <pkg>/src.
 *
 * Usage:  bun run scripts/run-package-tests-isolated.ts <packageDir> [--timeout 60]
 * Example: bun run scripts/run-package-tests-isolated.ts packages/api
 */
import { readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

function collectTestFiles(pkgRoot: string): string[] {
	const srcAbs = join(pkgRoot, "src");
	let entries: string[] = [];
	try {
		entries = readdirSync(srcAbs, { recursive: true }) as string[];
	} catch {
		return [];
	}
	return entries
		.map((e) => join(srcAbs, e))
		.filter(
			(p) => p.endsWith(".test.ts") && !p.endsWith(".integration.test.ts"),
		)
		.map((p) => relative(pkgRoot, p).replace(/\\/g, "/"));
}

async function runFile(
	pkgRoot: string,
	relPath: string,
	timeoutSec: number,
): Promise<number> {
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), timeoutSec * 1000);
	try {
		const proc = Bun.spawn(["bun", "test", relPath], {
			cwd: pkgRoot,
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
	const pkgArg = process.argv[2];
	if (!pkgArg || pkgArg.startsWith("--")) {
		console.error(
			"Usage: bun run scripts/run-package-tests-isolated.ts <packageDir> [--timeout 60]",
		);
		process.exit(2);
	}
	const pkgRoot = isAbsolute(pkgArg) ? pkgArg : resolve(REPO_ROOT, pkgArg);

	const tIdx = process.argv.indexOf("--timeout");
	const perFileTimeout = tIdx >= 0 ? Number(process.argv[tIdx + 1]) : 60;

	const files = collectTestFiles(pkgRoot).sort();
	if (files.length === 0) {
		console.log(`No test files under ${pkgArg}/src — nothing to run.`);
		process.exit(0);
	}

	console.log(
		`Running ${files.length} test files in isolation for ${pkgArg} (per-file timeout ${perFileTimeout}s)\n`,
	);

	const results: Array<{ file: string; status: "pass" | "fail" | "timeout" }> =
		[];
	for (const file of files) {
		const code = await runFile(pkgRoot, file, perFileTimeout);
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
