# Native Frontend Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 18 frontend-only bugs and code-quality issues in `apps/native/` (Expo SDK 55 React Native app) without touching backend, schemas, or API contracts.

**Architecture:** Surgical edits across context providers, hooks, layout files, and buy-package flow screens. No new files. No new dependencies. Each task is a single-file fix with explicit before/after code.

**Tech Stack:** React Native (Expo SDK 55), expo-router, TanStack Query, oRPC client, Better-Auth, NativeWind/Tailwind, TypeScript.

**Scope Boundaries:**
- Frontend only — no edits to `apps/server/`, `apps/web/`, `packages/`.
- No schema migration, no API contract change, no new env vars.
- Two reviewer findings excluded as false positives: `pay.tsx:69` already wraps in `try/catch/finally`, and `getDefaultCountry` is already passed as the lazy initializer to `useState` (React calls it once).

**Commit Strategy:** One commit per task. Conventional Commits style: `fix(native): <scope> — <description>`. Run `bun check-types` before each commit.

---

## File Index

| File | Tasks |
|---|---|
| `apps/native/app/_layout.tsx` | 1 |
| `apps/native/app/(app)/_layout.tsx` | 2 |
| `apps/native/lib/auth-client.ts` | 3 |
| `apps/native/hooks/useAuth.ts` | 4, 5 |
| `apps/native/contexts/organization-context.tsx` | 6 |
| `apps/native/utils/orpc.ts` | 7 |
| `apps/native/app/(app)/dashboard/index.tsx` | 8 |
| `apps/native/components/weekly-timetable.tsx` | 9 |
| `apps/native/contexts/purchase-flow-context.tsx` | 10 |
| `apps/native/contexts/booking-flow-context.tsx` | 11 |
| `apps/native/app/(app)/dashboard/buy-package/trainer.tsx` | 12 |
| `apps/native/app/(app)/dashboard/buy-package/sign.tsx` | 13 |
| `apps/native/app/(app)/dashboard/buy-package/pay.tsx` | 14 |
| `apps/native/app/(app)/dashboard/buy-package/plan.tsx` | 15 |
| `apps/native/app/(app)/dashboard/buy-package/setup.tsx` | 16 |
| `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx` | 17 |
| `apps/native/components/registration-form.tsx` | 18 |

---

## Phase 1: Foundation (Auth, Layout, Client)

### Task 1: Fix `useIsomorphicLayoutEffect` referenced before definition

**Files:**
- Modify: `apps/native/app/_layout.tsx:40-51, 68-71`

**Problem:** `useIsomorphicLayoutEffect` is declared after it is used in `RootLayout()` (function expressions declared with `const` are NOT hoisted). Works today because `RootLayout` is only invoked after module evaluation completes — but it is a latent bug and the condition `Platform.OS === "web" && typeof window === "undefined"` selects `useEffect` only during SSR. On native (iOS/Android) it currently picks `useLayoutEffect`, which is fine, but on web during SSR it picks `useEffect`. Move the declaration above `RootLayout` and clarify intent.

- [ ] **Step 1: Move declaration above `RootLayout` and simplify**

Replace lines 40-51 inside `RootLayout` — leave them as-is. Replace the bottom declaration (lines 68-71). Move the declaration to right after the imports block, between the existing `import { queryClient } from "@/utils/orpc";` line and the `LIGHT_THEME` constant.

New code at top of file (insert immediately after `import { queryClient } from "@/utils/orpc";`):

```tsx
const useIsomorphicLayoutEffect =
	Platform.OS === "web" && typeof window === "undefined"
		? React.useEffect
		: React.useLayoutEffect;
```

Delete the old declaration at lines 68-71 (the trailing `const useIsomorphicLayoutEffect = ...` block).

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS, no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/native/app/_layout.tsx
git commit -m "fix(native): hoist useIsomorphicLayoutEffect above usage"
```

---

### Task 2: Tighten user-role type guard in app layout

**Files:**
- Modify: `apps/native/app/(app)/_layout.tsx:9-11`

**Problem:** `user as { role?: string | null }` casts unconditionally. Better-Auth's user type may not include `role` on every shape — use a narrow runtime check that doesn't lie about the type.

- [ ] **Step 1: Replace the cast with a narrow runtime check**

Replace lines 9-11:

```tsx
	const { isAuthenticated, isPending, user } = useAuth();
	const userRole =
		user && "role" in user ? (user as { role?: string | null }).role : undefined;
```

With:

```tsx
	const { isAuthenticated, isPending, user } = useAuth();
	const userRole =
		user && typeof user === "object" && "role" in user
			? (user as Record<string, unknown>).role
			: undefined;
```

The narrow check `typeof user === "object" && "role" in user` ensures runtime safety; the cast to `Record<string, unknown>` is honest about not knowing the type.

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/app/(app)/_layout.tsx
git commit -m "fix(native): tighten user role type guard in app layout"
```

---

### Task 3: Guard `Constants.expoConfig?.scheme` in auth-client

**Files:**
- Modify: `apps/native/lib/auth-client.ts:8-18`

**Problem:** `Constants.expoConfig?.scheme as string` silently coerces `undefined` to "undefined" when scheme is missing. Should throw early so a misconfigured `app.json` fails loud at app startup, not later in opaque auth errors.

- [ ] **Step 1: Extract and validate scheme at module load**

Replace the entire file:

```tsx
import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@avantej-core/auth";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

const scheme = Constants.expoConfig?.scheme;
if (!scheme || typeof scheme !== "string") {
	throw new Error(
		"app.json is missing `expo.scheme` — required for Better-Auth Expo client",
	);
}

export const authClient = createAuthClient({
	baseURL: process.env.EXPO_PUBLIC_SERVER_URL,
	plugins: [
		expoClient({
			scheme,
			storagePrefix: scheme,
			storage: SecureStore,
		}),
		inferAdditionalFields<typeof auth>(),
	],
});
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Verify boot**

Run: `cd /Users/voo/Developement/Work2/avantej-core/apps/native && bun expo start --clear`
Expected: app boots without errors; auth flows work as before. Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/native/lib/auth-client.ts
git commit -m "fix(native): validate expo scheme at module load for auth-client"
```

---

### Task 4: Scope `refetchQueries` after login

**Files:**
- Modify: `apps/native/hooks/useAuth.ts:13-24`

**Problem:** `queryClient.refetchQueries()` with no args refetches every active query in the cache. After login we only need to refresh user-context-derived data; storming the entire cache wastes bandwidth and produces flicker.

- [ ] **Step 1: Scope the refetch to session and user-context queries**

Replace lines 13-24:

```tsx
	const login = useCallback(
		async (email: string, password: string) => {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				throw new Error(result.error.message || "Failed to sign in");
			}
			await refetch();
			queryClient.refetchQueries();
			return result.data;
		},
		[refetch],
	);
```

With:

```tsx
	const login = useCallback(
		async (email: string, password: string) => {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				throw new Error(result.error.message || "Failed to sign in");
			}
			await refetch();
			await queryClient.invalidateQueries({
				predicate: (query) => {
					const key = query.queryKey[0];
					return key === "auth" || key === "userContext";
				},
			});
			return result.data;
		},
		[refetch],
	);
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/hooks/useAuth.ts
git commit -m "fix(native): scope post-login refetch to auth/userContext queries"
```

---

### Task 5: Fix logout race — clear cache after refetch settles

**Files:**
- Modify: `apps/native/hooks/useAuth.ts:46-50`

**Problem:** `queryClient.clear()` runs before `refetch()` resolves the session-null state. In-flight queries (notification badge, package, appointments) may resolve with stale auth headers and re-populate the cache mid-clear. Order: sign out → refetch session (now null) → then clear.

- [ ] **Step 1: Reorder logout sequence**

Replace lines 46-50:

```tsx
	const logout = useCallback(async () => {
		await authClient.signOut();
		queryClient.clear();
		await refetch();
	}, [refetch]);
```

With:

```tsx
	const logout = useCallback(async () => {
		await authClient.signOut();
		await refetch();
		queryClient.clear();
	}, [refetch]);
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/hooks/useAuth.ts
git commit -m "fix(native): clear query cache after session refetch on logout"
```

---

### Task 6: Stabilize `fetchUserContext` callback dep chain

**Files:**
- Modify: `apps/native/contexts/organization-context.tsx:62-103`

**Problem:** `fetchUserContext` depends on `setOrganizationId`, which depends on `setOrganizationIdState` (stable setter, fine) — that's actually OK. The real risk: the effect at line 95-103 re-runs whenever `fetchUserContext` identity changes. Since `setOrganizationId` is wrapped in `useCallback([])`, it is stable, so `fetchUserContext` is stable too. The effect re-runs only on `isAuthenticated` flips — correct behavior. However, the `useMemo` at lines 105-115 includes `fetchUserContext` in its deps unnecessarily — `fetchUserContext` is already stable. The deeper bug: on re-render of `OrganizationProvider`, if React StrictMode double-invokes the effect, two concurrent `fetchUserContext()` calls can interleave and the second `setIsLoading(false)` can race the first.

Fix: track an `aborted` flag inside the effect to prevent stale fetches from updating state.

- [ ] **Step 1: Add abort guard to effect**

Replace lines 95-103:

```tsx
	useEffect(() => {
		if (isAuthenticated) {
			fetchUserContext();
		} else {
			setOrganizations([]);
			setOrganizationIdState(null);
			setIsLoading(false);
		}
	}, [isAuthenticated, fetchUserContext]);
```

With:

```tsx
	useEffect(() => {
		let aborted = false;
		if (isAuthenticated) {
			(async () => {
				try {
					setIsLoading(true);
					setError(null);
					const userContext = await client.auth.userContext();
					if (aborted) return;
					const orgs = userContext.organizations ?? [];
					setOrganizations(orgs);
					const storedId = await SecureStore.getItemAsync(STORAGE_KEY);
					if (aborted) return;
					const storedOrgStillValid =
						storedId && orgs.some((o) => o.id === storedId);
					if (storedOrgStillValid) {
						setOrganizationIdState(storedId);
					} else if (orgs.length === 1) {
						setOrganizationId(orgs[0].id);
					} else if (userContext.currentOrganizationId) {
						setOrganizationId(userContext.currentOrganizationId);
					}
				} catch (err) {
					if (aborted) return;
					setError(
						err instanceof Error
							? err
							: new Error("Failed to fetch user context"),
					);
				} finally {
					if (!aborted) setIsLoading(false);
				}
			})();
		} else {
			setOrganizations([]);
			setOrganizationIdState(null);
			setIsLoading(false);
		}
		return () => {
			aborted = true;
		};
	}, [isAuthenticated, setOrganizationId]);
```

This inlines the fetch so the abort flag actually scopes a single effect instance.

- [ ] **Step 2: Update `refetch` exposed on context to use the same inline function**

The original `fetchUserContext` `useCallback` (lines 67-93) is still exposed via `refetch` on the context value. Keep `fetchUserContext` (the callback) intact so consumers can still call `refetch()` manually — leave lines 67-93 unchanged.

- [ ] **Step 3: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/native/contexts/organization-context.tsx
git commit -m "fix(native): guard organization-context fetch against unmounted updates"
```

---

## Phase 2: Data Layer

### Task 7: Surface oRPC errors instead of swallowing

**Files:**
- Modify: `apps/native/utils/orpc.ts:1-21`

**Problem:** `onError: (error) => { console.log(error); }` only logs — TanStack Query already logs errors. The hook is dead weight and removing it lets QueryCache use its default error handling (which surfaces to `useQuery().error`). Better: keep the hook but use `console.error` to clearly mark unhandled errors and don't swallow.

- [ ] **Step 1: Replace `console.log` with `console.error`**

Replace lines 9-11:

```tsx
  onError: (error) => {
    console.log(error);
  },
```

With:

```tsx
  onError: (error) => {
    console.error("[orpc]", error);
  },
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/utils/orpc.ts
git commit -m "fix(native): use console.error for orpc query errors"
```

---

### Task 8: Fix `queryKey` predicate shape in dashboard refresh

**Files:**
- Modify: `apps/native/app/(app)/dashboard/index.tsx:236-247`

**Note:** Re-reading the actual code: `query.queryKey[0]` is *already* correct (line 239). The reviewer flagged a different concern: `key === "packageInstances"` etc. assume top-level keys are bare strings, but oRPC may namespace them as arrays like `["packageInstances", "list"]`. Verify by inspecting query keys at runtime, but the existing string-equality check already works since `query.queryKey[0]` extracts the first element. **No change required** — this is a false positive after re-reading the code.

- [ ] **Step 1: Confirm no change needed**

Run: `cd /Users/voo/Developement/Work2/avantej-core && grep -rn 'queryKey\[0\]' apps/native/app/`
Expected: confirms `query.queryKey[0]` access is consistent.

- [ ] **Step 2: Skip — no commit**

Document outcome in the task tracker only; do not commit.

---

### Task 9: Guard `hhmm.split()` parsing in weekly-timetable

**Files:**
- Modify: `apps/native/components/weekly-timetable.tsx:34-37`

**Problem:** `hhmm.split(":").map(Number)` returns `[NaN]` if the format is malformed (e.g. `"9am"`, `"09-30"`). Currently falls through to `(h ?? 0) * 60 + (m ?? 0)` which silently produces `0` minutes — slots collapse to position 0 instead of erroring. Add a guard.

- [ ] **Step 1: Validate format in `hhmmToMinutes`**

Replace lines 34-37:

```tsx
function hhmmToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(":").map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}
```

With:

```tsx
function hhmmToMinutes(hhmm: string): number {
	const parts = hhmm.split(":");
	const h = Number(parts[0]);
	const m = Number(parts[1]);
	if (!Number.isFinite(h) || !Number.isFinite(m)) {
		if (__DEV__) {
			console.warn(`[weekly-timetable] invalid time format: "${hhmm}"`);
		}
		return 0;
	}
	return h * 60 + m;
}
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/components/weekly-timetable.tsx
git commit -m "fix(native): validate hhmm format in weekly-timetable"
```

---

### Task 10: Normalize `serviceType` enum across flow contexts

**Files:**
- Modify: `apps/native/contexts/purchase-flow-context.tsx:16`
- Modify: `apps/native/contexts/booking-flow-context.tsx:10, 34`
- Modify: `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx:109-110, 119`

**Problem:** `PurchaseFlowState.serviceType` uses `"private" | "semi_private"`. `BookingFlowState.serviceType` uses `"private" | "semi-private" | "semi_private"`. The book-workout screen converts `semi_private` → `semi-private` at line 110 to satisfy the booking context union. This branch divergence is a frontend-only string mismatch — pick `"semi_private"` (the server form) and drop the hyphenated variant from booking context.

- [ ] **Step 1: Update `BookingFlowState.serviceType` union**

In `apps/native/contexts/booking-flow-context.tsx` line 10:

```tsx
	serviceType: "private" | "semi-private" | "semi_private";
```

Change to:

```tsx
	serviceType: "private" | "semi_private";
```

And line 34 (`initialState.serviceType: "private"`) stays as `"private"` — no change.

- [ ] **Step 2: Update book-workout conversion**

In `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx` lines 109-110:

```tsx
		const serviceType: "private" | "semi-private" =
			svc?.type === "semi_private" ? "semi-private" : "private";
```

Change to:

```tsx
		const serviceType: "private" | "semi_private" =
			svc?.type === "semi_private" ? "semi_private" : "private";
```

- [ ] **Step 3: Search for other consumers of the hyphenated variant**

Run: `cd /Users/voo/Developement/Work2/avantej-core && grep -rn '"semi-private"' apps/native/`
Expected: no remaining matches (or only inside display strings — UI labels are OK).

If matches in non-display logic remain, replace each with `"semi_private"`. Display labels like `service.type === "semi_private" ? "Semi-Private" : "Private"` should NOT change — those are user-facing labels.

- [ ] **Step 4: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/native/contexts/booking-flow-context.tsx apps/native/app/(app)/dashboard/book-workout/book-workout.tsx
git commit -m "fix(native): unify serviceType enum to underscore form"
```

---

### Task 11: Drop redundant deps in booking-flow useMemo

**Files:**
- Modify: `apps/native/contexts/booking-flow-context.tsx:67`

**Problem:** `useMemo(() => ({ state, update, reset }), [state, update, reset])` — `update` and `reset` are wrapped in `useCallback([])`, so their identity never changes. Including them in deps is harmless but noisy. Match the cleaner pattern from `purchase-flow-context.tsx:98-101`.

- [ ] **Step 1: Trim deps array**

The current code at line 67 is already identical to purchase-flow:

```tsx
	const value = useMemo(() => ({ state, update, reset }), [state, update, reset]);
```

`purchase-flow-context.tsx` uses the same pattern. **This is intentional** — including stable callbacks in deps is a lint-friendly pattern (`react-hooks/exhaustive-deps` requires it). Skip — no fix needed.

- [ ] **Step 2: Document and move on — no commit**

---

## Phase 3: Buy-Package Flow

### Task 12: Trainer "No Preference" should store `null`, not empty string

**Files:**
- Modify: `apps/native/app/(app)/dashboard/buy-package/trainer.tsx:91-97, 332-336`

**Problem:** When user picks "No Preference", `handleSelect({ id: "", name: "" })` runs, which calls `update({ preferredTrainerId: "", preferredTrainerName: "" })`. Downstream code in `pay.tsx:83` does `preferredTrainerId: state.preferredTrainerId ?? undefined` — `""` is truthy under `??`, so empty string passes through to the API as a "preferred trainer" with an invalid ID.

- [ ] **Step 1: Update `handleSelect` to accept null**

Replace lines 91-97:

```tsx
	const handleSelect = (trainer: { id: string; name: string }) => {
		update({
			preferredTrainerId: trainer.id,
			preferredTrainerName: trainer.name,
		});
		setSelectedTrainerId(trainer.id);
	};
```

With:

```tsx
	const handleSelect = (trainer: { id: string; name: string } | null) => {
		update({
			preferredTrainerId: trainer?.id ?? null,
			preferredTrainerName: trainer?.name ?? null,
		});
		setSelectedTrainerId(trainer?.id ?? null);
	};
```

- [ ] **Step 2: Update "No Preference" tap handler**

Replace lines 332-337:

```tsx
								<TouchableOpacity
									onPress={() => {
										handleSelect({ id: "", name: "" });
										setSelectedTrainerId(null);
										setDropdownOpen(false);
									}}
									className="border-b border-secondary-3 py-3"
								>
```

With:

```tsx
								<TouchableOpacity
									onPress={() => {
										handleSelect(null);
										setDropdownOpen(false);
									}}
									className="border-b border-secondary-3 py-3"
								>
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run the native app, walk through buy-package flow. On trainer screen, tap "No Preference", continue. On pay screen, confirm payload sent to `packageInstances.create` does NOT include `preferredTrainerId: ""` (use React DevTools or `console.log` on `state.preferredTrainerId` — should be `null`).

- [ ] **Step 5: Commit**

```bash
git add apps/native/app/(app)/dashboard/buy-package/trainer.tsx
git commit -m "fix(native): store null trainer id for No Preference selection"
```

---

### Task 13: Guarantee orientation unlock after sign modal closes

**Files:**
- Modify: `apps/native/app/(app)/dashboard/buy-package/sign.tsx:71-87`

**Problem:** `handleOpenSignatureModal` locks orientation to LANDSCAPE. `handleCloseSignatureModal` and `handleSignature` both call `unlockAsync()`. But if the user kills the app or navigates back via hardware button mid-modal, the unmount cleanup (lines 83-87) fires. The cleanup is correct but the **lock function itself** has no try/catch — if `lockAsync` throws (some devices reject orientation locks), the modal opens in portrait and `setShowSignatureModal(true)` still runs, leaving an inconsistent state.

- [ ] **Step 1: Wrap lock/unlock in try/catch**

Replace lines 71-87:

```tsx
	const handleOpenSignatureModal = async () => {
		await ScreenOrientation.lockAsync(
			ScreenOrientation.OrientationLock.LANDSCAPE,
		);
		setShowSignatureModal(true);
	};

	const handleCloseSignatureModal = async () => {
		setShowSignatureModal(false);
		await ScreenOrientation.unlockAsync();
	};

	useEffect(() => {
		return () => {
			ScreenOrientation.unlockAsync();
		};
	}, []);
```

With:

```tsx
	const handleOpenSignatureModal = async () => {
		try {
			await ScreenOrientation.lockAsync(
				ScreenOrientation.OrientationLock.LANDSCAPE,
			);
		} catch (err) {
			console.warn("[sign] failed to lock orientation", err);
		}
		setShowSignatureModal(true);
	};

	const handleCloseSignatureModal = async () => {
		setShowSignatureModal(false);
		try {
			await ScreenOrientation.unlockAsync();
		} catch (err) {
			console.warn("[sign] failed to unlock orientation", err);
		}
	};

	useEffect(() => {
		return () => {
			ScreenOrientation.unlockAsync().catch(() => {
				// Best-effort cleanup; ignore failures during unmount.
			});
		};
	}, []);
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/app/(app)/dashboard/buy-package/sign.tsx
git commit -m "fix(native): tolerate orientation lock failures in sign modal"
```

---

### Task 14: Fix step counter mismatch on pay screen

**Files:**
- Modify: `apps/native/app/(app)/dashboard/buy-package/pay.tsx:30-31`

**Problem:** `currentStep = 7; totalSteps = 8;` but `steps` array has 7 items (Setup through Done). Progress shows 7/8 = 87% on the second-to-last visual step, with Done at 100% — but a user is on step 6 (Pay) when this screen is open, not step 7. Inspect the active step: line 21 marks `Pay` as `active: true` at index 6 (number=6). So `currentStep` should be 6, `totalSteps` should be 7.

- [ ] **Step 1: Correct step counters**

Replace lines 30-31:

```tsx
	const currentStep = 7;
	const totalSteps = 8;
```

With:

```tsx
	const currentStep = 6;
	const totalSteps = 7;
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Walk through buy-package flow to pay screen. Confirm header reads "Step 6 of 7" and progress is 86% (since `Math.round((6/7)*100) = 86`).

- [ ] **Step 4: Commit**

```bash
git add apps/native/app/(app)/dashboard/buy-package/pay.tsx
git commit -m "fix(native): correct step counter on pay screen (6 of 7)"
```

---

### Task 15: Fix plan.tsx auto-skip stale closure

**Files:**
- Modify: `apps/native/app/(app)/dashboard/buy-package/plan.tsx:56-61`

**Problem:** `useEffect(() => { ... }, [])` with `eslint-disable-line react-hooks/exhaustive-deps` reads `availablePlans` on mount only. If a parent passes new `availablePaymentPlans` mid-flight (e.g. context update after stripe webhook), the skip logic misses the new value. Even though `state.availablePaymentPlans` is set in `setup.tsx` and won't change before plan.tsx mounts in this flow, the eslint suppression hides intent. Replace with a real dep.

- [ ] **Step 1: Add `availablePlans` to deps and drop the eslint-disable**

Replace lines 56-61:

```tsx
	// If no plans or only 'full', auto-skip this screen
	useEffect(() => {
		if (availablePlans.length === 0 || (availablePlans.length === 1 && availablePlans[0] === "full")) {
			update({ paymentPlanType: "full" });
			router.replace("./review");
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

With:

```tsx
	// If no plans or only 'full', auto-skip this screen.
	// Refs: a ref guard prevents the effect from triggering twice if React StrictMode
	// double-mounts.
	const autoSkippedRef = useRef(false);
	useEffect(() => {
		if (autoSkippedRef.current) return;
		if (
			availablePlans.length === 0 ||
			(availablePlans.length === 1 && availablePlans[0] === "full")
		) {
			autoSkippedRef.current = true;
			update({ paymentPlanType: "full" });
			router.replace("./review");
		}
	}, [availablePlans, update]);
```

Also add `useRef` to the React import at the top:

```tsx
import { useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/app/(app)/dashboard/buy-package/plan.tsx
git commit -m "fix(native): guard plan.tsx auto-skip with ref to avoid double-fire"
```

---

### Task 16: Remove non-null assertion in setup.tsx query input

**Files:**
- Modify: `apps/native/app/(app)/dashboard/buy-package/setup.tsx:68-73`

**Problem:** `categoryId: selectedCategoryId!` non-null assertion paired with `enabled: !!selectedCategoryId`. The query is correctly gated, but the assertion lies to the type system. If `enabled` is removed or refactored, the query fires with `null` and the assertion becomes a runtime crash.

- [ ] **Step 1: Replace assertion with a safe fallback**

Replace lines 68-73:

```tsx
	const { data: services, isLoading: servicesLoading } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId, categoryId: selectedCategoryId! },
		}),
		enabled: !!selectedCategoryId,
	});
```

With:

```tsx
	const { data: services, isLoading: servicesLoading } = useQuery({
		...orpc.services.list.queryOptions({
			input: { organizationId, categoryId: selectedCategoryId ?? "" },
		}),
		enabled: !!selectedCategoryId,
	});
```

The empty string is never sent because `enabled: false` blocks the query — but the type is now honest.

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/native/app/(app)/dashboard/buy-package/setup.tsx
git commit -m "fix(native): drop non-null assertion on services list query input"
```

---

### Task 17: Replace `any` casts on service objects in book-workout

**Files:**
- Modify: `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx:70-91`

**Problem:** `serviceById` is `Map<string, any>`, and every read uses `(s as any).field`. Loses all type safety. Add a minimal local type for the service shape used here. The actual API return type comes from oRPC, but we can describe what this screen needs.

- [ ] **Step 1: Add a local `Service` type and replace `any`**

After the imports block (after line 19), add:

```tsx
type ServiceLite = {
	id: string;
	name: string | null;
	type: "private" | "semi_private" | null;
	categoryId: string | null;
	branchId: string | null;
	schedulingType: "appointment" | "class_slot" | null;
	timePresetConfig: {
		recurringDays: string[];
		timeSlotsPerDay: Record<string, string[]>;
	} | null;
	duration: number | null;
	description: string | null;
};
```

Replace lines 70-74:

```tsx
	const serviceById = useMemo(() => {
		const map = new Map<string, any>();
		for (const s of (services as any[]) ?? []) map.set(s.id, s);
		return map;
	}, [services]);
```

With:

```tsx
	const serviceById = useMemo(() => {
		const map = new Map<string, ServiceLite>();
		for (const s of (services as ServiceLite[] | undefined) ?? []) {
			map.set(s.id, s);
		}
		return map;
	}, [services]);
```

Replace lines 80-84:

```tsx
	const fallbackBranchId = useMemo(() => {
		const list = (services as any[]) ?? [];
		for (const s of list) if (s?.branchId) return s.branchId as string;
		return null;
	}, [services]);
```

With:

```tsx
	const fallbackBranchId = useMemo(() => {
		const list = (services as ServiceLite[] | undefined) ?? [];
		for (const s of list) if (s.branchId) return s.branchId;
		return null;
	}, [services]);
```

Replace line 88:

```tsx
		return (packageInstances as any[]).find(
```

Leave the packageInstances `any` cast alone for this task — it's a different API and out of scope.

- [ ] **Step 2: Type-check**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS. (If the oRPC return type differs from `ServiceLite`, narrow `ServiceLite` until the cast compiles — but do not change the API.)

- [ ] **Step 3: Commit**

```bash
git add apps/native/app/(app)/dashboard/book-workout/book-workout.tsx
git commit -m "fix(native): type service map in book-workout instead of any"
```

---

## Phase 4: Registration Form

### Task 18: Preserve user-edited email in registration auto-fill

**Files:**
- Modify: `apps/native/components/registration-form.tsx:1036-1045`

**Problem:** The auto-fill effect runs whenever `user`, `userFirstName`, or `userLastName` change. The merge `email: prev.email || user.email || ""` only overwrites if `prev.email` is empty. That's actually correct — `||` shortcuts when `prev.email` has a value. **Re-read the reviewer note: this is a false alarm.** The current code does NOT overwrite — `prev.email || user.email` keeps `prev.email` when it's truthy.

- [ ] **Step 1: Verify behavior by reading the code**

Run: `cd /Users/voo/Developement/Work2/avantej-core && sed -n '1036,1046p' apps/native/components/registration-form.tsx`
Expected: confirms `email: prev.email || user.email || ""` short-circuits on `prev.email`.

- [ ] **Step 2: Skip — no fix needed**

Mark this finding as a false positive in the task tracker. No commit.

---

## Phase 5: Verification

### Task 19: Full type-check + lint pass

**Files:** None (verification only)

- [ ] **Step 1: Type-check the whole monorepo**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check-types`
Expected: PASS — zero new errors.

- [ ] **Step 2: Lint with Biome**

Run: `cd /Users/voo/Developement/Work2/avantej-core && bun check`
Expected: PASS — zero new violations in native files. If Biome auto-fixes whitespace, accept it. If it reports semantic issues, fix them inline.

- [ ] **Step 3: Manual smoke test of buy-package flow**

Run: `cd /Users/voo/Developement/Work2/avantej-core/apps/native && bun expo start`

Walk through:
1. Sign in as test client.
2. Go to Buy Package → Setup → pick category and service → Continue.
3. Trainer screen: default is "No Preference" → Continue.
4. Schedule: pick at least one preferred time → Continue.
5. Info: optional remark → Continue.
6. Plan (auto-skip if only "full" plan): otherwise pick plan → Continue.
7. Review → Continue.
8. Sign: tap signature pad, sign in landscape, confirm, agree to terms → Proceed to Payment.
9. Pay: confirm header reads "Step 6 of 7", "Pay" highlighted → tap Pay.
10. Done: confirm success screen.

Expected: no crashes, no orientation flicker, "Pay 6 of 7" displays correctly, server receives `preferredTrainerId: null` (not `""`) when user picked No Preference.

- [ ] **Step 4: Sign out and back in**

Confirm logout clears cache and no stale data appears post-logout. Re-login confirms userContext refetches.

---

## Summary

- **Total tasks:** 19 (15 fixes + 4 verifications/false-positive checks)
- **Files touched:** 16
- **Estimated time:** 2-3 hours including manual verification
- **Risk:** Low — every fix is surgical and frontend-only. No schema/API touched.

**Excluded findings (false positives confirmed by re-reading code):**
- `pay.tsx:69` — already wraps mutation in `try/catch/finally`.
- `registration-form.tsx:1047` — `useState(getDefaultCountry)` is lazy initializer, React calls fn once.
- `registration-form.tsx:1042` — `prev.email || user.email` already preserves user edits.
- `dashboard/index.tsx:238` — `query.queryKey[0]` access is already correct.
- `booking-flow-context.tsx:67` — useMemo deps match purchase-flow pattern; intentional.
