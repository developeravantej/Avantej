# Phase 4: Dead Code Cleanup

## Goal

Remove all confirmed dead code from the codebase — orphan components, legacy route files, unused stubs, mock constants, and debug logging. This phase has **no user-visible changes**; it is purely internal hygiene to reduce maintenance burden, shrink bundle size, and eliminate confusion for future contributors.

## Dependencies

**None.** This phase can run in parallel with Phase 3 (or any other phase). It touches only files that are confirmed unused and does not alter any live code paths.

---

## Task 4.1: Delete 19 Orphan Components

These files have zero imports anywhere in the codebase. Delete each one outright.

| # | File Path | Reason |
|---|-----------|--------|
| 1 | `apps/web/src/components/nav-main.tsx` | No imports found |
| 2 | `apps/web/src/components/nav-projects.tsx` | No imports found |
| 3 | `apps/web/src/components/nav-user.tsx` | No imports found |
| 4 | `apps/web/src/components/team-switcher.tsx` | No imports found |
| 5 | `apps/web/src/components/sign-in-form.tsx` | No imports found |
| 6 | `apps/web/src/components/sign-up-form.tsx` | No imports found (note: `signup-form.tsx` IS used and must be kept) |
| 7 | `apps/web/src/components/mode-toggle.tsx` | No imports found |
| 8 | `apps/web/src/components/user-menu.tsx` | No imports found |
| 9 | `apps/web/src/components/buttons/logout-button.tsx` | No imports found |
| 10 | `apps/web/src/components/forms/enhanced-product-form.tsx` | No imports found |
| 11 | `apps/web/src/components/forms/uom-form.tsx` | No imports found |
| 12 | `apps/web/src/components/access-control/editors/PermissionEditor.tsx` | No imports found |
| 13 | `apps/web/src/components/access-control/mobile/MobileRoleSheet.tsx` | No imports found |
| 14 | `apps/web/src/components/access-control/mobile/PermissionSelector.tsx` | No imports found |
| 15 | `apps/web/src/components/access-control/mobile/BulkAssignmentSheet.tsx` | No imports found |
| 16 | `apps/web/src/components/access-control/permission-cards/PermissionCard.tsx` | No imports found |
| 17 | `apps/web/src/components/merge-tables/unit-of-measure-dashboard.tsx` | No imports found |
| 18 | `apps/web/src/components/ui/switch.tsx` | No imports found |
| 19 | `apps/web/src/components/tables/packages/view/columns.tsx` | No imports found |

### Steps

1. Before deleting, run a final verification grep for each filename to confirm zero imports:
   ```bash
   for f in nav-main nav-projects nav-user team-switcher sign-in-form sign-up-form mode-toggle user-menu; do
     echo "=== $f ===" && rg -l "$f" apps/web/src/ --glob '!*.gen.*' || echo "(none)"
   done
   ```
   Repeat for the remaining files. If any file IS imported somewhere, do NOT delete it — flag it for review.

2. Delete all 19 files.

3. Check if any now-empty directories can be removed (e.g., `access-control/editors/`, `access-control/mobile/`, `access-control/permission-cards/`, `merge-tables/`). Delete empty directories.

---

## Task 4.2: Delete 4 Legacy Route Files

These routes duplicate functionality already present under the dashboard layout. They are remnants from an earlier routing structure.

| # | File Path | Duplicated By |
|---|-----------|---------------|
| 1 | `apps/web/src/routes/_authenticated/appointment/view.tsx` | `dashboard/_layout/appointment/view.tsx` |
| 2 | `apps/web/src/routes/_authenticated/service/view.tsx` | `dashboard/_layout/service/view.tsx` |
| 3 | `apps/web/src/routes/_authenticated/service-category/view.tsx` | `dashboard/_layout/service-category/view.tsx` |
| 4 | `apps/web/src/routes/_authenticated/user/view.tsx` | `dashboard/_layout/user/view.tsx` |

### Steps

1. Delete all 4 files.

2. Check if parent directories (`appointment/`, `service/`, `service-category/`, `user/`) become empty after deletion. If so, delete the empty directories.

3. Regenerate the route tree. TanStack Router auto-generates `routeTree.gen.ts` on dev server start:
   ```bash
   cd apps/web && npx tsr generate
   ```
   Alternatively, the route tree will regenerate automatically when `bun dev:web` is next started.

4. Verify the generated `routeTree.gen.ts` no longer references the deleted routes.

---

## Task 4.3: Remove _MOCK_USER_CONTEXT

**File:** `apps/web/src/hooks/useUserContext.ts` (around line 44)

### Steps

1. Open the file and locate the `_MOCK_USER_CONTEXT` constant (contains `demo@avantej.com`).

2. Delete the entire constant declaration. It is dead code left over from the Phase 2 bug fix that removed its last consumer.

3. Remove any associated type annotation or import that becomes unused after the constant is deleted.

4. Confirm no other file references `_MOCK_USER_CONTEXT`:
   ```bash
   rg "_MOCK_USER_CONTEXT" apps/web/src/
   ```

---

## Task 4.4: Remove Dead Stub Files

### 4.4.1 — Delete `apps/web/src/lib/api.ts`

The entire `ApiClient` class returns empty arrays for every method. All consumers have been migrated to oRPC (`@/utils/orpc`). Delete the file.

Verify no imports remain:
```bash
rg "from ['\"]@/lib/api['\"]" apps/web/src/
rg "from ['\"].*lib/api['\"]" apps/web/src/
```

### 4.4.2 — Delete `apps/web/src/lib/auth-debug.ts`

Uses old JWT-based patterns that are incompatible with Better-Auth. Not imported anywhere. Delete the file.

Verify:
```bash
rg "auth-debug" apps/web/src/
```

### 4.4.3 — Clean up `apps/web/src/hooks/useRoles.ts`

This file contains a deprecated `useRoleMatrix()` no-op stub. Procedure:

1. Read the file and identify all exports.
2. If `useRoles` (the non-deprecated hook) is still imported elsewhere, keep it and only delete the `useRoleMatrix` export plus any code exclusively supporting it.
3. If the entire file is unused (no imports of any export), delete the file.

Verify:
```bash
rg "useRoles" apps/web/src/ --glob '!useRoles.ts'
rg "useRoleMatrix" apps/web/src/
```

---

## Task 4.5: Purge Debug console.log Statements

Remove `console.log` calls from production code paths. Keep `console.error` and `console.warn` where they serve a genuine error-handling purpose.

### 4.5.1 — `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx`

14+ `console.log` calls. Remove all of them. These log branch data, form state, and API responses during normal operation.

### 4.5.2 — `apps/web/src/components/forms/hierarchical-branch-form.tsx`

8 `console.log` calls. Remove all of them. These log hierarchy traversal and form field changes.

### 4.5.3 — `packages/api/src/context.ts`

3 `console.log` calls in request context creation. Remove all of them. These log session resolution and tenant DB connection details on every single request.

### 4.5.4 — `apps/web/src/routes/subscribe.tsx`

6 `console.log` calls leaking payment data (Stripe session IDs, subscription details). Remove all of them. This is both a cleanup and a minor security improvement.

### Steps

For each file:
1. Open the file.
2. Remove every `console.log(...)` statement (full statement including any multiline arguments).
3. Do NOT remove `console.error(...)` or `console.warn(...)` unless they are also clearly debug-only.
4. Ensure no syntax errors are introduced (watch for `console.log` inside ternaries, template literals, or chained expressions).

---

## Task 4.6: Verify Build

After all deletions and edits are complete, run the full build verification:

```bash
bun check-types    # TypeScript compilation — must pass with zero errors
bun check          # Biome linting — must pass with zero errors
```

If either command fails:
- A type error likely means a deleted file was actually imported somewhere that the grep missed. Restore the file and investigate.
- A lint error likely means an unused import was left behind after a deletion. Remove the dangling import.

The TanStack Router route tree (`routeTree.gen.ts`) will regenerate automatically on the next `bun dev:web` start. If running in CI or without a dev server, explicitly regenerate:
```bash
cd apps/web && npx tsr generate
```

---

## Acceptance Criteria

- [ ] All 19 orphan component files from Task 4.1 are deleted and confirmed to have zero references in the codebase.
- [ ] All 4 legacy route files from Task 4.2 are deleted and `routeTree.gen.ts` no longer references them.
- [ ] `_MOCK_USER_CONTEXT` constant is removed from `useUserContext.ts`; `rg "_MOCK_USER_CONTEXT"` returns zero results.
- [ ] `apps/web/src/lib/api.ts` is deleted; `rg "lib/api"` returns zero import references.
- [ ] `apps/web/src/lib/auth-debug.ts` is deleted; `rg "auth-debug"` returns zero results.
- [ ] `useRoleMatrix` export is removed from `useRoles.ts` (file deleted entirely if nothing else in it is used).
- [ ] Zero `console.log` statements remain in the 4 files listed in Task 4.5.
- [ ] `bun check-types` passes with zero errors.
- [ ] `bun check` passes with zero errors.
- [ ] No empty directories are left behind after file deletions.
- [ ] No user-facing behavior has changed — all existing routes, features, and API calls work identically.
