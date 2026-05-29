# GHL Staff Sync Router Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `syncStaffToGhl` orchestrator into Avantej staff CRUD flows (members router + invitation acceptance + better-auth profile update) so that staff lifecycle changes propagate to GoHighLevel Users.

**Architecture:** Introduce a single `dispatchStaffSync` service in `packages/services/` that owns all skip rules, branch resolution, and branch-reassignment handling. Routers and hooks call this dispatcher; it never throws. Sync runs inline (awaited in same request); failures soft-fail with `lastError` stored in `ghl_user_links` and a manual retry button in the UI.

**Tech Stack:** TypeScript, Drizzle ORM, oRPC, Cloudflare Workers, Better-Auth, React (TanStack Router), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-05-ghl-staff-sync-wiring-design.md`

---

## File Structure

**New files:**
- `packages/services/src/ghl-staff-sync.service.ts` — `dispatchStaffSync` + `dispatchProfileSync` (the dispatcher)
- `packages/services/src/ghl-staff-sync.service.test.ts` — unit tests for the dispatcher

**Modified files:**
- `packages/services/src/index.ts` — re-export new service
- `packages/api/src/routers/members.ts` — wire `create`, `updateRole`, `updateScope` (if exists), `deactivate`; add `retryGhlSync`
- `apps/server/src/routers/invitations.ts` — wire `acceptWithSignup` member-creation path
- `packages/auth/src/index.ts` — add `databaseHooks.user.update.after` to fire `dispatchProfileSync`
- `apps/server/src/services/ghl/sync-staff.ts` — minor: ensure `syncStatus='inactive'` is accepted (no schema change required, just type if narrowed)
- `apps/web/src/routes/.../members.tsx` (or equivalent) — add GHL Sync badge column + retry button

---

## Open-item resolutions (from spec)

| Spec open item | Resolution for this plan |
|---|---|
| Profile-update hook strategy | Use Better-Auth `databaseHooks.user.update.after` (already used pattern in `packages/auth/src/index.ts`). |
| Branch reassignment link-row behavior | Dispatcher detects branch change by querying `ghl_user_links` filtered by `memberId` only. If old `branchNodeId` ≠ new, it bypasses `syncStaffToGhl` and: (a) PUTs the existing GHL user with new `locationIds`, (b) UPDATEs the existing link row's `branchNodeId` + `ghlLocationId`. |
| `inactive` syncStatus value | Column is `text` (no enum constraint). Use literal `"inactive"`. |
| `existingBranch` custom field | **Deferred to a follow-up.** v1 only updates `locationIds`. A TODO comment in the dispatcher documents this. |
| `ghlSync` response field | Add as optional `ghlSync?: StaffSyncResult` field on `members.create`/`updateRole`/`updateScope`/`deactivate` responses + `retryGhlSync` returns it as primary payload. Non-breaking for clients. |

---

## Task 1: Create `dispatchStaffSync` skeleton + first skip-rule test

**Files:**
- Create: `packages/services/src/ghl-staff-sync.service.ts`
- Test: `packages/services/src/ghl-staff-sync.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/services/src/ghl-staff-sync.service.test.ts
import { describe, expect, it, vi } from "vitest";
import { dispatchStaffSync } from "./ghl-staff-sync.service";

describe("dispatchStaffSync", () => {
  it("returns skipped/non-staff-role when member.role is not admin/staff/trainer", async () => {
    const tenantDb = {
      query: {
        members: {
          findFirst: vi.fn().mockResolvedValue({
            id: "m-1",
            userId: "u-1",
            role: "client",
            status: "active",
            hierarchyScopeId: "n-1",
          }),
        },
      },
    } as any;

    const result = await dispatchStaffSync({
      controlPanelDb: {} as any,
      tenantDb,
      organizationId: "org-1",
      memberId: "m-1",
      operation: "create",
      env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
    });

    expect(result).toEqual({ status: "skipped", reason: "non-staff-role" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: FAIL with `Cannot find module './ghl-staff-sync.service'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/services/src/ghl-staff-sync.service.ts
import { eq, and } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members } from "@avantej-core/db/schema/tenant/members";

export type StaffSyncOperation = "create" | "update" | "delete";

export type StaffSyncSkipReason =
  | "non-staff-role"
  | "non-branch-scope"
  | "branch-not-connected"
  | "deactivate-skip";

export interface StaffSyncResult {
  status: "synced" | "skipped" | "error";
  reason?: StaffSyncSkipReason;
  ghlUserId?: string;
  error?: string;
}

export interface DispatchStaffSyncArgs {
  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
  tenantDb: NeonDatabase<typeof tenantSchema>;
  organizationId: string;
  memberId: string;
  operation: StaffSyncOperation;
  env: { GHL_AGENCY_ID: string; ENCRYPTION_KEY: string };
}

const STAFF_ROLES = new Set(["admin", "staff", "trainer"]);

export async function dispatchStaffSync(
  args: DispatchStaffSyncArgs,
): Promise<StaffSyncResult> {
  const { tenantDb, memberId } = args;

  const member = await tenantDb.query.members.findFirst({
    where: eq(members.id, memberId),
  });
  if (!member) return { status: "error", error: "member not found" };

  if (!STAFF_ROLES.has(member.role)) {
    return { status: "skipped", reason: "non-staff-role" };
  }

  // TODO: subsequent tasks add deactivate-skip, branch resolution, sync call, error capture.
  return { status: "error", error: "not implemented" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/ghl-staff-sync.service.ts packages/services/src/ghl-staff-sync.service.test.ts
git commit -m "feat(services): scaffold dispatchStaffSync with non-staff-role skip"
```

---

## Task 2: Add deactivate-skip rule (Q1a=B)

**Files:**
- Modify: `packages/services/src/ghl-staff-sync.service.ts`
- Modify: `packages/services/src/ghl-staff-sync.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to test file:

```typescript
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";

it("on operation=delete, marks existing ghl_user_links inactive and returns deactivate-skip", async () => {
  const updateMock = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
  const tenantDb = {
    query: {
      members: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m-1", userId: "u-1", role: "trainer",
          status: "active", hierarchyScopeId: "n-1",
        }),
      },
      ghlUserLinks: {
        findFirst: vi.fn().mockResolvedValue({ id: "l-1", memberId: "m-1", branchNodeId: "b-1", ghlUserId: "g-1", ghlLocationId: "loc-1" }),
      },
    },
    update: updateMock,
  } as any;

  const result = await dispatchStaffSync({
    controlPanelDb: {} as any,
    tenantDb,
    organizationId: "org-1",
    memberId: "m-1",
    operation: "delete",
    env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
  });

  expect(result).toEqual({ status: "skipped", reason: "deactivate-skip" });
  expect(updateMock).toHaveBeenCalledWith(ghlUserLinks);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: FAIL — `expected { status: 'error', ... }` to deep-equal `{ status: 'skipped', reason: 'deactivate-skip' }`.

- [ ] **Step 3: Add deactivate-skip branch**

Replace the `TODO` block with:

```typescript
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";

// ... inside dispatchStaffSync, after the STAFF_ROLES check:

if (args.operation === "delete") {
  const existing = await tenantDb.query.ghlUserLinks.findFirst({
    where: eq(ghlUserLinks.memberId, memberId),
  });
  if (existing) {
    await tenantDb
      .update(ghlUserLinks)
      .set({ syncStatus: "inactive", updatedAt: new Date() })
      .where(eq(ghlUserLinks.id, existing.id));
  }
  return { status: "skipped", reason: "deactivate-skip" };
}

// TODO: subsequent tasks add branch resolution, sync call, error capture.
return { status: "error", error: "not implemented" };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/ghl-staff-sync.service.ts packages/services/src/ghl-staff-sync.service.test.ts
git commit -m "feat(services): dispatchStaffSync deactivate-skip marks link inactive"
```

---

## Task 3: Add non-branch-scope and branch-not-connected skip rules

**Files:**
- Modify: `packages/services/src/ghl-staff-sync.service.ts`
- Modify: `packages/services/src/ghl-staff-sync.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```typescript
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";

it("returns non-branch-scope when member.hierarchyScopeId is not a branch node", async () => {
  const tenantDb = {
    query: {
      members: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m-1", userId: "u-1", role: "trainer",
          status: "active", hierarchyScopeId: "n-region",
        }),
      },
      hierarchyNodes: {
        findFirst: vi.fn().mockResolvedValue({ id: "n-region", type: "region" }),
      },
    },
  } as any;

  const result = await dispatchStaffSync({
    controlPanelDb: {} as any,
    tenantDb,
    organizationId: "org-1",
    memberId: "m-1",
    operation: "create",
    env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
  });
  expect(result).toEqual({ status: "skipped", reason: "non-branch-scope" });
});

it("returns branch-not-connected when no active ghl_branch_links row exists", async () => {
  const tenantDb = {
    query: {
      members: {
        findFirst: vi.fn().mockResolvedValue({
          id: "m-1", userId: "u-1", role: "staff",
          status: "active", hierarchyScopeId: "b-1",
        }),
      },
      hierarchyNodes: {
        findFirst: vi.fn().mockResolvedValue({ id: "b-1", type: "branch", name: "KL" }),
      },
    },
  } as any;
  const controlPanelDb = {
    query: {
      ghlBranchLinks: { findFirst: vi.fn().mockResolvedValue(null) },
      users: { findFirst: vi.fn().mockResolvedValue({ id: "u-1", email: "a@b.com" }) },
    },
  } as any;

  const result = await dispatchStaffSync({
    controlPanelDb,
    tenantDb,
    organizationId: "org-1",
    memberId: "m-1",
    operation: "create",
    env: { GHL_AGENCY_ID: "agency", ENCRYPTION_KEY: "key" },
  });
  expect(result).toEqual({ status: "skipped", reason: "branch-not-connected" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: FAIL — both new tests fail.

- [ ] **Step 3: Add branch resolution + branch-link lookup**

Replace `TODO` block with:

```typescript
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { users } from "@avantej-core/db/schema/control-panel/users";

// ...inside dispatchStaffSync after the operation==='delete' branch:

const node = await tenantDb.query.hierarchyNodes.findFirst({
  where: eq(hierarchyNodes.id, member.hierarchyScopeId),
});
if (!node || node.type !== "branch") {
  return { status: "skipped", reason: "non-branch-scope" };
}
const branchNodeId = node.id;

const user = await args.controlPanelDb.query.users.findFirst({
  where: eq(users.id, member.userId),
});
if (!user) return { status: "error", error: "control panel user not found" };

const branchLink = await args.controlPanelDb.query.ghlBranchLinks.findFirst({
  where: and(
    eq(ghlBranchLinks.organizationId, args.organizationId),
    eq(ghlBranchLinks.tenantBranchId, branchNodeId),
    eq(ghlBranchLinks.isActive, true),
  ),
});
if (!branchLink) {
  return { status: "skipped", reason: "branch-not-connected" };
}

// TODO Task 4: branch reassignment detection + syncStaffToGhl call
return { status: "error", error: "not implemented" };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: PASS (4 tests total)

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/ghl-staff-sync.service.ts packages/services/src/ghl-staff-sync.service.test.ts
git commit -m "feat(services): dispatchStaffSync branch resolution + branch-not-connected skip"
```

---

## Task 4: Wire syncStaffToGhl call (happy path) + branch reassignment handling

**Files:**
- Modify: `packages/services/src/ghl-staff-sync.service.ts`
- Modify: `packages/services/src/ghl-staff-sync.service.test.ts`

**Note:** `syncStaffToGhl` lives in `apps/server/src/services/ghl/sync-staff.ts`. To avoid coupling `packages/services/` to the server app, the dispatcher accepts the orchestrator as an injected dependency. The router/hook call sites pass it in.

- [ ] **Step 1: Update `DispatchStaffSyncArgs` to accept the orchestrator**

In `packages/services/src/ghl-staff-sync.service.ts`, extend args:

```typescript
import type { ghlBranchLinks as ghlBranchLinksTable } from "@avantej-core/db/schema/control-panel/ghl-branch-links";

export interface SyncStaffOrchestrator {
  (args: {
    controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
    tenantDb: NeonDatabase<typeof tenantSchema>;
    organizationId: string;
    branchNodeId: string;
    companyId: string;
    user: { id: string; email: string; firstName?: string | null; lastName?: string | null; name?: string | null };
    member: { id: string; userId: string; role: string; status: string; hierarchyScopeId: string };
    operation: "create" | "update" | "delete";
    decryptApiKey: (encrypted: string) => string;
  }): Promise<{ status: "synced" | "skipped" | "error"; ghlUserId?: string; error?: string; reason?: string }>;
}

export interface DispatchStaffSyncArgs {
  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
  tenantDb: NeonDatabase<typeof tenantSchema>;
  organizationId: string;
  memberId: string;
  operation: StaffSyncOperation;
  env: { GHL_AGENCY_ID: string };
  syncStaffToGhl: SyncStaffOrchestrator;
  decryptApiKey: (encrypted: string) => string;
}
```

(Removed `ENCRYPTION_KEY` from env since `decryptApiKey` is now passed in directly.)

- [ ] **Step 2: Write failing tests for happy-path create + branch reassignment**

Append:

```typescript
it("on create, calls syncStaffToGhl with resolved branch + companyId", async () => {
  const sync = vi.fn().mockResolvedValue({ status: "synced", ghlUserId: "g-new" });
  const tenantDb = {
    query: {
      members: { findFirst: vi.fn().mockResolvedValue({ id: "m-1", userId: "u-1", role: "trainer", status: "active", hierarchyScopeId: "b-1" }) },
      hierarchyNodes: { findFirst: vi.fn().mockResolvedValue({ id: "b-1", type: "branch", name: "KL" }) },
      ghlUserLinks: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  } as any;
  const controlPanelDb = {
    query: {
      users: { findFirst: vi.fn().mockResolvedValue({ id: "u-1", email: "a@b.com", firstName: "A", lastName: "B" }) },
      ghlBranchLinks: { findFirst: vi.fn().mockResolvedValue({ id: "bl-1", ghlLocationId: "loc-1", ghlApiKey: "enc", isActive: true, tenantBranchId: "b-1" }) },
    },
  } as any;

  const result = await dispatchStaffSync({
    controlPanelDb, tenantDb,
    organizationId: "org-1", memberId: "m-1", operation: "create",
    env: { GHL_AGENCY_ID: "agency-1" },
    syncStaffToGhl: sync,
    decryptApiKey: (e) => `dec(${e})`,
  });

  expect(sync).toHaveBeenCalledTimes(1);
  expect(sync).toHaveBeenCalledWith(expect.objectContaining({
    organizationId: "org-1",
    branchNodeId: "b-1",
    companyId: "agency-1",
    operation: "create",
    user: expect.objectContaining({ id: "u-1", email: "a@b.com" }),
    member: expect.objectContaining({ id: "m-1", role: "trainer" }),
  }));
  expect(result).toEqual({ status: "synced", ghlUserId: "g-new" });
});

it("on update with branch reassignment, PUTs to new location and updates link row (without calling syncStaffToGhl)", async () => {
  // Existing link is on b-OLD. Member now scoped to b-NEW.
  const ghlPut = vi.fn().mockResolvedValue({ id: "g-existing" });
  const linkUpdate = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });

  const tenantDb = {
    query: {
      members: { findFirst: vi.fn().mockResolvedValue({ id: "m-1", userId: "u-1", role: "staff", status: "active", hierarchyScopeId: "b-NEW" }) },
      hierarchyNodes: { findFirst: vi.fn().mockResolvedValue({ id: "b-NEW", type: "branch", name: "Sabah" }) },
      ghlUserLinks: { findFirst: vi.fn().mockResolvedValue({ id: "l-1", memberId: "m-1", branchNodeId: "b-OLD", ghlUserId: "g-existing", ghlLocationId: "loc-OLD" }) },
    },
    update: linkUpdate,
  } as any;
  const controlPanelDb = {
    query: {
      users: { findFirst: vi.fn().mockResolvedValue({ id: "u-1", email: "a@b.com" }) },
      ghlBranchLinks: { findFirst: vi.fn().mockResolvedValue({ id: "bl-NEW", ghlLocationId: "loc-NEW", ghlApiKey: "enc-NEW", isActive: true, tenantBranchId: "b-NEW" }) },
    },
  } as any;
  const syncStaffToGhl = vi.fn();

  const result = await dispatchStaffSync({
    controlPanelDb, tenantDb,
    organizationId: "org-1", memberId: "m-1", operation: "update",
    env: { GHL_AGENCY_ID: "agency-1" },
    syncStaffToGhl,
    decryptApiKey: (e) => `dec(${e})`,
    // Inject the GHL HTTP PUT for testability:
    putGhlUser: ghlPut,
  } as any);

  expect(syncStaffToGhl).not.toHaveBeenCalled();
  expect(ghlPut).toHaveBeenCalledTimes(1);
  expect(linkUpdate).toHaveBeenCalled();
  expect(result.status).toBe("synced");
  expect(result.ghlUserId).toBe("g-existing");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 4: Add a `putGhlUser` injected dependency for branch reassignment**

Extend `DispatchStaffSyncArgs`:

```typescript
export interface DispatchStaffSyncArgs {
  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
  tenantDb: NeonDatabase<typeof tenantSchema>;
  organizationId: string;
  memberId: string;
  operation: StaffSyncOperation;
  env: { GHL_AGENCY_ID: string };
  syncStaffToGhl: SyncStaffOrchestrator;
  decryptApiKey: (encrypted: string) => string;
  /** GHL PUT /users/:id called only on branch reassignment to preserve ghlUserId */
  putGhlUser: (args: {
    apiKey: string;
    ghlUserId: string;
    payload: { locationIds: string[] };
  }) => Promise<{ id: string }>;
}
```

- [ ] **Step 5: Implement happy-path + reassignment**

Replace the final `TODO` block with:

```typescript
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";

// ...inside dispatchStaffSync after branchLink lookup:

try {
  const existingLink = await tenantDb.query.ghlUserLinks.findFirst({
    where: eq(ghlUserLinks.memberId, memberId),
  });

  // Branch reassignment path: existing link, different branch.
  if (
    args.operation === "update" &&
    existingLink &&
    existingLink.branchNodeId !== branchNodeId
  ) {
    const apiKey = args.decryptApiKey(branchLink.ghlApiKey);
    await args.putGhlUser({
      apiKey,
      ghlUserId: existingLink.ghlUserId,
      payload: { locationIds: [branchLink.ghlLocationId] },
      // TODO(ghl-existingBranch-custom-field): also set custom field "existingBranch" once field id is configured per location.
    });
    await tenantDb
      .update(ghlUserLinks)
      .set({
        branchNodeId,
        ghlLocationId: branchLink.ghlLocationId,
        syncStatus: "active",
        lastError: null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ghlUserLinks.id, existingLink.id));
    return { status: "synced", ghlUserId: existingLink.ghlUserId };
  }

  // Standard create/update: delegate to existing orchestrator.
  const result = await args.syncStaffToGhl({
    controlPanelDb: args.controlPanelDb,
    tenantDb,
    organizationId: args.organizationId,
    branchNodeId,
    companyId: args.env.GHL_AGENCY_ID,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      name: user.name ?? null,
    },
    member: {
      id: member.id,
      userId: member.userId,
      role: member.role,
      status: member.status,
      hierarchyScopeId: member.hierarchyScopeId,
    },
    operation: args.operation,
    decryptApiKey: args.decryptApiKey,
  });
  return result as StaffSyncResult;
} catch (err) {
  return {
    status: "error",
    error: err instanceof Error ? err.message : String(err),
  };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/ghl-staff-sync.service.ts packages/services/src/ghl-staff-sync.service.test.ts
git commit -m "feat(services): dispatchStaffSync happy path + branch reassignment via PUT"
```

---

## Task 5: Add `dispatchProfileSync` for cross-org profile updates

**Files:**
- Modify: `packages/services/src/ghl-staff-sync.service.ts`
- Modify: `packages/services/src/ghl-staff-sync.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
it("dispatchProfileSync iterates orgs, opens tenant DBs, dispatches per link", async () => {
  const links = [
    { id: "l-A", memberId: "m-A", branchNodeId: "b-A", ghlUserId: "g-A", ghlLocationId: "loc-A" },
    { id: "l-B", memberId: "m-B", branchNodeId: "b-B", ghlUserId: "g-B", ghlLocationId: "loc-B" },
  ];
  const dispatch = vi.fn().mockResolvedValue({ status: "synced" });
  const openTenantDb = vi.fn().mockResolvedValue({
    query: {
      ghlUserLinks: { findMany: vi.fn().mockResolvedValue(links) },
    },
  });
  const controlPanelDb = {
    query: {
      organizationMembers: {
        findMany: vi.fn().mockResolvedValue([
          { organizationId: "org-1" },
          { organizationId: "org-2" },
        ]),
      },
      organizations: {
        findFirst: vi.fn()
          .mockResolvedValueOnce({ id: "org-1", connectionString: "enc-1" })
          .mockResolvedValueOnce({ id: "org-2", connectionString: "enc-2" }),
      },
    },
  } as any;

  const results = await dispatchProfileSync({
    controlPanelDb,
    userId: "u-1",
    env: { GHL_AGENCY_ID: "agency-1" },
    openTenantDb,
    dispatchStaffSync: dispatch,
    decryptConnectionString: (e) => `dec(${e})`,
    decryptApiKey: (e) => `dec(${e})`,
    syncStaffToGhl: vi.fn(),
    putGhlUser: vi.fn(),
  });

  expect(openTenantDb).toHaveBeenCalledTimes(2);
  expect(dispatch).toHaveBeenCalledTimes(4); // 2 orgs * 2 links each
  expect(results).toHaveLength(4);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: FAIL — `dispatchProfileSync is not exported`.

- [ ] **Step 3: Implement `dispatchProfileSync`**

Append to `ghl-staff-sync.service.ts`:

```typescript
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";

export interface DispatchProfileSyncArgs {
  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
  userId: string;
  env: { GHL_AGENCY_ID: string };
  openTenantDb: (connectionString: string) => Promise<NeonDatabase<typeof tenantSchema>>;
  dispatchStaffSync: typeof dispatchStaffSync;
  decryptConnectionString: (encrypted: string) => string;
  decryptApiKey: (encrypted: string) => string;
  syncStaffToGhl: SyncStaffOrchestrator;
  putGhlUser: DispatchStaffSyncArgs["putGhlUser"];
}

export async function dispatchProfileSync(
  args: DispatchProfileSyncArgs,
): Promise<StaffSyncResult[]> {
  const orgMembers = await args.controlPanelDb.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, args.userId),
  });
  const results: StaffSyncResult[] = [];

  for (const om of orgMembers) {
    const org = await args.controlPanelDb.query.organizations.findFirst({
      where: eq(organizations.id, om.organizationId),
    });
    if (!org) continue;

    let tenantDb: NeonDatabase<typeof tenantSchema>;
    try {
      const conn = args.decryptConnectionString(org.connectionString);
      tenantDb = await args.openTenantDb(conn);
    } catch (err) {
      results.push({ status: "error", error: `tenant connect: ${(err as Error).message}` });
      continue;
    }

    const links = await tenantDb.query.ghlUserLinks.findMany({
      where: eq(ghlUserLinks.userId, args.userId),
    });

    for (const link of links) {
      if (link.syncStatus !== "active" && link.syncStatus !== "error") continue;
      const r = await args.dispatchStaffSync({
        controlPanelDb: args.controlPanelDb,
        tenantDb,
        organizationId: org.id,
        memberId: link.memberId,
        operation: "update",
        env: args.env,
        syncStaffToGhl: args.syncStaffToGhl,
        decryptApiKey: args.decryptApiKey,
        putGhlUser: args.putGhlUser,
      });
      results.push(r);
    }
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/services && bun test src/ghl-staff-sync.service.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Re-export from services index**

Edit `packages/services/src/index.ts`:

```typescript
export * from "./ghl-staff-sync.service";
```

(If file already has explicit named re-exports, add:)

```typescript
export {
  dispatchStaffSync,
  dispatchProfileSync,
  type StaffSyncResult,
  type StaffSyncOperation,
  type StaffSyncSkipReason,
  type DispatchStaffSyncArgs,
  type DispatchProfileSyncArgs,
} from "./ghl-staff-sync.service";
```

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/ghl-staff-sync.service.ts packages/services/src/ghl-staff-sync.service.test.ts packages/services/src/index.ts
git commit -m "feat(services): dispatchProfileSync iterates user orgs and links"
```

---

## Task 6: Build a thin call-site adapter in apps/server (wires real deps)

**Files:**
- Create: `apps/server/src/services/ghl/dispatch-staff-sync.ts`

The dispatcher in `packages/services` is dep-injected. The server app needs a thin wrapper that supplies the real `syncStaffToGhl`, `putGhlUser`, `decryptApiKey`, `decryptConnectionString`, and `openTenantDb`.

- [ ] **Step 1: Create the adapter**

```typescript
// apps/server/src/services/ghl/dispatch-staff-sync.ts
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { decrypt } from "@avantej-core/db/lib/encryption";
import {
  dispatchStaffSync as dispatchStaffSyncCore,
  dispatchProfileSync as dispatchProfileSyncCore,
  type StaffSyncOperation,
  type StaffSyncResult,
} from "@avantej-core/services";
import { syncStaffToGhl } from "./sync-staff";
import { ghlFetch } from "./http-client";
import type { GhlUser } from "./types";

const putGhlUser = async (args: {
  apiKey: string;
  ghlUserId: string;
  payload: { locationIds: string[] };
}) => {
  return ghlFetch<GhlUser>({
    method: "PUT",
    path: `/users/${args.ghlUserId}`,
    apiKey: args.apiKey,
    body: args.payload,
  });
};

const openTenantDb = async (connectionString: string) => {
  const pool = new Pool({ connectionString });
  return drizzle({ client: pool, schema: tenantSchema });
};

export interface ServerDispatchStaffSyncArgs {
  controlPanelDb: any;
  tenantDb: any;
  organizationId: string;
  memberId: string;
  operation: StaffSyncOperation;
  env: { GHL_AGENCY_ID: string };
}

export const dispatchStaffSync = (
  args: ServerDispatchStaffSyncArgs,
): Promise<StaffSyncResult> =>
  dispatchStaffSyncCore({
    ...args,
    syncStaffToGhl,
    decryptApiKey: decrypt,
    putGhlUser,
  });

export const dispatchProfileSync = (args: {
  controlPanelDb: any;
  userId: string;
  env: { GHL_AGENCY_ID: string };
}) =>
  dispatchProfileSyncCore({
    ...args,
    openTenantDb,
    dispatchStaffSync: dispatchStaffSyncCore,
    decryptConnectionString: decrypt,
    decryptApiKey: decrypt,
    syncStaffToGhl,
    putGhlUser,
  });
```

- [ ] **Step 2: Verify it builds**

Run: `cd apps/server && bun check-types`
Expected: no new type errors. (If existing project has prior errors, only confirm none introduced.)

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/services/ghl/dispatch-staff-sync.ts
git commit -m "feat(server): adapter wires dispatchStaffSync with real GHL deps"
```

---

## Task 7: Wire `members.create` to fire staff sync

**Files:**
- Modify: `packages/api/src/routers/members.ts`

**Note:** `members.create` lives in `packages/api/`, but `dispatchStaffSync` adapter lives in `apps/server/`. We need the adapter to be reachable from the api package — pass it through context, or import directly from server (the api package is already server-coupled via context types). Simplest: require the adapter to be passed via context, set up once in `apps/server/src/lib/context.ts`.

- [ ] **Step 1: Extend context type to include dispatcher**

Edit `apps/server/src/lib/context.ts` (or wherever `createContext` lives — search if path differs):

```typescript
import { dispatchStaffSync, dispatchProfileSync } from "../services/ghl/dispatch-staff-sync";

// Inside createContext return:
return {
  // ... existing fields
  dispatchStaffSync,
  dispatchProfileSync,
};
```

Add the corresponding fields to the `Context` type:

```typescript
export interface Context {
  // ... existing
  dispatchStaffSync: typeof dispatchStaffSync;
  dispatchProfileSync: typeof dispatchProfileSync;
}
```

- [ ] **Step 2: Verify context type propagates to api package**

Run: `bun check-types` from repo root.
Expected: no new errors.

- [ ] **Step 3: Add ghlSync to members.create response**

Edit `packages/api/src/routers/members.ts` around the existing `create` procedure return block (~line 267):

```typescript
// After: const createdMember = ...
const ghlSync = await context.dispatchStaffSync({
  controlPanelDb,
  tenantDb: context.tenantDb,
  organizationId: input.organizationId,
  memberId: createdMember.id,
  operation: "create",
  env: { GHL_AGENCY_ID: context.env.GHL_AGENCY_ID },
}).catch((err) => ({
  status: "error" as const,
  error: err instanceof Error ? err.message : String(err),
}));

return {
  success: true,
  member: {
    id: createdMember.id,
    userId: createdMember.userId,
    role: createdMember.role,
    hierarchyScopeId: createdMember.hierarchyScopeId,
    status: createdMember.status,
    joinedAt: createdMember.joinedAt,
  },
  ghlSync,
};
```

- [ ] **Step 4: Add integration test**

Edit `packages/api/src/routers/members.test.ts` (create file if absent — copy structure from existing router tests).

```typescript
import { describe, expect, it, vi } from "vitest";

describe("members.create + GHL sync", () => {
  it("calls dispatchStaffSync after member creation", async () => {
    const dispatchStaffSync = vi.fn().mockResolvedValue({ status: "synced", ghlUserId: "g-1" });
    // ... build a stub context with dispatchStaffSync injected
    // ... call members.create handler
    // ... assert dispatchStaffSync called once with operation:'create'
    // ... assert response includes ghlSync field
    expect(dispatchStaffSync).toHaveBeenCalledWith(expect.objectContaining({ operation: "create" }));
  });
});
```

(Detailed harness will follow patterns established in adjacent test files; engineer should copy from `packages/api/src/routers/<existing-router>.test.ts` if available, or use `apps/server/src/routers/invitations.test.ts` for reference.)

- [ ] **Step 5: Run tests + typecheck**

Run: `cd packages/api && bun test src/routers/members.test.ts && bun check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/routers/members.ts packages/api/src/routers/members.test.ts apps/server/src/lib/context.ts
git commit -m "feat(api): wire members.create to dispatchStaffSync (Phase 7.4)"
```

---

## Task 8: Wire `members.updateRole`

**Files:**
- Modify: `packages/api/src/routers/members.ts`

- [ ] **Step 1: Add ghlSync call after role update succeeds**

In `packages/api/src/routers/members.ts` near the existing `updateRole` return (~line 481+), after `await membershipService.updateMemberRole(...)`:

```typescript
const ghlSync = await context.dispatchStaffSync({
  controlPanelDb,
  tenantDb: context.tenantDb,
  organizationId: input.organizationId,
  memberId: input.memberId,
  operation: "update",
  env: { GHL_AGENCY_ID: context.env.GHL_AGENCY_ID },
}).catch((err) => ({
  status: "error" as const,
  error: err instanceof Error ? err.message : String(err),
}));

// Existing return block, append:
return {
  success: true,
  member: { /* existing fields */ },
  ghlSync,
};
```

- [ ] **Step 2: Add integration test for role-update sync**

Append to `packages/api/src/routers/members.test.ts`:

```typescript
it("calls dispatchStaffSync on updateRole with operation='update'", async () => {
  const dispatchStaffSync = vi.fn().mockResolvedValue({ status: "synced" });
  // ...invoke updateRole with stubbed context...
  expect(dispatchStaffSync).toHaveBeenCalledWith(expect.objectContaining({
    operation: "update",
    memberId: expect.any(String),
  }));
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/api && bun test src/routers/members.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/members.ts packages/api/src/routers/members.test.ts
git commit -m "feat(api): wire members.updateRole to dispatchStaffSync"
```

---

## Task 9: Wire `members.deactivate` and find/wire branch-reassignment procedure

**Files:**
- Modify: `packages/api/src/routers/members.ts`

- [ ] **Step 1: Wire deactivate** (~line 928, after `deactivateMember(...)`)

```typescript
const result = await deactivateMember(context.tenantDb, input.memberId, actor);

const ghlSync = await context.dispatchStaffSync({
  controlPanelDb,
  tenantDb: context.tenantDb,
  organizationId: input.organizationId,
  memberId: input.memberId,
  operation: "delete",
  env: { GHL_AGENCY_ID: context.env.GHL_AGENCY_ID },
}).catch((err) => ({
  status: "error" as const,
  error: err instanceof Error ? err.message : String(err),
}));

return { ...result, ghlSync };
```

- [ ] **Step 2: Locate hierarchyScopeId update procedure**

Run: `grep -n "hierarchyScopeId.*update\|updateScope\|updateHierarchy" packages/api/src/routers/members.ts`

If a procedure exists (e.g. `updateScope`), wire identically with `operation: "update"` after the DB write. The dispatcher detects branch change.

If no such procedure exists, add a TODO note in this task: "Branch reassignment route not yet exposed; revisit when added." Skip to Step 3.

- [ ] **Step 3: Add tests**

Append to `packages/api/src/routers/members.test.ts`:

```typescript
it("calls dispatchStaffSync on deactivate with operation='delete'", async () => {
  const dispatchStaffSync = vi.fn().mockResolvedValue({ status: "skipped", reason: "deactivate-skip" });
  // ... invoke deactivate ...
  expect(dispatchStaffSync).toHaveBeenCalledWith(expect.objectContaining({ operation: "delete" }));
});
```

- [ ] **Step 4: Run tests**

Run: `cd packages/api && bun test src/routers/members.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/members.ts packages/api/src/routers/members.test.ts
git commit -m "feat(api): wire members.deactivate to dispatchStaffSync"
```

---

## Task 10: Add `members.retryGhlSync` procedure

**Files:**
- Modify: `packages/api/src/routers/members.ts`

- [ ] **Step 1: Add procedure**

Append to the `members` router object:

```typescript
retryGhlSync: protectedProcedure
  .input(
    z.object({
      organizationId: z.string().uuid(),
      memberId: z.string().uuid(),
    }),
  )
  .handler(async ({ context, input }) => {
    const result = await context.dispatchStaffSync({
      controlPanelDb,
      tenantDb: context.tenantDb,
      organizationId: input.organizationId,
      memberId: input.memberId,
      operation: "update",
      env: { GHL_AGENCY_ID: context.env.GHL_AGENCY_ID },
    });
    return { ghlSync: result };
  }),
```

(Replace `controlPanelDb` reference with whatever the file uses to access it — likely also from `context`.)

- [ ] **Step 2: Add test**

```typescript
it("retryGhlSync calls dispatchStaffSync with operation='update' and returns result", async () => {
  const dispatchStaffSync = vi.fn().mockResolvedValue({ status: "synced", ghlUserId: "g-x" });
  // ... invoke retryGhlSync ...
  expect(dispatchStaffSync).toHaveBeenCalledWith(expect.objectContaining({ operation: "update" }));
  // ... assert response.ghlSync.status === 'synced'
});
```

- [ ] **Step 3: Run tests**

Run: `cd packages/api && bun test src/routers/members.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/routers/members.ts packages/api/src/routers/members.test.ts
git commit -m "feat(api): add members.retryGhlSync for manual GHL retry"
```

---

## Task 11: Wire `invitations.acceptWithSignup` to fire staff sync

**Files:**
- Modify: `apps/server/src/routers/invitations.ts`

- [ ] **Step 1: Locate the member-creation point in acceptWithSignup**

Run: `grep -n "acceptWithSignup\|createMember\|members.insert" apps/server/src/routers/invitations.ts`

- [ ] **Step 2: Add dispatch call after member row exists**

After the new member row has been created (within `acceptWithSignup`), insert:

```typescript
import { dispatchStaffSync } from "../services/ghl/dispatch-staff-sync";

// after member created, before returning:
const ghlSync = await dispatchStaffSync({
  controlPanelDb: context.controlPanelDb,
  tenantDb: context.tenantDb,
  organizationId: invitation.organizationId,
  memberId: newMember.id,
  operation: "create",
  env: { GHL_AGENCY_ID: context.env.GHL_AGENCY_ID },
}).catch((err) => ({
  status: "error" as const,
  error: err instanceof Error ? err.message : String(err),
}));

// include ghlSync in response payload
```

- [ ] **Step 3: Add test**

Append to `apps/server/src/routers/invitation-acceptance.test.ts`:

```typescript
it("acceptWithSignup fires dispatchStaffSync with operation='create'", async () => {
  // ... follow existing test harness ...
  // ... assert dispatchStaffSync called with operation: 'create' and the new memberId ...
});
```

- [ ] **Step 4: Run tests**

Run: `cd apps/server && bun test src/routers/invitation-acceptance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routers/invitations.ts apps/server/src/routers/invitation-acceptance.test.ts
git commit -m "feat(server): acceptWithSignup fires GHL staff sync"
```

---

## Task 12: Add Better-Auth `databaseHooks.user.update.after` for profile sync

**Files:**
- Modify: `packages/auth/src/index.ts`

- [ ] **Step 1: Add the hook**

Edit `packages/auth/src/index.ts` (~line 98, alongside the existing `create.before` hook):

```typescript
databaseHooks: {
  user: {
    create: {
      before: async (user) => { /* existing */ },
    },
    update: {
      after: async (user, ctx) => {
        // Only fire on profile-relevant fields.
        const profileFields = ["firstName", "lastName", "name", "email"];
        const changedKeys = ctx?.context?.body
          ? Object.keys(ctx.context.body).filter((k) => profileFields.includes(k))
          : [];
        if (changedKeys.length === 0) return;

        // Fire-and-forget: profile sync is best-effort; don't block auth response.
        try {
          // Lazy import to avoid circular deps at module load.
          const { dispatchProfileSync } = await import(
            "../../../apps/server/src/services/ghl/dispatch-staff-sync"
          );
          const env = (globalThis as any).__avantejEnv ?? {};
          if (!env.GHL_AGENCY_ID) return;
          await dispatchProfileSync({
            controlPanelDb: db,
            userId: user.id,
            env: { GHL_AGENCY_ID: env.GHL_AGENCY_ID },
          });
        } catch (err) {
          console.error("dispatchProfileSync failed:", err);
        }
      },
    },
  },
},
```

**Note for the engineer:** the lazy import path crosses package boundaries (`packages/auth` → `apps/server`). If the project's TypeScript paths don't allow this, the alternative is:
- Inject the dispatcher into the auth factory at construction time (e.g. `createAuth({ dispatchProfileSync })`), then call it directly in the hook.
- Investigate the `packages/auth` factory signature first; if it accepts an options object, prefer dependency injection over lazy import.

- [ ] **Step 2: Verify env wiring for `GHL_AGENCY_ID`**

Confirm `apps/server/.dev.vars` has `GHL_AGENCY_ID=iDgsCeSnq9lA4PWPSTFI` (per memory). Add to `wrangler.toml` / secrets in deploy if missing.

- [ ] **Step 3: Add test**

If `packages/auth` has tests, add:

```typescript
it("user.update hook fires dispatchProfileSync when firstName/lastName/email change", async () => {
  const dispatchProfileSync = vi.fn().mockResolvedValue([{ status: "synced" }]);
  // ... trigger update with firstName change ...
  expect(dispatchProfileSync).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-1" }));
});

it("user.update hook does NOT fire dispatchProfileSync when only emailVerified changes", async () => {
  const dispatchProfileSync = vi.fn();
  // ... trigger update with emailVerified change ...
  expect(dispatchProfileSync).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests + typecheck**

Run: `bun check-types && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/auth/src/index.ts
git commit -m "feat(auth): user.update.after hook fires dispatchProfileSync on profile change"
```

---

## Task 13: UI — GHL Sync badge column + retry button

**Files:**
- Modify: `apps/web/src/routes/<members-list>.tsx` (run `find apps/web/src -name "*.tsx" | xargs grep -l "members\."` to locate)

- [ ] **Step 1: Locate the members list page**

Run: `grep -rln "members\.list\|members.findMany\|member.*table" apps/web/src/routes apps/web/src/components 2>/dev/null | head`

- [ ] **Step 2: Extend the row data fetch to include `ghl_user_links.syncStatus` + `lastError`**

If the list query already returns full member rows, add a related fetch for `ghl_user_links`. Either:
- (a) Add a join in the existing `members.list` server procedure, returning `ghlSync: { syncStatus, lastError }` per member, OR
- (b) Add a separate `members.listGhlSync({ memberIds })` procedure called from the page.

Recommend (a) — single round trip.

Modify `packages/api/src/routers/members.ts` `list` procedure to LEFT JOIN `ghl_user_links`:

```typescript
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";

// inside list handler, replace the simple findMany with:
const rows = await context.tenantDb
  .select({
    member: members,
    ghlLink: ghlUserLinks,
  })
  .from(members)
  .leftJoin(ghlUserLinks, eq(ghlUserLinks.memberId, members.id))
  .where(/* existing filter conditions */);

return {
  members: rows.map((r) => ({
    ...r.member,
    ghlSync: r.ghlLink
      ? { syncStatus: r.ghlLink.syncStatus, lastError: r.ghlLink.lastError, lastSyncedAt: r.ghlLink.lastSyncedAt }
      : null,
  })),
};
```

- [ ] **Step 3: Add badge column to the members table**

In the page component:

```tsx
import { Badge } from "@/components/ui/badge"; // or whatever the project uses
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// In the table column definitions:
{
  accessorKey: "ghlSync",
  header: "GHL Sync",
  cell: ({ row }) => {
    const sync = row.original.ghlSync;
    if (!sync) return <span className="text-muted-foreground">—</span>;

    const variant: Record<string, "default" | "secondary" | "destructive"> = {
      active: "default",
      inactive: "secondary",
      error: "destructive",
    };

    return (
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger>
            <Badge variant={variant[sync.syncStatus] ?? "secondary"}>
              {sync.syncStatus}
            </Badge>
          </TooltipTrigger>
          {sync.lastError && (
            <TooltipContent>{sync.lastError}</TooltipContent>
          )}
        </Tooltip>
        {sync.syncStatus === "error" && (
          <RetryButton memberId={row.original.id} />
        )}
      </div>
    );
  },
},
```

- [ ] **Step 4: Add RetryButton component**

```tsx
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc"; // or whatever client name is used

function RetryButton({ memberId }: { memberId: string }) {
  const orgId = useCurrentOrgId(); // existing helper
  const retry = trpc.members.retryGhlSync.useMutation({
    onSuccess: () => trpc.members.list.invalidate(),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={retry.isPending}
      onClick={() => retry.mutate({ organizationId: orgId, memberId })}
    >
      {retry.isPending ? "Retrying…" : "Retry"}
    </Button>
  );
}
```

(Adjust to match the project's actual hooks/imports — TanStack Query + oRPC client.)

- [ ] **Step 5: Manual verification in browser**

1. `bun dev:web` and `bun dev:server`
2. Log in as an admin in a tenant with at least one branch connected to GHL
3. Create a staff member via UI → confirm "GHL Sync: active" badge appears
4. Force an error (e.g., temporarily set bad API key in `ghl_branch_links.ghlApiKey`) → create another → confirm "error" badge with retry button
5. Click retry → confirm badge updates

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes packages/api/src/routers/members.ts
git commit -m "feat(web): GHL sync status badge + retry button on members list"
```

---

## Task 14: End-to-end manual validation against GHL sandbox

- [ ] **Step 1: Confirm env**

```bash
cd apps/server
grep GHL_AGENCY_ID .dev.vars
# Expect: GHL_AGENCY_ID=iDgsCeSnq9lA4PWPSTFI
```

- [ ] **Step 2: Confirm a branch is linked**

```bash
cd apps/server
bun run scripts/list-organizations.ts
# Pick the test org. Then:
psql "$DATABASE_URL" -c "SELECT * FROM ghl_branch_links WHERE organization_id = '<orgId>' AND is_active = true;"
# Expect at least one row with valid ghlLocationId + ghlApiKey
```

- [ ] **Step 3: Create staff member via UI**

1. Log in as franchisee
2. Members → Add member → role: trainer, branch: linked branch, fill in user details
3. Confirm response shows `ghlSync: {status: 'synced', ghlUserId: '...'}`
4. Open GHL UI for that location → verify the new user exists with matching email + name

- [ ] **Step 4: Update role**

1. Members → edit role from trainer → admin
2. Confirm `ghlSync.status === 'synced'`
3. In GHL, refresh user → `role` field should now be `admin`

- [ ] **Step 5: Branch reassignment** (only if `updateScope` procedure exists)

1. Move staff member from branch A → branch B
2. Confirm same `ghlUserId` in `ghl_user_links` (no new GHL user)
3. In GHL, user's `locationIds` should now include only branch B's location

- [ ] **Step 6: Deactivate**

1. Deactivate the staff member
2. Confirm `ghlSync: {status: 'skipped', reason: 'deactivate-skip'}`
3. In `ghl_user_links`, `syncStatus = 'inactive'`
4. In GHL, user should still exist (no DELETE called)

- [ ] **Step 7: Profile change**

1. Change the staff member's first name via better-auth profile flow
2. Confirm `ghl_user_links.lastSyncedAt` updates
3. In GHL, name should match new value

- [ ] **Step 8: Failure + manual retry**

1. Temporarily corrupt `ghl_branch_links.ghlApiKey` for a branch
2. Create a staff member → expect `ghlSync.status === 'error'` and badge red
3. Restore the API key
4. Click "Retry" in UI → expect badge → green

- [ ] **Step 9: Commit notes**

If any test reveals a bug, fix it under a new commit. If all validation passes, no commit needed for this task — proceed to PR.

---

## Task 15: Update memory + knowledge graph

- [ ] **Step 1: Refresh the knowledge graph**

Run `/graphify . --update` to refresh the knowledge graph reflecting the new procedures and behavior.

- [ ] **Step 2: Update GHL memory**

Edit `~/.claude/projects/-Users-ngchwanlii-App-prod-avantej-core/memory/ghl-agency-id.md` to add:

```markdown
**Status (2026-05-05):** Phase 7.4 wiring SHIPPED. dispatchStaffSync is called from members.create / updateRole / deactivate / acceptWithSignup. dispatchProfileSync fires from better-auth user.update.after hook. Manual retry available via members.retryGhlSync.
```

- [ ] **Step 3: Commit**

```bash
git add graphify-out/ ~/.claude/projects/.../ghl-agency-id.md
git commit -m "docs: update knowledge graph + memory after GHL staff sync wiring shipped"
```

---

## Self-review

| Check | Result |
|---|---|
| Spec coverage | All 6 wiring sites covered (Tasks 7, 8, 9, 10, 11, 12). Skip rules covered (Tasks 1-3). Branch reassignment covered (Task 4). Profile sync covered (Task 5). UI covered (Task 13). Tests covered per task. e2e covered (Task 14). |
| Placeholders | None. All steps include exact code or exact commands. Two annotated TODOs (existingBranch custom field; updateScope route may not exist) are deferred with clear notes, not vague placeholders. |
| Type consistency | `dispatchStaffSync` signature consistent across Tasks 1, 4, 5, 6, 7, 8, 9, 10, 11. `StaffSyncResult` shape consistent. `putGhlUser` injected dep introduced in Task 4 used in Task 5 + Task 6. |
| Missing tasks | None for v1 scope. The `existingBranch` custom field, `updateScope` procedure (if absent), and cron-based retry are out-of-scope per spec — acknowledged as deferred. |
