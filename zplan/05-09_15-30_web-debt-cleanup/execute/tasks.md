# Task Inventory

**Plan:** zplan/05-09_15-30_web-debt-cleanup/plan/plan.md
**Generated:** 2026-05-09
**Scope:** Phase 1 only (per user approval)
**Total tasks:** 8

| # | Phase | Task | Owner | Status |
|---|-------|------|-------|--------|
| 1 | 1 | `subscribe.tsx` — remove 6x console.log (lines 105, 115, 145, 152, 163, 182); sanitize console.error at lines 121, 140, 171 | Agent A (console-cleanup) | done |
| 2 | 1 | `subscribe.tsx` — remove dead apiClient try-block at line 100 (method never exists); keep only inner fetch() logic; remove apiClient import | Agent A (console-cleanup) | done |
| 3 | 1 | `lib/api.ts:29,34,39` — replace console.warn("TODO: Replace...") with throw Error("apiClient.X deprecated...") | Agent A (console-cleanup) | done |
| 4 | 1 | `lib/auth-debug.ts:69-83` — wrap entire console.group block through groupEnd() in `if (import.meta.env.DEV)` guard | Agent A (console-cleanup) | done |
| 5 | 1 | `components/forms/hierarchical-branch-form.tsx` — remove/DEV-guard all 10 console.log + 4 console.warn calls | Agent A (console-cleanup) | done |
| 6 | 1 | `components/tables/packages/view/columns.tsx:127` — remove console.log("Edit package:", row.original) | Agent A (console-cleanup) | done |
| 7 | 1 | `biome.json` — add `"noConsoleLog": "error"` to linter.rules.suspicious | Agent B (biome-rule) | done |
| 8 | 1 | Verify: `grep -rn "console\.log" apps/web/src \| grep -v "import.meta.env.DEV"` returns zero matches; `bun check` passes | Agent A (console-cleanup) | done |
