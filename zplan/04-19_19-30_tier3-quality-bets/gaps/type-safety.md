# Type Safety Audit
**Session:** 04-19_19-30_tier3-quality-bets
**Lens:** type-safety
**Findings:** 6 (0 critical · 1 high · 2 medium · 3 low)

## Findings

### [HIGH] `@sentry/react` not installed — Phase 3.1 will fail at import time
**Plan claims:** Phase 3.1: `import * as Sentry from "@sentry/react"` in `apps/web/src/lib/sentry.ts` and `DashboardErrorBoundary.tsx`.
**Actual:** `@sentry/react` is not listed in `apps/web/package.json` dependencies. The package is not installed. Running any file that imports `@sentry/react` will fail immediately with "Cannot find module '@sentry/react'" — both at compile time (`bun check-types`) and at runtime. Phase 3.1 task 3.1.1 says "Install `@sentry/react` in `apps/web`" but this must happen before ANY of the other 3.1 tasks, since tasks 3.1.3–3.1.5 all reference the import.
**File:** `apps/web/package.json` (no Sentry entry in dependencies or devDependencies)
**Fix:** Task 3.1.1 is correctly ordered (install first). Ensure it runs `bun add @sentry/react` from `apps/web/` (not the root) and pins to a compatible version. Recommend `^8.x` (latest stable). Verify `@sentry/react@8` exports `browserTracingIntegration` (it does, confirmed in Sentry v8 changelog).

---

### [MEDIUM] `useBlocker` plan was written against v1.114.25 but v1.167.4 is installed — delta unreviewed
**Plan claims:** "API note (verified against v1.114.25 `useBlocker.d.ts`): Use `{ shouldBlockFn, enableBeforeUnload, disabled }` instead of deprecated `{ blockerFn, condition }`."
**Actual:** Installed version is `@tanstack/react-router@1.167.4`. The `{ shouldBlockFn, enableBeforeUnload, disabled }` overload IS present and correct in 1.167.4 (confirmed from type definitions). However, 53 minor versions elapsed between the audit baseline (1.114.25) and the installed version. The delta has not been reviewed for any breaking changes to the `useBlocker` API or its surrounding context (navigation guards, router lifecycle). Low probability of breakage given TanStack Router's semver discipline, but the version gap is undocumented.
**File:** `node_modules/@tanstack/react-router/dist/esm/useBlocker.d.ts`, `apps/web/package.json:40`
**Fix:** Update the API note in §3.7 to say "verified against v1.167.4 (installed)". Scan the TanStack Router CHANGELOG between 1.114 and 1.167 for `useBlocker` entries before implementing Phase 3.4.

---

### [MEDIUM] `execSync("git rev-parse --short HEAD")` throws in shallow CI clones / Docker images without git
**Plan claims:** §3.2 (vite.config.ts): `const gitSha = execSync("git rev-parse --short HEAD").toString().trim();` — used to inject `VITE_GIT_SHA`.
**Actual:** `execSync` throws a non-zero exit code if git is not available or the HEAD ref doesn't exist (e.g., GitHub Actions with `fetch-depth: 0` but without git initialized, or a Docker build from a tarball). This will cause the Vite build to fail entirely — not just produce a missing SHA, but crash the build. Current `apps/web/vite.config.ts` has no `define` block and no try-catch.
**File:** `apps/web/vite.config.ts` (lines 1–37, no `define` or git invocation yet)
**Fix:** Wrap in try-catch with fallback: `const gitSha = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return process.env.VITE_GIT_SHA ?? "unknown"; } })();` — allows CI to inject `VITE_GIT_SHA` as an env var for environments without git.

---

### [LOW] `Intl.DateTimeFormat` lib availability is implicit — tsconfig has no explicit `"lib"` key
**Plan claims:** Phase 3.7 uses `new Intl.DateTimeFormat("en-MY", ...)` — assumes Intl types available.
**Actual:** `apps/web/tsconfig.json` has `"target": "ESNext"` but no explicit `"lib"` key. ESNext target includes Intl types in TypeScript's default lib. This works correctly today. However, if `target` is ever changed to an older ES version (e.g., "ES2018" for compatibility), Intl types could be silently dropped from the default lib without a tsconfig error.
**File:** `apps/web/tsconfig.json` (lines 1–18)
**Fix:** Add `"lib": ["ESNext", "DOM", "DOM.Iterable"]` to tsconfig.json to make the dependency explicit.

---

### [LOW] `opts` spread in `formatDateMYT` allows silent override of default format options
**Plan claims:** §3.7.1: `new Intl.DateTimeFormat("en-MY", { year: "numeric", month: "short", day: "numeric", ...opts })` — opts can override defaults.
**Actual:** This is intentional by design (user options take precedence). However, if a caller passes `{ year: "2-digit" }`, the default `year: "numeric"` is silently replaced. This may produce unexpected output in call sites that assume `formatDateMYT` always returns a full 4-digit year.
**File:** `apps/web/src/lib/date.ts` (planned new file)
**Fix:** Add a JSDoc comment: `@param opts - Overrides the default format. Note: year/month/day defaults can be replaced.` No code change needed.

---

### [LOW] Pre-existing `as any` casts in files the plan will modify
**Plan claims:** Plan does not address existing type safety issues in modified files.
**Actual:** Two files touched by this plan have unsafe casts:
- `apps/web/src/components/app-sidebar.tsx:287`: `const sessionUser = session?.user as any;` — suppresses type checking on user properties
- `apps/web/src/hooks/useAuth.ts:88`: `permissions: [] as any[]` — suppresses permission array typing
These are pre-existing issues but are in files that will be modified in Phase 3.1 (error boundary / Sentry wiring). Introducing new code around them risks propagating the `any` pattern.
**File:** `apps/web/src/components/app-sidebar.tsx:287`, `apps/web/src/hooks/useAuth.ts:88`
**Fix:** While modifying these files in Phase 3.1, replace `as any` with the correct types (session user type from Better-Auth schema; permission type from the access-control schema). Not blocking, but opportunistic cleanup.

---

## Summary
The plan is type-safe in intent and the proposed code patterns are correctly typed for the installed library versions. The one HIGH finding is a **build blocker**: `@sentry/react` is not installed and must be added in task 3.1.1 before any Phase 3.1 code is written. The `execSync` crash risk is a MEDIUM that could silently break CI builds. The `useBlocker` API is compatible with the installed version despite the version gap. No proposed interface conflicts with existing types. No `bun check-types` failures are expected once the Sentry package is installed and the try-catch is added.
