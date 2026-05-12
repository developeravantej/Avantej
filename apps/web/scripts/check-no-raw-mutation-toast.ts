#!/usr/bin/env bun
/**
 * Phase 7 guard: fail the build if new `useMutation` + raw try/catch+toast patterns
 * appear outside the migration allow-list.
 *
 * Policy:
 *   - Every mutation in apps/web/src SHOULD use `useApiMutation` from @/hooks/useApiMutation.
 *   - Files listed in ALLOW_LIST are grandfathered — they have a documented reason
 *     in zplan/.../non-migratable.md or are pending their Phase 6 split.
 *
 * Exit 0: clean. Exit 1: new violation (CI fails).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEB_SRC = join(process.cwd(), "apps", "web", "src");
const FALLBACK_SRC = join(process.cwd(), "src");
const SRC = existsSync(WEB_SRC) ? WEB_SRC : FALLBACK_SRC;

// Grandfathered files — see zplan/04-24_11-22_web-modularity-refactor/plan/non-migratable.md
const ALLOW_LIST = new Set([
	// Mega-files — pending their Phase 6 split; migration happens as part of that phase.
	"components/calendar/add-appointment-modal.tsx",
	"routes/_authenticated/dashboard/_layout/trainers/view.tsx",
	"components/pages/packages/installments-page.tsx",

	// Documented non-migratable — each has a structural reason in non-migratable.md.
	"components/forms/hierarchical-branch-form.tsx",
	"routes/(auth)/setup-password.tsx",
	"components/calendar/appointment.tsx", // updateMutation partial
	"routes/_authenticated/dashboard/_layout/rooms/view.tsx", // deactivate/reactivate partial
	"routes/accept-invitation.tsx", // verifyEmailMutation has no toast path
	"routes/subscribe.tsx", // pre-existing broken imports

	// Not part of this migration scope — small hooks that wrap mutations deliberately.
	"hooks/useApiMutation.ts", // the hook itself
	"hooks/useRoles.ts",
	"hooks/useUserAssignment.ts",
	"hooks/useProductForm.ts",
	"components/dashboard/onboarding-checklist.tsx",
	"components/pos/promo-step.tsx",
	"routes/_authenticated/dashboard/_layout/notifications/view.tsx",
]);

const PATTERN = "\\buseMutation\\b";

const res = spawnSync(
	"grep",
	["-rln", "--include=*.ts", "--include=*.tsx", "-E", PATTERN, "."],
	{ cwd: SRC, encoding: "utf8" },
);

if (res.status !== 0 && res.status !== 1) {
	console.error("[check-no-raw-mutation-toast] grep failed:", res.stderr);
	process.exit(2);
}

const hits = (res.stdout || "")
	.split("\n")
	.map((l) => l.trim().replace(/^\.\//, ""))
	.filter(Boolean);

const violations: string[] = [];
for (const file of hits) {
	if (ALLOW_LIST.has(file)) continue;
	// Read the file — if the ONLY `useMutation` match is the `useApiMutation` identifier
	// (which contains `useMutation` as a substring but is the allowed helper), skip.
	const full = readFileSync(join(SRC, file), "utf8");
	// Strip `useApiMutation` occurrences, then re-check for `useMutation`.
	const stripped = full.replace(/useApiMutation/g, "");
	if (/\buseMutation\b/.test(stripped)) {
		violations.push(file);
	}
}

if (violations.length > 0) {
	console.error(
		`\n[check-no-raw-mutation-toast] ${violations.length} file(s) use raw \`useMutation\` outside the allow-list:\n`,
	);
	for (const v of violations) {
		console.error(`  - ${v}`);
	}
	console.error(
		"\nUse `useApiMutation` from @/hooks/useApiMutation. See:",
	);
	console.error(
		"  zplan/04-24_11-22_web-modularity-refactor/plan/migration-pattern.md",
	);
	console.error(
		"\nIf this file genuinely cannot fit the pattern, add it to ALLOW_LIST in",
	);
	console.error(
		"  apps/web/scripts/check-no-raw-mutation-toast.ts",
	);
	console.error(
		"and document the reason in plan/non-migratable.md.\n",
	);
	process.exit(1);
}

console.log(
	`[check-no-raw-mutation-toast] OK — ${hits.length} file(s) use useMutation, all grandfathered.`,
);
