# Phase 0: Service Deduplication

**Goal:** Eliminate 3 duplicated service files in `apps/server/src/services/` that have diverged from their canonical counterparts in `packages/services/src/`. This unblocks all subsequent phases by establishing a single source of truth for business logic.

**User journeys delivered:** None (internal refactor). No user-visible changes.

**Dependencies:** None — this is the first phase.

---

## Tasks

### Task 0.1: Audit server-side service consumers

Before deleting, identify every file in `apps/server/` that imports from the 3 duplicate services.

**Files to grep:**
- `apps/server/src/services/hierarchy.service.ts`
- `apps/server/src/services/hierarchy-validation.service.ts`
- `apps/server/src/services/permission.service.ts`

**Action:** For each consumer, determine if it can switch to importing from `@avantej-core/services` directly.

**Expected consumers:**
- `apps/server/src/routes/hierarchy.routes.ts` → imports hierarchy + hierarchy-validation
- `apps/server/src/middleware/orpc-tenant.middleware.ts` → may import permission
- Any other server route files

### Task 0.2: Verify packages/services exports cover all needed functions

Compare the server copies with the packages copies to identify any functions that exist ONLY in the server copy:

| Function | Server copy | Packages copy | Action |
|----------|------------|---------------|--------|
| `getDescendantNodeIds` | Yes | Yes | Use packages |
| `createHierarchyNode` | Yes | Yes | Use packages |
| `validateHierarchyRules` | Yes | Yes | Use packages |
| `validateParentAccess` | Yes | Yes | Use packages |
| `hasPermission` | Yes (4 resources) | Yes (11+ resources) | Use packages (more complete) |

If the server copy has any function NOT in the packages copy, port it to packages first.

**Files to modify:**
- `packages/services/src/index.ts` — ensure all needed exports are present

### Task 0.3: Update server imports and delete duplicates

**Files to modify:**
- Every consumer identified in Task 0.1 — change imports from `../services/hierarchy.service` to `@avantej-core/services`
- Delete: `apps/server/src/services/hierarchy.service.ts`
- Delete: `apps/server/src/services/hierarchy-validation.service.ts`
- Delete: `apps/server/src/services/permission.service.ts`

**Files to verify still exist (NOT duplicates):**
- `apps/server/src/services/admin.service.ts` — server-only, no package equivalent
- `apps/server/src/services/gohighlevel.service.ts` — server-only integration
- `apps/server/src/services/google-calendar.service.ts` — server-only integration

### Task 0.4: Verify build and tests

```bash
bun check-types    # TypeScript compilation
bun check          # Biome lint
cd apps/server && bun test  # Server tests
```

---

## Acceptance Criteria

- [ ] Zero files in `apps/server/src/services/` that duplicate `packages/services/src/`
- [ ] All server routes import from `@avantej-core/services`
- [ ] `bun check-types` passes
- [ ] `bun test` passes (server)
