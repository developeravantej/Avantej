# Phase 1 — Tenant Scope Switcher UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global scope switcher to the tenant dashboard so a user can pick a country/state/branch (or "All") and have Overview + Reports re-scope to it.

**Architecture:** A new `ScopeProvider` (mirrors the existing sidebar context pattern, backed by read-only `useUserContext`) owns a selectable `activeScopeId` — defaulted to the member's top accessible node, persisted per (user, org), validated against `accessibleNodeIds` on load. The dead sidebar org button becomes the switcher. Read pages inject `scopeBranchId` into their already-guarded oRPC queries; the switcher can only narrow within `accessibleNodeIds` (server guards landed in Phase 0).

**Tech Stack:** React + TanStack Router/Query, oRPC client, vitest + @testing-library/react (Node 22), Tailwind.

**Depends on:** Phase 0 scope-guard hardening (merged, PR #58). Builds on `main`.

---

## ScopeProvider API (reference — defined in Task 1, consumed by all later tasks)

API-SPEC:

`useScope` / `ScopeProvider` — tenant scope switcher context. Mirrors the `sidebar.tsx` pattern exactly: `React.createContext<T | null>(null)`, consumer hook via `React.use()` that throws, value wrapped in `React.useMemo`. Backed by `useUserContext()` (read-only) — the Provider owns the switch state because `useUserContext` exposes no setter.

File: `apps/web/src/components/scope/ScopeProvider.tsx`. Exports `ScopeProvider`, `useScope`, and the `ScopeContextValue` + `ScopeNode` types.

```ts
import type { UserContextResponse } from "@/hooks/useUserContext";

// Element of org.hierarchy.nodes (flat tree: id/name/type/depth/parentId/timestamps)
export type ScopeNode =
	UserContextResponse["organizations"][number]["hierarchy"]["nodes"][number];

export interface ScopeContextValue {
	/** Currently selected hierarchy node id. null until user context + a member
	 *  for the current org have loaded (or when there is no member). */
	activeScopeId: string | null;
	/** Resolved node object for activeScopeId from the current org's flat node
	 *  list; null if unresolved. */
	activeScopeNode: ScopeNode | null;
	/** Switch the active scope. NO-OP (dev-warns) if nodeId is not in
	 *  accessibleNodeIds — the switcher can only NARROW within RBAC. Persists to
	 *  localStorage under scope:${userId}:${organizationId}. */
	setActiveScope: (nodeId: string) => void;
	/** Reset to the default = caller's top accessible node (member.hierarchyScopeId). */
	resetScope: () => void;
	/** Caller's accessible node ids for the current org (member.accessibleNodeIds),
	 *  or [] when no member. Hard RBAC ceiling — switcher options are a subset. */
	accessibleNodeIds: string[];
	/** Selectable switcher options: org.hierarchy.nodes filtered to accessibleNodeIds,
	 *  depth-ordered. Length 1 → switcher should render a static label. */
	scopeNodes: ScopeNode[];
	/** The "All" node id = caller's top (shallowest/ancestor-of-all) accessible node
	 *  = member.hierarchyScopeId. null when no member. */
	topAccessibleNodeId: string | null;
	/** true when activeScopeId === topAccessibleNodeId (viewing whole accessible
	 *  subtree → Overview renders per-branch/"per-country" money cards). */
	isAllScope: boolean;
	/** EXACT value consumers inject as `branchId` on scope-aware oRPC inputs:
	 *  `undefined` when isAllScope (server falls back to full accessibleNodeIds),
	 *  else `activeScopeId`. Usage: `branchId: scopeBranchId`. */
	scopeBranchId: string | undefined;
	/** true once activeScopeId is resolved (user context loaded + member present). */
	isScopeReady: boolean;
}

export function useScope(): ScopeContextValue; // throws "useScope must be used within a ScopeProvider." if null
export function ScopeProvider(props: { children: React.ReactNode }): JSX.Element;
```

Setter signature: `setActiveScope(nodeId: string): void`. Security: rejects any `nodeId ∉ accessibleNodeIds` (narrow-only; server already guards via `guardBranchAccessible`).

Persistence + validation + org-reset behavior:
- Key `scope:${userId}:${organizationId}` (per user+org), distinct from the `useUserContext`-owned keys (`current_organization_id`, `user_organizations`, `org_${id}_hierarchy`) — ScopeProvider never writes those.
- On mount / whenever `(userId, organizationId, topAccessibleNodeId, accessibleNodeIds)` change: read stored value; use it IFF still ∈ `accessibleNodeIds`; otherwise fall back to `topAccessibleNodeId` (stale/deleted node → silent fallback). This effect is what implements org-reset: when `currentOrganizationId` changes the effect re-keys to the new org (reading that org's stored value or its own top node).
- `org` is resolved like `useUserContext` helpers: prefer `currentOrganizationId`, else `organizations[0]`.

Consumer injection (Phase 1, no provider changes): in `DashboardPage.tsx` (lines 44,50,56,62,68,74,93-98,105) and `ReportsPage.tsx` (lines 44,52,96), add `branchId: scopeBranchId`. `Overview` reads `isAllScope` to choose per-branch cards vs single-node KPI tiles. The 4 Reports series queries (`getMemberCountSeries`/`getChurnSeries`/`getLtvSeries`/`getClassFillRateSeries`) need their backend `seriesInput` extended with `branchId` first (`analytics.ts:103`) — out of scope for these two tasks.

---

## ⚠️ Backend prerequisite for the Reports task (Task 7)

The 4 Reports series procedures (`getMemberCountSeries` / `getChurnSeries` / `getLtvSeries` / `getClassFillRateSeries`) do **not** yet accept a `branchId`/scope param — their `seriesInput` at `packages/api/src/routers/analytics.ts:103` must be extended (and the service threaded with `accessibleNodeIds`, mirroring the Phase 0 guarded analytics procedures) **before** Task 7 can inject `scopeBranchId`. Treat that backend extension as Task 7's first sub-step (or a small precursor task). Overview (Tasks 5–6) needs no backend change — its queries already accept a branch/scope param (confirmed in mapping).

---

### Task 1: ScopeProvider + useScope context — apps/web/src/components/scope/ScopeProvider.tsx
**Files:**
- Create: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/components/scope/ScopeProvider.tsx`
- Test: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/__tests__/components/scope/ScopeProvider.test.tsx`

- [ ] **Step 1: failing test** (full code)

```tsx
// apps/web/src/__tests__/components/scope/ScopeProvider.test.tsx
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock useUserContext (the ScopeProvider's only data dependency) before SUT import.
const { mockUseUserContext } = vi.hoisted(() => ({
	mockUseUserContext: vi.fn(),
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: mockUseUserContext,
}));

import { ScopeProvider, useScope } from "@/components/scope/ScopeProvider";
import type { UserContextResponse } from "@/hooks/useUserContext";

const USER_ID = "user-1";
const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

function makeContext(
	overrides?: Partial<UserContextResponse>,
): UserContextResponse {
	return {
		user: {
			id: USER_ID,
			email: "e@test.my",
			name: "n",
			firstName: "f",
			lastName: "l",
			emailVerified: true,
		},
		isSystemAdmin: false,
		organizations: [
			{
				id: ORG_A,
				name: "Org A",
				slug: "org-a",
				role: "manager",
				permissions: [],
				hierarchy: {
					nodes: [
						{ id: "node-root", name: "Region", type: "region", depth: 0, parentId: null, createdAt: null, updatedAt: null },
						{ id: "node-branch-1", name: "Branch 1", type: "branch", depth: 1, parentId: "node-root", createdAt: null, updatedAt: null },
						{ id: "node-branch-2", name: "Branch 2", type: "branch", depth: 1, parentId: "node-root", createdAt: null, updatedAt: null },
						{ id: "node-other", name: "No Access", type: "branch", depth: 1, parentId: "node-root", createdAt: null, updatedAt: null },
					],
					member: {
						id: "member-a",
						role: "manager",
						hierarchyScopeId: "node-root",
						hierarchyScopeName: "Region",
						accessibleNodeIds: ["node-root", "node-branch-1", "node-branch-2"],
					},
				},
			},
		],
		currentOrganizationId: ORG_A,
		...overrides,
	};
}

function makeTwoOrgContext(currentOrganizationId: string): UserContextResponse {
	const base = makeContext();
	const orgA = base.organizations[0];
	const orgB: UserContextResponse["organizations"][number] = {
		...orgA,
		id: ORG_B,
		name: "Org B",
		slug: "org-b",
		hierarchy: {
			nodes: [
				{ id: "b-root", name: "B Region", type: "region", depth: 0, parentId: null, createdAt: null, updatedAt: null },
				{ id: "b-branch", name: "B Branch", type: "branch", depth: 1, parentId: "b-root", createdAt: null, updatedAt: null },
			],
			member: {
				id: "member-b",
				role: "manager",
				hierarchyScopeId: "b-root",
				hierarchyScopeName: "B Region",
				accessibleNodeIds: ["b-root", "b-branch"],
			},
		},
	};
	return { ...base, organizations: [orgA, orgB], currentOrganizationId };
}

function setContext(ctx: UserContextResponse | undefined) {
	mockUseUserContext.mockReturnValue({ data: ctx });
}

function wrapper({ children }: { children: React.ReactNode }) {
	return <ScopeProvider>{children}</ScopeProvider>;
}

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	setContext(makeContext());
});

describe("ScopeProvider — default scope", () => {
	it("defaults activeScopeId to the caller's top accessible node (member.hierarchyScopeId)", async () => {
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		expect(result.current.topAccessibleNodeId).toBe("node-root");
		expect(result.current.isAllScope).toBe(true);
		expect(result.current.scopeBranchId).toBeUndefined();
		expect(result.current.activeScopeNode?.id).toBe("node-root");
		expect(result.current.isScopeReady).toBe(true);
	});

	it("exposes only accessible nodes as scopeNodes (excludes nodes outside accessibleNodeIds)", async () => {
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		const ids = result.current.scopeNodes.map((n) => n.id);
		expect(ids).toEqual(["node-root", "node-branch-1", "node-branch-2"]);
		expect(ids).not.toContain("node-other");
	});
});

describe("ScopeProvider — persistence + validation", () => {
	it("restores a persisted scope when it is still within accessibleNodeIds", async () => {
		localStorage.setItem(`scope:${USER_ID}:${ORG_A}`, "node-branch-1");
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-branch-1"));
		expect(result.current.isAllScope).toBe(false);
		expect(result.current.scopeBranchId).toBe("node-branch-1");
	});

	it("falls back to the top accessible node when the persisted scope is stale/inaccessible", async () => {
		localStorage.setItem(`scope:${USER_ID}:${ORG_A}`, "node-deleted");
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		expect(result.current.isAllScope).toBe(true);
	});
});

describe("ScopeProvider — setActiveScope", () => {
	it("updates state, persists per (userId, organizationId), and narrows scopeBranchId", async () => {
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		act(() => result.current.setActiveScope("node-branch-2"));
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-branch-2"));
		expect(result.current.scopeBranchId).toBe("node-branch-2");
		expect(result.current.isAllScope).toBe(false);
		expect(localStorage.getItem(`scope:${USER_ID}:${ORG_A}`)).toBe("node-branch-2");
	});

	it("ignores setActiveScope for a node outside accessibleNodeIds (switcher can only NARROW)", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		act(() => result.current.setActiveScope("node-other"));
		expect(result.current.activeScopeId).toBe("node-root");
		expect(localStorage.getItem(`scope:${USER_ID}:${ORG_A}`)).toBeNull();
		warn.mockRestore();
	});
});

describe("ScopeProvider — org switch reset", () => {
	it("resets the active scope when the current organization switches", async () => {
		setContext(makeTwoOrgContext(ORG_A));
		const { result, rerender } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-root"));
		act(() => result.current.setActiveScope("node-branch-1"));
		await waitFor(() => expect(result.current.activeScopeId).toBe("node-branch-1"));

		setContext(makeTwoOrgContext(ORG_B));
		rerender();

		await waitFor(() => expect(result.current.activeScopeId).toBe("b-root"));
		expect(result.current.topAccessibleNodeId).toBe("b-root");
		expect(result.current.isAllScope).toBe(true);
	});
});

describe("ScopeProvider — unloaded context", () => {
	it("yields a null/empty scope when user context has not loaded", async () => {
		setContext(undefined);
		const { result } = renderHook(() => useScope(), { wrapper });
		await waitFor(() => expect(result.current.isScopeReady).toBe(false));
		expect(result.current.activeScopeId).toBeNull();
		expect(result.current.accessibleNodeIds).toEqual([]);
		expect(result.current.scopeBranchId).toBeUndefined();
		expect(result.current.scopeNodes).toEqual([]);
	});
});

describe("useScope — guard", () => {
	it("throws when used outside a ScopeProvider", () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderHook(() => useScope())).toThrow(
			"useScope must be used within a ScopeProvider.",
		);
		err.mockRestore();
	});
});
```

- [ ] **Step 2: run, verify FAIL**

```
cd apps/web && bunx vitest run src/__tests__/components/scope/ScopeProvider.test.tsx
```
Reason: fails at import — module `@/components/scope/ScopeProvider` does not exist yet (`Cannot find module`), so every test errors.

- [ ] **Step 3: implement** (full file)

```tsx
// apps/web/src/components/scope/ScopeProvider.tsx
import * as React from "react";
import {
	useUserContext,
	type UserContextResponse,
} from "@/hooks/useUserContext";

/** Element of org.hierarchy.nodes — the flat hierarchy tree (parentId/depth shape). */
export type ScopeNode =
	UserContextResponse["organizations"][number]["hierarchy"]["nodes"][number];

export interface ScopeContextValue {
	activeScopeId: string | null;
	activeScopeNode: ScopeNode | null;
	setActiveScope: (nodeId: string) => void;
	resetScope: () => void;
	accessibleNodeIds: string[];
	scopeNodes: ScopeNode[];
	topAccessibleNodeId: string | null;
	isAllScope: boolean;
	scopeBranchId: string | undefined;
	isScopeReady: boolean;
}

const ScopeContext = React.createContext<ScopeContextValue | null>(null);

function scopeStorageKey(userId: string, organizationId: string): string {
	return `scope:${userId}:${organizationId}`;
}

function readStoredScope(
	userId: string,
	organizationId: string,
): string | null {
	try {
		return localStorage.getItem(scopeStorageKey(userId, organizationId));
	} catch {
		return null;
	}
}

function writeStoredScope(
	userId: string,
	organizationId: string,
	nodeId: string,
): void {
	try {
		localStorage.setItem(scopeStorageKey(userId, organizationId), nodeId);
	} catch {
		// ignore quota / private-mode failures
	}
}

export function useScope(): ScopeContextValue {
	const context = React.use(ScopeContext);
	if (!context) {
		throw new Error("useScope must be used within a ScopeProvider.");
	}
	return context;
}

export function ScopeProvider({ children }: { children: React.ReactNode }) {
	const { data: userContext } = useUserContext();

	const userId = userContext?.user.id ?? null;
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Resolve current org the same way useUserContext helpers do:
	// prefer currentOrganizationId, else organizations[0].
	const org = React.useMemo(() => {
		if (!userContext) return null;
		const id = userContext.currentOrganizationId;
		return (
			(id
				? userContext.organizations.find((o) => o.id === id)
				: userContext.organizations[0]) ?? null
		);
	}, [userContext]);

	const member = org?.hierarchy.member ?? null;

	const accessibleNodeIds = React.useMemo<string[]>(
		() => member?.accessibleNodeIds ?? [],
		[member],
	);

	// "All" = the caller's top accessible node = member.hierarchyScopeId.
	const topAccessibleNodeId = member?.hierarchyScopeId ?? null;

	// Switcher options: org nodes within accessibleNodeIds, depth-ordered.
	const scopeNodes = React.useMemo<ScopeNode[]>(() => {
		if (!org) return [];
		const allowed = new Set(accessibleNodeIds);
		return org.hierarchy.nodes
			.filter((n) => allowed.has(n.id))
			.sort((a, b) => a.depth - b.depth);
	}, [org, accessibleNodeIds]);

	const [activeScopeId, setActiveScopeId] = React.useState<string | null>(null);

	// Default + validation + org-reset: re-key on (user, org, RBAC). A persisted
	// scope wins only if still accessible; otherwise fall back to the top node.
	React.useEffect(() => {
		if (!userId || !organizationId || !topAccessibleNodeId) {
			setActiveScopeId(null);
			return;
		}
		const stored = readStoredScope(userId, organizationId);
		const valid = stored != null && accessibleNodeIds.includes(stored);
		setActiveScopeId(valid ? stored : topAccessibleNodeId);
	}, [userId, organizationId, topAccessibleNodeId, accessibleNodeIds]);

	const setActiveScope = React.useCallback(
		(nodeId: string) => {
			if (!userId || !organizationId) return;
			// Security: the switcher can only NARROW within accessibleNodeIds.
			if (!accessibleNodeIds.includes(nodeId)) {
				if (import.meta.env.DEV) {
					console.warn(
						`[ScopeProvider] Ignoring setActiveScope("${nodeId}") — not within accessibleNodeIds.`,
					);
				}
				return;
			}
			writeStoredScope(userId, organizationId, nodeId);
			setActiveScopeId(nodeId);
		},
		[userId, organizationId, accessibleNodeIds],
	);

	const resetScope = React.useCallback(() => {
		if (!userId || !organizationId || !topAccessibleNodeId) return;
		writeStoredScope(userId, organizationId, topAccessibleNodeId);
		setActiveScopeId(topAccessibleNodeId);
	}, [userId, organizationId, topAccessibleNodeId]);

	const activeScopeNode = React.useMemo<ScopeNode | null>(() => {
		if (!org || !activeScopeId) return null;
		return org.hierarchy.nodes.find((n) => n.id === activeScopeId) ?? null;
	}, [org, activeScopeId]);

	const isAllScope =
		activeScopeId != null && activeScopeId === topAccessibleNodeId;

	// Inject as `branchId`: undefined for "All" (server uses full accessibleNodeIds),
	// else the selected node id (narrows within RBAC).
	const scopeBranchId = isAllScope ? undefined : (activeScopeId ?? undefined);

	const isScopeReady = activeScopeId != null;

	const value = React.useMemo<ScopeContextValue>(
		() => ({
			activeScopeId,
			activeScopeNode,
			setActiveScope,
			resetScope,
			accessibleNodeIds,
			scopeNodes,
			topAccessibleNodeId,
			isAllScope,
			scopeBranchId,
			isScopeReady,
		}),
		[
			activeScopeId,
			activeScopeNode,
			setActiveScope,
			resetScope,
			accessibleNodeIds,
			scopeNodes,
			topAccessibleNodeId,
			isAllScope,
			scopeBranchId,
			isScopeReady,
		],
	);

	return (
		<ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
	);
}
```

- [ ] **Step 4: run, verify PASS**

```
cd apps/web && bunx vitest run src/__tests__/components/scope/ScopeProvider.test.tsx
```
Expect all describe blocks green (default scope, persistence/validation, setActiveScope narrow-only, org-switch reset, unloaded context, guard throw).

- [ ] **Step 5: commit**

```
git add apps/web/src/components/scope/ScopeProvider.tsx apps/web/src/__tests__/components/scope/ScopeProvider.test.tsx
git commit -m "feat(web): add ScopeProvider + useScope for tenant scope switching"
```

---

### Task 2: Mount ScopeProvider in the root provider tree — apps/web/src/routes/__root.tsx
**Files:**
- Modify: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/routes/__root.tsx`
- Test: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/__tests__/routes/root-scope-mount.test.tsx`

(Mounted inside `<AuthProvider>` — below the QueryClientProvider established by `main.tsx`'s router `Wrap` — wrapping `<Outlet />` so every route resolves `useScope()`. A route file cannot be unit-rendered without a full router/QueryClient harness, so this test asserts the wiring at the source level: the import and the `<ScopeProvider>…<Outlet />…</ScopeProvider>` nesting. That is the precise RED→GREEN signal for this edit.)

- [ ] **Step 1: failing test** (full code)

```tsx
// apps/web/src/__tests__/routes/root-scope-mount.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootPath = path.resolve(here, "../../routes/__root.tsx");
const src = readFileSync(rootPath, "utf8");

describe("__root.tsx — ScopeProvider mount", () => {
	it("imports ScopeProvider from @/components/scope/ScopeProvider", () => {
		expect(src).toMatch(
			/import\s*\{\s*ScopeProvider\s*\}\s*from\s*["']@\/components\/scope\/ScopeProvider["']/,
		);
	});

	it("wraps the router Outlet inside ScopeProvider", () => {
		const open = src.indexOf("<ScopeProvider>");
		const outlet = src.indexOf("<Outlet />");
		const close = src.indexOf("</ScopeProvider>");
		expect(open).toBeGreaterThan(-1);
		expect(outlet).toBeGreaterThan(open);
		expect(close).toBeGreaterThan(outlet);
	});

	it("mounts ScopeProvider inside AuthProvider (so useUserContext is available)", () => {
		const auth = src.indexOf("<AuthProvider>");
		const scope = src.indexOf("<ScopeProvider>");
		expect(auth).toBeGreaterThan(-1);
		expect(scope).toBeGreaterThan(auth);
	});
});
```

- [ ] **Step 2: run, verify FAIL**

```
cd apps/web && bunx vitest run src/__tests__/routes/root-scope-mount.test.tsx
```
Reason: `__root.tsx` has no `ScopeProvider` import and does not wrap `<Outlet />` yet — the import regex and the `<ScopeProvider>` index lookups (which return -1) fail.

- [ ] **Step 3: implement** (precise edits)

Edit 1 — add the import alongside the existing provider imports (after the `AuthProvider` import on line 3):

```tsx
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ScopeProvider } from "@/components/scope/ScopeProvider";
```

Edit 2 — wrap `<Outlet />` (line 62) in `<ScopeProvider>`. Replace:

```tsx
					{isFetching && (
						<div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary animate-pulse" />
					)}
					<Outlet />
					<Toaster richColors />
```

with:

```tsx
					{isFetching && (
						<div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-primary animate-pulse" />
					)}
					<ScopeProvider>
						<Outlet />
					</ScopeProvider>
					<Toaster richColors />
```

(Placement keeps the existing loading bar and `<Toaster />` as siblings; `ScopeProvider` sits inside `AuthProvider` > `ThemeProvider`, below the QueryClientProvider from `main.tsx`, so its `useUserContext()` call resolves.)

- [ ] **Step 4: run, verify PASS**

```
cd apps/web && bunx vitest run src/__tests__/routes/root-scope-mount.test.tsx
```
Then a fast typecheck of the touched file's package: `cd apps/web && bunx tsc --noEmit -p tsconfig.json` (or repo-root `bun check-types`) to confirm the new import resolves.

- [ ] **Step 5: commit**

```
git add apps/web/src/routes/__root.tsx apps/web/src/__tests__/routes/root-scope-mount.test.tsx
git commit -m "feat(web): mount ScopeProvider in root provider tree"
```

---

### Task 3: ScopeSwitcher UI component (searchable country→state→branch tree + "All"; single-node→static label) — `apps/web/src/components/scope/ScopeSwitcher.tsx`

**Depends on:** Task 2 (`apps/web/src/components/scope/ScopeProvider.tsx` exporting `useScope` + `ScopeContextValue`/`ScopeNode`). The test mocks `useScope`, so it does not exercise the real provider — but the `ScopeProvider.tsx` module must already exist for the component's `import { useScope }` to resolve.

**Files:**
- Create: `apps/web/src/components/scope/ScopeSwitcher.tsx`
- Test: `apps/web/src/__tests__/components/scope/scope-switcher.test.tsx`
- (No `app-sidebar.tsx` edit here — mounting the switcher into the dead org-pill at `app-sidebar.tsx:656-678` is a separate wiring task.)

---

- [ ] **Step 1 — Write the failing test.** Mirrors the project's mock-the-hook convention (cf. `claims-widget.test.tsx` mocking `@/hooks/useUserContext`) and the Radix-Popover-via-`userEvent` convention (cf. `drop-in-form.test.tsx`). Mocks `useScope` so the component is tested in isolation. Test file goes under `src/__tests__/**` (required by `vitest.config.ts` `include`). Create `apps/web/src/__tests__/components/scope/scope-switcher.test.tsx`:

```tsx
import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import type {
	ScopeContextValue,
	ScopeNode,
} from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";

const setActiveScope = vi.fn();
const resetScope = vi.fn();

// Mutable holder the mock reads on every render.
let scopeValue: ScopeContextValue;

vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => scopeValue,
}));

function node(
	partial: Partial<ScopeNode> & { id: string; name: string },
): ScopeNode {
	return {
		type: "branch",
		depth: 2,
		parentId: null,
		createdAt: null,
		updatedAt: null,
		...partial,
	} as ScopeNode;
}

const MY = node({ id: "n-my", name: "Malaysia", type: "country", depth: 0 });
const KL = node({ id: "n-kl", name: "KL Branch", type: "branch", depth: 2, parentId: "n-sel" });
const PJ = node({ id: "n-pj", name: "PJ Branch", type: "branch", depth: 2, parentId: "n-sel" });

function makeScope(overrides: Partial<ScopeContextValue>): ScopeContextValue {
	return {
		activeScopeId: "n-my",
		activeScopeNode: MY,
		setActiveScope,
		resetScope,
		accessibleNodeIds: ["n-my", "n-kl", "n-pj"],
		scopeNodes: [MY, KL, PJ],
		topAccessibleNodeId: "n-my",
		isAllScope: true,
		scopeBranchId: undefined,
		isScopeReady: true,
		...overrides,
	};
}

describe("ScopeSwitcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		scopeValue = makeScope({});
	});

	test("renders nothing until scope is ready", () => {
		scopeValue = makeScope({ isScopeReady: false });
		const { container } = renderWithProviders(<ScopeSwitcher />);
		expect(container).toBeEmptyDOMElement();
	});

	test("renders a static label (no combobox) when only one node is accessible", () => {
		scopeValue = makeScope({
			scopeNodes: [KL],
			accessibleNodeIds: ["n-kl"],
			activeScopeId: "n-kl",
			activeScopeNode: KL,
			topAccessibleNodeId: "n-kl",
			isAllScope: true,
			scopeBranchId: undefined,
		});
		renderWithProviders(<ScopeSwitcher />);
		expect(screen.getByTestId("scope-switcher-static")).toHaveTextContent(
			"KL Branch",
		);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});

	test("trigger shows an 'All' label when isAllScope", () => {
		renderWithProviders(<ScopeSwitcher />);
		expect(screen.getByRole("combobox")).toHaveTextContent(/All/);
	});

	test("trigger shows the active node name when narrowed to one branch", () => {
		scopeValue = makeScope({
			activeScopeId: "n-kl",
			activeScopeNode: KL,
			isAllScope: false,
			scopeBranchId: "n-kl",
		});
		renderWithProviders(<ScopeSwitcher />);
		expect(screen.getByRole("combobox")).toHaveTextContent("KL Branch");
	});

	test("opening lists the 'All' entry plus each accessible descendant", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));

		const options = await screen.findAllByRole("option");
		// All + KL + PJ — the top node (Malaysia) is represented by "All", not listed twice.
		expect(options).toHaveLength(3);
		expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
			"All",
		);
		expect(screen.getByText("KL Branch")).toBeInTheDocument();
		expect(screen.getByText("PJ Branch")).toBeInTheDocument();
	});

	test("selecting a branch calls setActiveScope with its node id", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByText("PJ Branch"));
		expect(setActiveScope).toHaveBeenCalledWith("n-pj");
	});

	test("selecting 'All' calls resetScope", async () => {
		const user = userEvent.setup();
		scopeValue = makeScope({
			activeScopeId: "n-kl",
			activeScopeNode: KL,
			isAllScope: false,
			scopeBranchId: "n-kl",
		});
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));
		await user.click(await screen.findByRole("option", { name: /All/ }));
		expect(resetScope).toHaveBeenCalledTimes(1);
	});

	test("typing in the search box filters the descendant list and hides 'All'", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScopeSwitcher />);
		await user.click(screen.getByRole("combobox"));
		await user.type(
			await screen.findByPlaceholderText("Search branches..."),
			"PJ",
		);
		expect(screen.getByText("PJ Branch")).toBeInTheDocument();
		expect(screen.queryByText("KL Branch")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("option", { name: /^All/ }),
		).not.toBeInTheDocument();
	});
});
```

- [ ] **Step 2 — Run, verify FAIL.** From repo root, on Node 22 (per MEMORY: Node 25's localStorage breaks web vitest):
  ```bash
  cd apps/web && bunx vitest run src/__tests__/components/scope/scope-switcher.test.tsx
  ```
  Expected failure: `Failed to resolve import "@/components/scope/ScopeSwitcher"` — the component file does not exist yet, so the whole suite errors at collection time (red).

- [ ] **Step 3 — Implement.** Mirrors the production searchable-combobox precedent `apps/web/src/components/ui/branch-combobox.tsx` (Popover + `Input` search + scrollable `<button>` list), but consumes `useScope` instead of fetching via oRPC. Popover is chosen over DropdownMenu deliberately: its trigger toggles on plain `onClick` (no `hasPointerCapture`/`scrollIntoView` jsdom shims needed), matching the existing Radix-in-jsdom tests. All hooks (`useState`, `useMemo`) are called unconditionally before any early return to satisfy the Rules of Hooks. Create `apps/web/src/components/scope/ScopeSwitcher.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useScope } from "@/components/scope/ScopeProvider";

/**
 * Tenant scope switcher. Options are the caller's accessible hierarchy nodes
 * (RBAC ceiling) depth-ordered into a country→state→branch tree, with a pinned
 * "All" entry that maps to the top accessible node. A single accessible node
 * renders a static label (nothing to switch).
 */
export function ScopeSwitcher({ className }: { className?: string }) {
	const {
		scopeNodes,
		activeScopeId,
		activeScopeNode,
		setActiveScope,
		resetScope,
		topAccessibleNodeId,
		isAllScope,
		isScopeReady,
	} = useScope();

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const topNode = useMemo(
		() =>
			scopeNodes.find((n) => n.id === topAccessibleNodeId) ??
			scopeNodes[0] ??
			null,
		[scopeNodes, topAccessibleNodeId],
	);
	const baseDepth = topNode?.depth ?? 0;

	// The top node is represented by the "All" entry, so it is not listed twice.
	const descendants = useMemo(
		() => scopeNodes.filter((n) => n.id !== topAccessibleNodeId),
		[scopeNodes, topAccessibleNodeId],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return descendants;
		return descendants.filter((n) => n.name.toLowerCase().includes(q));
	}, [descendants, search]);

	// Don't flash a wrong/empty scope before the provider has resolved.
	if (!isScopeReady) return null;

	// Single accessible node → nothing to switch; static label.
	if (scopeNodes.length <= 1) {
		return (
			<div
				data-testid="scope-switcher-static"
				className={cn(
					"flex items-center gap-2 px-3 py-2 text-sm font-medium",
					className,
				)}
			>
				<Globe className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">
					{activeScopeNode?.name ?? scopeNodes[0]?.name ?? "—"}
				</span>
			</div>
		);
	}

	const triggerLabel = isAllScope
		? `All · ${topNode?.name ?? ""}`.trim()
		: (activeScopeNode?.name ?? "Select scope");

	function handleSelect(nodeId: string) {
		setActiveScope(nodeId);
		setOpen(false);
		setSearch("");
	}

	function handleAll() {
		resetScope();
		setOpen(false);
		setSearch("");
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-controls="scope-switcher-list"
					className={cn("w-full justify-between font-normal", className)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Globe className="size-4 shrink-0 opacity-60" />
						<span className="truncate">{triggerLabel}</span>
					</span>
					<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				id="scope-switcher-list"
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<div className="border-b p-2">
					<Input
						placeholder="Search branches..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-8 text-sm"
					/>
				</div>
				<div className="max-h-72 overflow-y-auto py-1">
					{/* "All" entry — pinned to top, hidden while searching. */}
					{search.trim() === "" && (
						<button
							type="button"
							role="option"
							aria-selected={isAllScope}
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
								isAllScope && "bg-accent text-accent-foreground",
							)}
							onClick={handleAll}
						>
							<Check
								className={cn(
									"size-4 shrink-0",
									isAllScope ? "opacity-100" : "opacity-0",
								)}
							/>
							<span className="font-medium">All</span>
							<span className="truncate text-xs text-muted-foreground">
								{topNode?.name}
							</span>
						</button>
					)}
					{filtered.length === 0 ? (
						<p className="px-3 py-4 text-center text-sm text-muted-foreground">
							No branches found.
						</p>
					) : (
						filtered.map((n) => {
							const selected = !isAllScope && n.id === activeScopeId;
							return (
								<button
									key={n.id}
									type="button"
									role="option"
									aria-selected={selected}
									className={cn(
										"flex w-full items-center gap-2 py-2 pr-3 text-sm hover:bg-accent hover:text-accent-foreground",
										selected && "bg-accent text-accent-foreground",
									)}
									style={{
										paddingLeft: `${0.75 + Math.max(0, n.depth - baseDepth) * 1}rem`,
									}}
									onClick={() => handleSelect(n.id)}
								>
									<Check
										className={cn(
											"size-4 shrink-0",
											selected ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="truncate">{n.name}</span>
									<span className="ml-auto text-[10px] uppercase text-muted-foreground">
										{n.type}
									</span>
								</button>
							);
						})
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
```

- [ ] **Step 4 — Run, verify PASS.**
  ```bash
  cd apps/web && bunx vitest run src/__tests__/components/scope/scope-switcher.test.tsx
  ```
  Expect all 8 tests green. Then sanity-check no lint/type regression for the two new files:
  ```bash
  cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14 && bun check && bun check-types
  ```

- [ ] **Step 5 — Commit.**
  ```bash
  git add apps/web/src/components/scope/ScopeSwitcher.tsx apps/web/src/__tests__/components/scope/scope-switcher.test.tsx
  git commit -m "feat(scope): add ScopeSwitcher searchable hierarchy tree + All entry"
  ```

---

### Task 4: Wire ScopeSwitcher into the sidebar header (replace the dead org pill) — `apps/web/src/components/app-sidebar.tsx`

**Prerequisites:** Tasks 1–2 already shipped `apps/web/src/components/scope/ScopeProvider.tsx` (exports `useScope`, `ScopeProvider`, `ScopeContextValue`, `ScopeNode`) and mounted `<ScopeProvider>` around `<Outlet/>` in `apps/web/src/routes/__root.tsx`, so `useScope()` has a provider ancestor at runtime when `AppSidebar` renders.

**Files:**
- Create: `apps/web/src/components/scope/ScopeSwitcher.tsx`
- Modify: `apps/web/src/components/app-sidebar.tsx`
- Test: `apps/web/src/__tests__/components/scope/scope-switcher.test.tsx`

Design (locked decisions): `ScopeSwitcher` is a presentation-pure component consuming `useScope()`; it takes `orgName` + `orgInitials` props so `app-sidebar` stays the single source of the current-org lookup (reuses the existing `orgInitials`; the now-dead `branchCount` is removed). Top line = org name (unchanged); **sub-line = active scope** (`activeScopeNode?.name`, or `"All branches"` when `isAllScope`). `scopeNodes.length <= 1` → static label (no button, no chevron); otherwise a `DropdownMenu` whose items are `scopeNodes` (top/`topAccessibleNodeId` node labeled `"All branches"`, others by name), each `onClick={() => setActiveScope(node.id)}` — narrow-only within RBAC.

- [ ] **Step 1 — failing test** (`apps/web/src/__tests__/components/scope/scope-switcher.test.tsx`). Mirrors the Radix-dropdown jsdom shim + `userEvent` open pattern from `src/__tests__/components/pages/access-control/members-tab.test.tsx:40-52,125-134` and the holder-mock pattern at `:21-24`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import type {
	ScopeContextValue,
	ScopeNode,
} from "@/components/scope/ScopeProvider";

// useScope is swapped per-test via this holder so each scenario controls the
// scope state without re-mocking the module (mirrors members-tab.test.tsx).
const scopeHolder: { value: ScopeContextValue } = {
	value: undefined as unknown as ScopeContextValue,
};
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => scopeHolder.value,
}));

import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";

// jsdom lacks the pointer-capture + scroll APIs Radix uses to open menus.
if (!Element.prototype.hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
	Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
	Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}

const REGION: ScopeNode = {
	id: "node-region",
	name: "Klang Valley",
	type: "region",
	depth: 0,
	parentId: null,
	createdAt: null,
	updatedAt: null,
};
const DOWNTOWN: ScopeNode = {
	id: "node-downtown",
	name: "Downtown Branch",
	type: "branch",
	depth: 1,
	parentId: "node-region",
	createdAt: null,
	updatedAt: null,
};
const NORTH: ScopeNode = {
	id: "node-north",
	name: "North Branch",
	type: "branch",
	depth: 1,
	parentId: "node-region",
	createdAt: null,
	updatedAt: null,
};

function makeScope(overrides?: Partial<ScopeContextValue>): ScopeContextValue {
	return {
		activeScopeId: "node-downtown",
		activeScopeNode: DOWNTOWN,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["node-region", "node-downtown", "node-north"],
		scopeNodes: [REGION, DOWNTOWN, NORTH],
		topAccessibleNodeId: "node-region",
		isAllScope: false,
		scopeBranchId: "node-downtown",
		isScopeReady: true,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	scopeHolder.value = makeScope();
});

describe("ScopeSwitcher", () => {
	it("renders the org initials + name and the active scope on the sub-line", () => {
		renderWithProviders(
			<ScopeSwitcher orgName="Test Fitness Franchise" orgInitials="TF" />,
		);

		expect(screen.getByText("TF")).toBeInTheDocument();
		expect(screen.getByText("Test Fitness Franchise")).toBeInTheDocument();
		// sub-line = resolved active node name (not "All", not a branch count)
		expect(screen.getByText("Downtown Branch")).toBeInTheDocument();
		// multiple accessible nodes → interactive switcher (a button trigger)
		expect(screen.getByRole("button")).toBeInTheDocument();
	});

	it("shows 'All branches' on the sub-line when viewing the whole accessible subtree", () => {
		scopeHolder.value = makeScope({
			activeScopeId: "node-region",
			activeScopeNode: REGION,
			isAllScope: true,
			scopeBranchId: undefined,
		});

		renderWithProviders(
			<ScopeSwitcher orgName="Test Fitness Franchise" orgInitials="TF" />,
		);

		expect(screen.getByText("All branches")).toBeInTheDocument();
		expect(screen.queryByText("Downtown Branch")).not.toBeInTheDocument();
	});

	it("renders a static label (no switcher button) when only one node is accessible", () => {
		scopeHolder.value = makeScope({
			activeScopeId: "node-region",
			activeScopeNode: REGION,
			accessibleNodeIds: ["node-region"],
			scopeNodes: [REGION],
			isAllScope: true,
			scopeBranchId: undefined,
		});

		renderWithProviders(
			<ScopeSwitcher orgName="Test Fitness Franchise" orgInitials="TF" />,
		);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByText("All branches")).toBeInTheDocument();
		expect(screen.getByText("TF")).toBeInTheDocument();
	});

	it("narrows scope: clicking a branch option calls setActiveScope with that node id", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<ScopeSwitcher orgName="Test Fitness Franchise" orgInitials="TF" />,
		);

		await user.click(screen.getByRole("button"));
		await waitFor(() => screen.getByRole("menu"));

		await user.click(screen.getByRole("menuitem", { name: "North Branch" }));

		expect(scopeHolder.value.setActiveScope).toHaveBeenCalledWith("node-north");
	});

	it("the 'All branches' option maps to the top accessible node id", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<ScopeSwitcher orgName="Test Fitness Franchise" orgInitials="TF" />,
		);

		await user.click(screen.getByRole("button"));
		await waitFor(() => screen.getByRole("menu"));

		await user.click(screen.getByRole("menuitem", { name: "All branches" }));

		expect(scopeHolder.value.setActiveScope).toHaveBeenCalledWith("node-region");
	});
});
```

- [ ] **Step 2 — run, verify FAIL:** `cd apps/web && bunx vitest run src/__tests__/components/scope/scope-switcher.test.tsx`. Expect a RED suite: `Failed to resolve import "@/components/scope/ScopeSwitcher"` (the component file does not exist yet), so all 5 tests error before assertions.

- [ ] **Step 3 — implement.**

  **(a) Create `apps/web/src/components/scope/ScopeSwitcher.tsx`** (new file → free imports; uses `ChevronsUpDown` which already exists in lucide per `announcements-widget.tsx:1`; `cn` from `@/lib/utils` per `app-sidebar.tsx:75`):

```tsx
import { ChevronsUpDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useScope } from "@/components/scope/ScopeProvider";
import { cn } from "@/lib/utils";

interface ScopeSwitcherProps {
	/** Current org display name (top line of the pill). */
	orgName: string;
	/** Pre-computed initials for the avatar tile. */
	orgInitials: string;
}

/**
 * Tenant scope switcher pill in the sidebar header. Top line = org name,
 * sub-line = the active scope. One accessible node → static label; otherwise a
 * dropdown that NARROWS the active scope within the caller's accessibleNodeIds
 * (server still guards via guardBranchAccessible).
 */
export function ScopeSwitcher({ orgName, orgInitials }: ScopeSwitcherProps) {
	const {
		scopeNodes,
		activeScopeId,
		activeScopeNode,
		isAllScope,
		setActiveScope,
		topAccessibleNodeId,
		isScopeReady,
	} = useScope();

	const subLine = !isScopeReady
		? "Loading…"
		: isAllScope
			? "All branches"
			: (activeScopeNode?.name ?? "All branches");

	const avatar = (
		<div className="flex size-6 shrink-0 items-center justify-center rounded bg-[#d6cdb1] text-[10px] font-bold text-black">
			{orgInitials}
		</div>
	);

	const labels = (
		<div className="min-w-0 flex-1">
			<div className="truncate text-xs font-semibold text-sidebar-foreground">
				{orgName}
			</div>
			<div className="truncate text-[10px] text-sidebar-foreground/55">
				{subLine}
			</div>
		</div>
	);

	// Single accessible node → static label, no switcher affordance.
	if (scopeNodes.length <= 1) {
		return (
			<div
				className={cn(
					"mx-2 mt-1 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-left",
					"group-data-[collapsible=icon]:hidden",
				)}
			>
				{avatar}
				{labels}
			</div>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"mx-2 mt-1 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-left transition hover:bg-[#333]",
						"group-data-[collapsible=icon]:hidden",
					)}
				>
					{avatar}
					{labels}
					<ChevronsUpDown className="size-3 shrink-0 text-sidebar-foreground/55" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel className="truncate text-xs">
					{orgName}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{scopeNodes.map((node) => (
					<DropdownMenuItem
						key={node.id}
						onClick={() => setActiveScope(node.id)}
						className={cn(
							"text-xs",
							node.id === activeScopeId && "font-semibold",
						)}
					>
						{node.id === topAccessibleNodeId ? "All branches" : node.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

  **(b) Modify `apps/web/src/components/app-sidebar.tsx`** — three edits (preserve the file's tab indentation):

  Edit 1 — add the import directly after the dropdown-menu import block (after `app-sidebar.tsx:57`):
```
} from "@/components/ui/dropdown-menu";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
```

  Edit 2 — delete the now-dead `branchCount` (was the only consumer; lives at `:595-597`); remove these lines (and the trailing blank line):
```
	// Branches in the current org (leaf hierarchy nodes typed "branch")
	const branchCount =
		currentOrg?.hierarchy.nodes.filter((n) => n.type === "branch").length ?? 0;
```
  Keep `currentOrg` (`:587`) and `orgInitials` (`:600`) — both still used (the `{currentOrg && …}` guard and the `orgInitials` prop). `ChevronRight` import stays (still used at `:342,:460,:756`).

  Edit 3 — replace the dead pill `<button>` block (`:655-679`) with the wired component:
```
			{/* Tenant scope switcher */}
			{currentOrg && (
				<ScopeSwitcher orgName={currentOrg.name} orgInitials={orgInitials} />
			)}
```

- [ ] **Step 4 — run, verify PASS:** `cd apps/web && bunx vitest run src/__tests__/components/scope/scope-switcher.test.tsx` → all 5 green. Then `bun check-types` (from repo root) to confirm the `ScopeSwitcher` import/props and the `branchCount` removal type-clean across the monorepo, and `cd apps/web && bun check` (oxlint) confirms no unused-symbol error from the dropped `branchCount`. Finally, per CLAUDE.md, verify in Chrome at `http://avantej.localhost:3021/` (log in as `franchisee@gmail.com` / `password123`): the sidebar pill shows the org name with the active scope on the sub-line, opens a menu of accessible nodes, and selecting one updates the sub-line.

- [ ] **Step 5 — commit:** `feat(scope): wire ScopeSwitcher into sidebar header, replacing the dead org pill`

Relevant paths: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/components/scope/ScopeSwitcher.tsx`, `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/components/app-sidebar.tsx`, `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/__tests__/components/scope/scope-switcher.test.tsx`.

---

### Task 5: DashboardPage (Overview) consumes `scopeBranchId` — inject into the 7 scope-aware analytics queries — `apps/web/src/components/pages/dashboard/DashboardPage.tsx`

**Files:**
- Modify: `apps/web/src/components/pages/dashboard/DashboardPage.tsx`
- Test (create): `apps/web/src/__tests__/pages/dashboard-page-scope.test.tsx`

Depends on Task 1 (`@/components/scope/ScopeProvider` exporting `useScope`) already merged. No backend changes: all 7 procedures (`analytics.getDashboardKpis` ×2, `analytics.getStaffPerformance`, `salesOrders.largestToday`, `members.newToday`, `auditLogs.list`, `appointments.list`, `analytics.getRevenueSeries`) already accept optional `branchId` (analytics.ts:29/58/83; sales-orders/query.procedures.ts:303-308; members/read.procedures.ts:123-128; appointments/list.procedures.ts:26; audit-logs.ts:19). `PendingApprovalsInline` (line 256, a prop not an oRPC input) is OUT OF SCOPE — the API-SPEC consumer list is exactly lines 44,50,56,62,68,74,93-98,105.

- [ ] **Step 1: failing test** — Create `apps/web/src/__tests__/pages/dashboard-page-scope.test.tsx`. Mirrors the `src/__tests__/pages/approvals.test.tsx` mocking conventions (`mockClient`/`mockOrpc` helpers, `renderWithProviders`, `useUserContext` stub, `@tanstack/react-router` `Link` stub). `useScope` is narrowed to a single branch so `scopeBranchId === "node-branch-1"`; the queryFn built by `createTanstackQueryUtils` lands on `mockClient.<path>(input, …)`, so we assert `input` carries `branchId`.

```tsx
import { describe, it, expect, vi, type Mock } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// <Link> needs router context jsdom lacks — stub to render children.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// oRPC: client stubs + queryOptions wired through the SAME mock client so each
// queryFn resolves back to mockClient.<path> with the exact input object.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));

// Current org + a member so organizationId resolves and every query enables.
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					role: "admin",
					hierarchy: {
						nodes: [],
						member: {
							id: "member-caller",
							role: "admin",
							hierarchyScopeId: "node-region-1",
							hierarchyScopeName: "Region",
							accessibleNodeIds: ["node-region-1", "node-branch-1"],
						},
					},
				},
			],
		},
		hasRole: () => true,
		hasPermission: () => true,
		hasAnyPermission: () => true,
	}),
}));

// Scope switcher narrowed to a single branch → scopeBranchId is that node id.
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: "node-branch-1",
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["node-region-1", "node-branch-1"],
		scopeNodes: [],
		topAccessibleNodeId: "node-region-1",
		isAllScope: false,
		scopeBranchId: "node-branch-1",
		isScopeReady: true,
	}),
}));

// Presentational children mocked → keep the test on the data-fetching layer
// (and avoid recharts/ResizeObserver noise from the trend card).
vi.mock("@/components/pages/dashboard/DashboardHeader", () => ({
	DashboardHeader: () => <div data-testid="dashboard-header" />,
}));
vi.mock("@/components/pages/dashboard/HeroSection", () => ({
	HeroSection: () => <div data-testid="hero" />,
}));
vi.mock("@/components/pages/dashboard/RevenueTrendCard", () => ({
	RevenueTrendCard: () => <div data-testid="revenue-trend" />,
}));
vi.mock("@/components/pages/dashboard/RevenueByBranchCard", () => ({
	RevenueByBranchCard: () => <div data-testid="revenue-by-branch" />,
}));
vi.mock("@/components/pages/dashboard/TopPerformersCard", () => ({
	TopPerformersCard: () => <div data-testid="top-performers" />,
}));
vi.mock("@/components/pages/dashboard/RecentActivityCard", () => ({
	RecentActivityCard: () => <div data-testid="recent-activity" />,
}));
vi.mock("@/components/pages/dashboard/TodayAppointmentsCard", () => ({
	TodayAppointmentsCard: () => <div data-testid="today-appts" />,
}));
vi.mock("@/components/pages/dashboard/PendingApprovalsInline", () => ({
	PendingApprovalsInline: () => <div data-testid="pending-approvals" />,
}));

import { DashboardPage } from "@/components/pages/dashboard/DashboardPage";

describe("DashboardPage scope injection", () => {
	it("injects scopeBranchId as branchId on every scope-aware analytics query", async () => {
		renderWithProviders(
			<DashboardPage period="this_month" onSelectPeriod={() => {}} />,
		);

		const expectBranch = (fn: Mock) => {
			expect(fn.mock.calls.length).toBeGreaterThan(0);
			expect(fn.mock.calls[0]?.[0]).toMatchObject({
				organizationId: "org-1",
				branchId: "node-branch-1",
			});
		};

		// getDashboardKpis fires twice (selected period + "today") — both narrowed.
		await waitFor(() =>
			expectBranch(mockClient.analytics.getDashboardKpis as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.analytics.getStaffPerformance as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.salesOrders.largestToday as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.members.newToday as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.auditLogs.list as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.appointments.list as unknown as Mock),
		);
		await waitFor(() =>
			expectBranch(mockClient.analytics.getRevenueSeries as unknown as Mock),
		);
	});
});
```

- [ ] **Step 2: run, verify FAIL** — `cd apps/web && bunx vitest run src/__tests__/pages/dashboard-page-scope.test.tsx`. Expected red: every query input is currently `{ organizationId, period | days | … }` with NO `branchId` key (DashboardPage.tsx:44,50,56,62,68,74,93-98,105), so the first `toMatchObject({ branchId: "node-branch-1" })` throws `objects don't match` (received input has no `branchId`).

- [ ] **Step 3: implement** — Edit `apps/web/src/components/pages/dashboard/DashboardPage.tsx`. (a) Add the import beneath the existing `useUserContext` import:

```ts
// old
import { useUserContext } from "@/hooks/useUserContext";
// new
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
```

(b) Read `scopeBranchId` from the provider, directly under the `useUserContext()` line (~line 33):

```ts
// old
	const { data: userContext, hasRole } = useUserContext();
// new
	const { data: userContext, hasRole } = useUserContext();
	const { scopeBranchId } = useScope();
```

(c) Add `branchId: scopeBranchId` to each of the 7 query inputs. Use the `queryOptions(` line as context to disambiguate the two identical `input: { organizationId: organizationId!, period },` occurrences (getDashboardKpis vs getStaffPerformance) and the two identical `input: { organizationId: organizationId! },` occurrences (largestToday vs newToday). Indentation is tabs.

```ts
// getDashboardKpis (selected period) — lines 43-45
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: { organizationId: organizationId!, period, branchId: scopeBranchId },
		}),

// getDashboardKpis (today) — lines 49-51
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: { organizationId: organizationId!, period: "today", branchId: scopeBranchId },
		}),

// getStaffPerformance — lines 55-57
		...orpc.analytics.getStaffPerformance.queryOptions({
			input: { organizationId: organizationId!, period, branchId: scopeBranchId },
		}),

// salesOrders.largestToday — lines 61-63
		...orpc.salesOrders.largestToday.queryOptions({
			input: { organizationId: organizationId!, branchId: scopeBranchId },
		}),

// members.newToday — lines 67-69
		...orpc.members.newToday.queryOptions({
			input: { organizationId: organizationId!, branchId: scopeBranchId },
		}),

// auditLogs.list — lines 73-75
		...orpc.auditLogs.list.queryOptions({
			input: { organizationId: organizationId!, limit: 6, offset: 0, branchId: scopeBranchId },
		}),

// appointments.list — lines 92-99 (add inside the multi-line input object, after limit)
		...orpc.appointments.list.queryOptions({
			input: {
				organizationId: organizationId!,
				startFrom: todayStart,
				startTo: todayEnd,
				limit: 50,
				branchId: scopeBranchId,
			},
		}),

// getRevenueSeries — lines 104-106
		...orpc.analytics.getRevenueSeries.queryOptions({
			input: { organizationId: organizationId!, days: trendDays, branchId: scopeBranchId },
		}),
```

`scopeBranchId` is `string | undefined` per the API-SPEC: `undefined` at the "All" scope (server falls back to full `accessibleNodeIds`), else the narrowed `activeScopeId`. The optional `branchId: z.string().uuid().optional()` on each schema accepts `undefined` as omitted, so the "All" case is a no-op and only narrowing sends a value — server-side `guardBranchAccessible` already enforces RBAC.

- [ ] **Step 4: run, verify PASS** — `cd apps/web && bunx vitest run src/__tests__/pages/dashboard-page-scope.test.tsx` (green). Then full type/lint gate: `cd apps/web && bunx vitest run && cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14 && bun check-types && bun check`.

- [ ] **Step 5: commit** — `git commit -am "feat(dashboard): narrow Overview analytics queries by useScope().scopeBranchId"`

---

### Task 6: "All"-scope per-country money cards in Overview — `apps/web/src/components/pages/dashboard/HeroSection.tsx`

**Files:**
- Create: `apps/web/src/components/pages/dashboard/PerCountryMoneyCards.tsx`
- Modify: `apps/web/src/components/pages/dashboard/HeroSection.tsx`
- Modify: `apps/web/src/components/pages/dashboard/DashboardPage.tsx`
- Test: `apps/web/src/__tests__/components/dashboard-hero-per-country.test.tsx`

Grounding facts: `HeroSection` is a pure presentational component (props only, no oRPC) so it can be rendered in isolation. The single MYR revenue tile is the big-number `<span>` at `HeroSection.tsx:102-104` `{formatPrice(kpis?.totalSales ?? 0, "MYR")}`. Per-branch revenue is `kpis.revenueByBranch` — `RevenueByBranch[]` = `{ branchId; branchName: string|null; totalRevenue /*cents*/; orderCount }` (`analytics.service.ts:23-28`); there is NO currency field server-side, so each card defaults to `"MYR"` and we NEVER sum across branches (locked decision: "Counts aggregate; never sum currencies"). `formatPrice` is from `@/lib/money` (`RM 5,000.00` for `500000` cents). `useScope().isAllScope` is the boolean from `ScopeProvider` (created in earlier tasks). Test conventions: vitest + `@testing-library/react`, `toBeInTheDocument` is auto-extended via `apps/web/src/__tests__/setup.ts`; `HeroSection` uses Radix `Tooltip`, so the render must be wrapped in `<TooltipProvider>`.

- [ ] **Step 1: failing test** — create `apps/web/src/__tests__/components/dashboard-hero-per-country.test.tsx`:

```tsx
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DashboardKpisResult } from "@avantej-core/services";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeroSection } from "@/components/pages/dashboard/HeroSection";

function makeKpis(): DashboardKpisResult {
	return {
		period: "this_month",
		from: new Date("2026-06-01T00:00:00Z"),
		to: new Date("2026-06-30T23:59:59Z"),
		totalSales: 500000, // RM 5,000.00 — the single combined tile
		salesOrderCount: 42,
		previousPeriodSales: 0,
		previousPeriodOrderCount: 0,
		totalAppointments: 0,
		completedAppointments: 0,
		activeMembersCount: 12,
		revenueByBranch: [
			{ branchId: "b-kl", branchName: "KL", totalRevenue: 300000, orderCount: 25 },
			{ branchId: "b-jb", branchName: "JB", totalRevenue: 200000, orderCount: 17 },
		],
		churnRatePct: 0,
		avgLtvCents: 0,
		classFillRatePct: 0,
	};
}

function renderHero(isAllScope: boolean) {
	const kpis = makeKpis();
	return render(
		<TooltipProvider>
			<HeroSection
				orgName="Avantej Gym"
				period="this_month"
				revenueDelta={null}
				kpis={kpis}
				kpisLoading={false}
				kpisError={false}
				onRetryKpis={() => {}}
				todayKpis={undefined}
				todayLoading={false}
				todayError={false}
				onRetryToday={() => {}}
				largestToday={null}
				largestLoading={false}
				largestError={false}
				onRetryLargest={() => {}}
				newTodayCount={undefined}
				isAllScope={isAllScope}
			/>
		</TooltipProvider>,
	);
}

describe("HeroSection — per-country money cards", () => {
	test("single-node scope renders the combined MYR revenue tile (no per-country cards)", () => {
		renderHero(false);
		expect(screen.getByText("RM 5,000.00")).toBeInTheDocument();
		expect(screen.queryByTestId("per-country-money-cards")).toBeNull();
	});

	test("All scope renders one money card per branch (each own currency) instead of the single tile", () => {
		renderHero(true);
		const cards = screen.getByTestId("per-country-money-cards");
		expect(cards).toBeInTheDocument();
		// each branch card shows its own name + its own formatted revenue
		expect(screen.getByText("KL")).toBeInTheDocument();
		expect(screen.getByText("JB")).toBeInTheDocument();
		expect(screen.getByText("RM 3,000.00")).toBeInTheDocument();
		expect(screen.getByText("RM 2,000.00")).toBeInTheDocument();
		// never sum currencies: the combined RM 5,000.00 tile is NOT rendered in All scope
		expect(screen.queryByText("RM 5,000.00")).toBeNull();
	});
});
```

- [ ] **Step 2: run, verify FAIL** — `cd apps/web && bunx vitest run src/__tests__/components/dashboard-hero-per-country.test.tsx`. Expected FAIL: `HeroSection` ignores the unknown `isAllScope` prop, so in All scope it still renders the single `RM 5,000.00` span and never emits `per-country-money-cards` → `getByTestId("per-country-money-cards")` throws (not found) and `queryByText("RM 5,000.00")` is non-null.

- [ ] **Step 3: implement**

  **3a.** Create `apps/web/src/components/pages/dashboard/PerCountryMoneyCards.tsx`:

```tsx
import { formatPrice } from "@/lib/money";
import type { DashboardKpisResult } from "@avantej-core/services";

/**
 * "All"-scope money cards: one card per branch, each formatted in its OWN
 * currency. The backend `revenueByBranch` rows only emit MYR today, so we
 * default to "MYR" and NEVER sum across branches (mixing currencies is invalid).
 */
export function PerCountryMoneyCards({
	kpis,
}: {
	kpis: DashboardKpisResult | undefined;
}) {
	const branches = kpis?.revenueByBranch ?? [];
	return (
		<div
			data-testid="per-country-money-cards"
			className="grid w-full grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[#e5e5e5] bg-[#e5e5e5] sm:grid-cols-2"
		>
			{branches.map((b) => {
				// Forward-compatible: each card owns its currency, defaulting to MYR.
				const currency = (b as { currency?: string }).currency ?? "MYR";
				return (
					<div key={b.branchId} className="bg-white p-5">
						<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{b.branchName ?? "Unnamed"}
						</div>
						<div className="mt-1 font-mono text-2xl font-extrabold tabular-nums">
							{formatPrice(b.totalRevenue, currency)}
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{b.orderCount} orders
						</div>
					</div>
				);
			})}
			{branches.length === 0 && (
				<div className="bg-white p-5 text-xs italic text-muted-foreground">
					No branch revenue yet for this period.
				</div>
			)}
		</div>
	);
}
```

  **3b.** Edit `apps/web/src/components/pages/dashboard/HeroSection.tsx`:

  - Add import after `import { KpiTile } from "./KpiTile";` (line 15):
```tsx
import { PerCountryMoneyCards } from "./PerCountryMoneyCards";
```
  - In `interface HeroSectionProps`, add after `newTodayCount: number | undefined;` (line 38):
```tsx
	/** true when viewing the whole accessible subtree → render per-branch
	 *  ("per-country") money cards instead of the single combined MYR tile. */
	isAllScope: boolean;
```
  - In the destructured params, add `isAllScope,` after `newTodayCount,` (line 57).
  - Replace the value ternary tail + delta-badge guard (current lines 101-106):
```tsx
					) : (
						<span className="font-mono text-6xl font-extrabold leading-none tracking-tight tabular-nums">
							{formatPrice(kpis?.totalSales ?? 0, "MYR")}
						</span>
					)}
					{!kpisError && revenueDelta !== null && (
```
  with:
```tsx
					) : isAllScope ? (
						<PerCountryMoneyCards kpis={kpis} />
					) : (
						<span className="font-mono text-6xl font-extrabold leading-none tracking-tight tabular-nums">
							{formatPrice(kpis?.totalSales ?? 0, "MYR")}
						</span>
					)}
					{!kpisError && !isAllScope && revenueDelta !== null && (
```
  (The `!isAllScope` guard hides the "vs previous period" delta badge in All scope — it compares a single combined total and would imply summed currencies.)

  **3c.** Edit `apps/web/src/components/pages/dashboard/DashboardPage.tsx`:

  - Add import after `import { useUserContext } from "@/hooks/useUserContext";` (line 5):
```tsx
import { useScope } from "@/components/scope/ScopeProvider";
```
  (If the branchId-injection task already added this import + a `useScope()` destructure, merge — add `isAllScope` to that existing destructure instead of duplicating.)
  - Add after `const organizationId = userContext?.currentOrganizationId ?? null;` (line 34):
```tsx
	const { isAllScope } = useScope();
```
  - In the `<HeroSection ... />` JSX (lines 173-190), add the prop after `newTodayCount={newTodayQuery.data?.count}`:
```tsx
						isAllScope={isAllScope}
```

- [ ] **Step 4: run, verify PASS** — `cd apps/web && bunx vitest run src/__tests__/components/dashboard-hero-per-country.test.tsx`. Both tests green: single-node shows `RM 5,000.00` and no `per-country-money-cards`; All scope shows `KL`/`JB` cards with `RM 3,000.00` / `RM 2,000.00` and no combined `RM 5,000.00`.

- [ ] **Step 5: commit** — `git add apps/web/src/components/pages/dashboard/PerCountryMoneyCards.tsx apps/web/src/components/pages/dashboard/HeroSection.tsx apps/web/src/components/pages/dashboard/DashboardPage.tsx apps/web/src/__tests__/components/dashboard-hero-per-country.test.tsx && git commit -m "feat(dashboard): render per-country money cards in Overview when isAllScope"`

---

### Task 7: Reports page consumes activeScopeId — inject into its scoped queries — `apps/web/src/components/pages/reports/ReportsPage.tsx`

**Files:**
- Modify: `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/components/pages/reports/ReportsPage.tsx`
- Create (test): `/Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web/src/__tests__/components/reports-page-scope.test.tsx`
- Consumes (must already exist from the ScopeProvider task): `apps/web/src/components/scope/ScopeProvider.tsx` (`useScope`, `scopeBranchId`)

Scope note: only the **3 branch-aware** procedures get `branchId` here — `getDashboardKpis` (line 44), `getRevenueSeries` (line 52), `getStaffPerformance` (line 96). Backend already accepts `branchId` on these (`analytics.ts:29,58,83` + `guardBranchAccessible` at `:42,69,94`). Do **NOT** touch the 4 series queries at lines 60/68/76/84 (`getMemberCountSeries`/`getChurnSeries`/`getLtvSeries`/`getClassFillRateSeries`): their shared `seriesInput` (`analytics.ts:103`) has no `branchId`, so oRPC validation would reject the extra field — that backend extension is a separate task.

- [ ] **Step 1: Write the failing test.** Create `apps/web/src/__tests__/components/reports-page-scope.test.tsx`. It mirrors the established harness (`schedule-report-dialog.test.tsx`): mocks `@/utils/orpc` with `{ client: mockClient, orpc: mockOrpc }` so `orpc.analytics.*.queryOptions()` resolves its `queryFn` back to the same `mockClient.analytics.*` spy, stubs `useUserContext` (org gate) and the `useScope` switcher, then asserts the injected `branchId`.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// useUserContext supplies the org id every scoped query is gated on (enabled: !!organizationId).
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1", organizations: [] },
	}),
}));

// ScopeProvider.useScope is the switcher context this task wires in.
// scopeBranchId is the EXACT value the page must inject as `branchId`.
const useScopeMock = vi.fn();
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => useScopeMock(),
}));

import { ReportsPage } from "@/components/pages/reports/ReportsPage";

// Resolve every analytics query to a valid (non-undefined) shape so TanStack
// Query never throws "Query data cannot be undefined" and the page renders cleanly.
function primeAnalyticsMocks() {
	mockClient.analytics.getDashboardKpis.mockResolvedValue({
		totalSales: 0,
		previousPeriodSales: 0,
		activeMembersCount: 0,
		completedAppointments: 0,
		totalAppointments: 0,
		from: new Date(),
		to: new Date(),
		revenueByBranch: [],
	});
	mockClient.analytics.getRevenueSeries.mockResolvedValue([]);
	mockClient.analytics.getMemberCountSeries.mockResolvedValue([]);
	mockClient.analytics.getChurnSeries.mockResolvedValue([]);
	mockClient.analytics.getLtvSeries.mockResolvedValue([]);
	mockClient.analytics.getClassFillRateSeries.mockResolvedValue([]);
	mockClient.analytics.getStaffPerformance.mockResolvedValue([]);
}

describe("ReportsPage scope injection", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		primeAnalyticsMocks();
	});

	it("injects scopeBranchId as branchId on the 3 branch-aware analytics queries", async () => {
		useScopeMock.mockReturnValue({ scopeBranchId: "branch-x", isAllScope: false });

		renderWithProviders(<ReportsPage />);

		await waitFor(() => {
			expect(mockClient.analytics.getDashboardKpis).toHaveBeenCalled();
			expect(mockClient.analytics.getRevenueSeries).toHaveBeenCalled();
			expect(mockClient.analytics.getStaffPerformance).toHaveBeenCalled();
		});

		// orpc tanstack queryFn calls the client as (input, { signal, ... }) → first arg is the input.
		expect(mockClient.analytics.getDashboardKpis.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
		expect(mockClient.analytics.getRevenueSeries.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
		expect(mockClient.analytics.getStaffPerformance.mock.calls[0][0]).toMatchObject({
			organizationId: "org-1",
			branchId: "branch-x",
		});
	});

	it("does NOT leak branchId onto the 4 hierarchy-only series queries", async () => {
		useScopeMock.mockReturnValue({ scopeBranchId: "branch-x", isAllScope: false });

		renderWithProviders(<ReportsPage />);

		await waitFor(() => {
			expect(mockClient.analytics.getMemberCountSeries).toHaveBeenCalled();
		});

		for (const q of [
			mockClient.analytics.getMemberCountSeries,
			mockClient.analytics.getChurnSeries,
			mockClient.analytics.getLtvSeries,
			mockClient.analytics.getClassFillRateSeries,
		]) {
			const input = q.mock.calls[0][0] as Record<string, unknown>;
			expect("branchId" in input).toBe(false);
		}
	});

	it("passes branchId: undefined when isAllScope (server falls back to full accessibleNodeIds)", async () => {
		useScopeMock.mockReturnValue({ scopeBranchId: undefined, isAllScope: true });

		renderWithProviders(<ReportsPage />);

		await waitFor(() => {
			expect(mockClient.analytics.getDashboardKpis).toHaveBeenCalled();
		});

		const input = mockClient.analytics.getDashboardKpis.mock.calls[0][0] as Record<
			string,
			unknown
		>;
		// scopeBranchId is the EXACT injected value → key present, value undefined.
		expect("branchId" in input).toBe(true);
		expect(input.branchId).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run, verify FAIL.**
```
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web && bunx vitest run src/__tests__/components/reports-page-scope.test.tsx
```
Expected RED (use Node 22 — Node 25 breaks web vitest localStorage per project test notes). Test 1 fails: `getDashboardKpis`/`getRevenueSeries`/`getStaffPerformance` inputs have no `branchId` key, so `toMatchObject({ branchId: "branch-x" })` does not match. Test 3 fails: `"branchId" in input` is `false`. (Test 2 already passes — it asserts current behavior and guards against over-injection.) The page also does not yet import `useScope`.

- [ ] **Step 3: Implement.** Three edits to `ReportsPage.tsx`.

Edit 3a — add the import directly after the `useUserContext` import (line 5):
```ts
import { useUserContext } from "@/hooks/useUserContext";
import { useScope } from "@/components/scope/ScopeProvider";
```

Edit 3b — read `scopeBranchId` from the switcher, right after `organizationId` (lines 25-27):
```ts
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { scopeBranchId } = useScope();
	const [window, setWindow] = useState<WindowKey>("30D");
```

Edit 3c — inject `branchId: scopeBranchId` into the 3 branch-aware inputs.

getDashboardKpis (line 43-44):
```ts
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: { organizationId: organizationId!, period, branchId: scopeBranchId },
		}),
```
getRevenueSeries (line 51-52):
```ts
		...orpc.analytics.getRevenueSeries.queryOptions({
			input: { organizationId: organizationId!, days: seriesDays, branchId: scopeBranchId },
		}),
```
getStaffPerformance (line 95-96):
```ts
		...orpc.analytics.getStaffPerformance.queryOptions({
			input: { organizationId: organizationId!, period, branchId: scopeBranchId },
		}),
```
Leave the `getMemberCountSeries`/`getChurnSeries`/`getLtvSeries`/`getClassFillRateSeries` inputs (lines 60/68/76/84) unchanged.

- [ ] **Step 4: Run, verify PASS.**
```
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14/apps/web && bunx vitest run src/__tests__/components/reports-page-scope.test.tsx
```
All 3 tests GREEN. Then confirm no type/lint regression:
```
cd /Users/ngchwanlii/.superconductor/worktrees/avantej-core/sc-pinned-fermion-7e14 && bun check-types && bun check
```

- [ ] **Step 5: Commit.**
```
git add apps/web/src/components/pages/reports/ReportsPage.tsx apps/web/src/__tests__/components/reports-page-scope.test.tsx
git commit -m "feat(reports): inject activeScopeId as branchId on scope-aware analytics queries"
```

---

## Self-review notes
- ScopeProvider API is defined once (Task 1) and consumed by the SAME field names (`scopeBranchId`, `isAllScope`, `scopeNodes`, `setActiveScope`) across Tasks 3–7.
- Security: the switcher only sets `activeScopeId ∈ accessibleNodeIds`; out-of-scope ids are rejected client-side AND server-side (Phase 0 guards). No new isolation surface.
- Out of Phase 1 scope (tracked in the spec): Members/Appointments/Commissions read pages (Phase 2); reclassifying the `trusts-fixed-scope` set; FX-converted "All" totals.
- Verify before merge: vitest on the new files + a Chrome-MCP journey (owner switches MY→SG→All; branch-scoped user sees only their node / static label).
