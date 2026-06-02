/**
 * Sweep orphaned `itest-*` Neon branches left behind by integration runs that
 * were killed before their global afterAll could delete the branch.
 *
 * Usage:
 *   bun run scripts/cleanup-test-branches.ts            # delete all itest-* branches
 *   bun run scripts/cleanup-test-branches.ts --older-than 2   # only > 2h old
 *
 * Requires NEON_API_KEY + TENANT_NEON_PROJECT_ID (defaults to the known project).
 * Reads .dev.vars the same way the test harness does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	deleteTestBranch,
	listTestBranches,
} from "../src/tests/helpers/neon-branch";

const DEFAULT_TENANT_PROJECT_ID = "silent-wind-47805343";

function loadEnv(): void {
	for (const p of [
		join(import.meta.dir, "../.dev.vars"),
		join(process.cwd(), ".dev.vars"),
		join(process.cwd(), "apps/server/.dev.vars"),
	]) {
		try {
			for (const line of readFileSync(p, "utf-8").split("\n")) {
				const t = line.trim();
				if (!t || t.startsWith("#")) continue;
				const i = t.indexOf("=");
				if (i < 0) continue;
				const k = t.slice(0, i).trim();
				if (!process.env[k]) {
					process.env[k] = t
						.slice(i + 1)
						.trim()
						.replace(/^"(.*)"$/, "$1");
				}
			}
			return;
		} catch {
			/* try next */
		}
	}
}

async function main() {
	loadEnv();
	const apiKey = process.env.NEON_API_KEY;
	if (!apiKey) throw new Error("NEON_API_KEY is required");
	const projectId =
		process.env.TENANT_NEON_PROJECT_ID ?? DEFAULT_TENANT_PROJECT_ID;

	const olderThanIdx = process.argv.indexOf("--older-than");
	const olderThanHours =
		olderThanIdx >= 0 ? Number(process.argv[olderThanIdx + 1]) : 0;
	const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;

	const branches = await listTestBranches({ apiKey, projectId });
	const stale = branches.filter(
		(b) => olderThanHours === 0 || new Date(b.createdAt).getTime() < cutoff,
	);
	console.log(
		`Found ${branches.length} itest-* branch(es); ${stale.length} match the age filter.`,
	);
	for (const b of stale) {
		await deleteTestBranch({ apiKey, projectId, branchId: b.id });
		console.log(`  deleted ${b.name} (${b.id}, created ${b.createdAt})`);
	}
	console.log("Done.");
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
