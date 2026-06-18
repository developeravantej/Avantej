# Type-Safety Audit — Shared select-chain mock helper + tenant-middleware refactor

**Auditor:** TypeScript type-safety
**Plan:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/prompts/06-05_18-33_server-holding-it-back.md`
**Scope checked:** `apps/server/src/tests/helpers/db-mock.factory.ts`, ~16 local `selectChainResolving`/`sel` copies, `apps/server/src/middleware/orpc-tenant.middleware.ts`
**check-types run:** No (per instructions — reasoned from source).

---

## Verdict (headline)

A single shared `selectChainResolving` helper **will type-check at all ~16 call sites** — but **only because every call site's `mockDb` is `any`**, not because the signatures are compatible. The factory's `createMockTenantDb()` ends with `return instance as any` (line 123), so `mockDb.select` is `any`, and `mockDb.select.mockReturnValueOnce(...)` accepts **any argument** regardless of the helper's declared return type. No generic `<T>` and no `as any` at the call sites is required for the assignment to compile.

The real risk is **not** type errors — it is **behavioral divergence** between the local copies that a single shared body cannot reproduce. Two of the copies (`payouts`, `commission-splits`) have semantically different `.for`/`.as` implementations. If Task A replaces those with the canonical helper, the tests will **fail at runtime** (not at compile time). That is the finding that matters.

---

## Findings

### [HIGH] `.for` / `.as` behavior diverges across copies — shared body breaks runtime, not types
The local copies are **not** uniform:

| File | `.for` returns | `.as` present? | `.as` returns |
|---|---|---|---|
| `db-mock.factory.ts` `createSelectChain` (L4–29) | chain | no | — |
| `analytics.test.ts:11` | chain | no | — |
| `announcements.test.ts:17` | chain | no | — |
| `waitlist.test.ts:21` (`rows: unknown[]`) | chain | no | — |
| `commission-diff-harness.test.ts:71` (`sel`) | chain | no | — |
| `payouts.test.ts` (L42–49) | **`Promise.resolve(value)`** | yes | chain |
| `commission-splits.test.ts` (L33–46) | chain | yes | **`{ total: sql.raw(...), splitId: sql.raw(...) }`** |

The plan's Task A says cover "`.where/.orderBy/.limit/.for/.as`". A naive canonical helper (e.g. all methods → chain, plus a generic `.as` → chain) **cannot** satisfy:
- **payouts**: `runBatch` does `SELECT ... FOR UPDATE` and awaits `.for("update")` directly — the canonical `.for → chain` would return the chain (which is thenable and resolves to `value`, so it may *accidentally* still work), but the intent is `.for` resolving to `value`. Subtle; verify by running `payouts.test.ts` after swap.
- **commission-splits**: `liabilitySummary` interpolates `subquery.as("rev").total` / `.splitId` into a `sql` template. The canonical `.as → chain` returns a chain with **no `.total`/`.splitId`** → `sql.raw(undefined)` / template throws at runtime. This test **will break** if the shared helper is substituted.

**Recommendation:** Leave `payouts.test.ts` and `commission-splits.test.ts` on their bespoke helpers, OR make the shared helper accept an options bag (`{ asResult?, forResolves? }`). Do **not** count these two toward the "~16 replaced" total. The plan's own constraint ("behavior-preserving … keep the exact same set") applies to test behavior here too.

### [MEDIUM] `value: unknown` vs `rows: unknown[]` signature divergence
`waitlist.test.ts:21` types the parameter `rows: unknown[]`; everyone else uses `value: unknown`. A shared signature must be `value: unknown` (the **wider** type) to cover both. Call sites pass arrays everywhere, so widening to `unknown` is safe and requires **no call-site edits**. If the author instead picks `unknown[]` for the shared signature, then any call site that ever passes a non-array (none observed today, but `commission-diff-harness`'s `sel(value)` passes `[{...}]` arrays only) stays fine — but `unknown[]` is the more fragile choice. **Pick `value: unknown`.**

### [MEDIUM] Return type of the shared helper — declare it `unknown` or keep inferred, do NOT annotate as a Drizzle builder type
The helper returns `Record<string, unknown>` augmented with a hand-rolled `.then`. If the author annotates the return as anything narrower (e.g. tries to satisfy Drizzle's `PgSelect`), it will **fail check-types** because the hand-rolled chain is missing dozens of builder members. Since `mockDb.select` is `any`, the inferred `Record<string, unknown>`-ish return assigns cleanly into `.mockReturnValueOnce(...)`. **Keep the return inferred (or explicitly `unknown`); add no builder typing.** No `<T>` generic is needed — the resolved value type is never consumed by the caller (services `await` it and the result flows into `any`).

### [LOW] Some copies include extra chain methods the factory's `createSelectChain` lacks
`commission-diff-harness.test.ts` `sel` and `analytics`/`category-commission` copies include `offset`, `leftJoin`, `innerJoin`, `groupBy`, `having`; the factory's internal `createSelectChain` (L6–21) includes them too, but the plan's task text only enumerates "`.where/.orderBy/.limit/.for/.as`". Ensure the **exported** helper includes the **superset** actually used: `from, where, orderBy, limit, offset, leftJoin, innerJoin, groupBy, having, for` (and optionally `as`). Omitting `groupBy`/`leftJoin` would runtime-break `commission-diff-harness` and analytics. Type-safe either way (chain is `any` to the service), but functionally required.

---

## Middleware (Task C) — unsafety inventory

`orpc-tenant.middleware.ts` (286 LOC). Existing unsafety to be aware of so the refactor does not spread it:

- **`as` casts:** 1 — `(c.env as Record<string, unknown>)` at **L225** (the `INSTALLMENTS_LOCK_ON_OPEN` read). This is the established pattern.
- **`: any`:** 1 — `let body: any` at **L41**. `rpcPayload = body` (L62) and all `rpcPayload?.…` reads (L83–85) are therefore `any`.
- **`// @ts-ignore` / `// @ts-expect-error`:** 0.
- **Non-null `!` assertions:** 0.

### [MEDIUM] Task C predicate extraction will inherit `any` from `body`/`rpcPayload`
The public-endpoint consolidation (Task 5) merges the path check (L28–32) with the method check (L89–102). The method check reads `method` derived from `rpcPayload?.method` — i.e. `any`. If the author extracts a helper like `isPublicEndpoint(path: string, method: string | undefined)`, **type the parameters explicitly** (`path: string`, `method?: string`) so the `any` is contained at the call boundary rather than flowing into the new predicate. `c.req.path` is already `string` (safe); `method` should be coerced (`String(method ?? "")`, mirroring L125's `methodStr`) before being passed in. Flagging because a careless `isPublicEndpoint(c.req.path, rpcPayload.method)` would make the new shared predicate `any`-typed — net-new unsafety, which the plan forbids ("should not ADD new unsafety").

### [INFO] New debug-flag gating for `console.log` — follow the L225 `c.env` cast pattern
`c.env` is **not** strongly typed here (it's cast at L225). For Task 5's "gate the success `console.log` behind a debug flag", read it the same way:
```ts
const debugTenantMw = (c.env as Record<string, unknown>)?.DEBUG_TENANT_MW === "true";
```
Do **not** invent a typed `c.env.DEBUG_TENANT_MW` access — that would fail check-types (Hono's `Env` binding for this app does not declare it). One cast, consistent with the existing line. The unconditional `console.log` at **L200–203** ("✅ Tenant DB set up …") is the one the plan calls out; note there are **also** unconditional `console.log`s at L109 (already guarded by `isInvitationPublicEndpoint`), L249–251, and L255–257 — if "no unconditional happy-path log" is the bar, L249–257 also fire on the happy path and should be gated too.

---

## Answers to the specific checks

1. **Will the promoted helper type-check at ~16 sites?** Yes. `mockDb.select` is `any` (factory returns `as any`), so `.mockReturnValueOnce(helper(...))` accepts any return. **No `<T>` generic and no `as any` at call sites needed.** (The "type safety" here is illusory — it compiles because the mock is untyped, not because shapes match.)
2. **Signature divergence (`value: unknown` vs `rows: unknown[]`):** Real but trivially reconcilable — use `value: unknown` (wider). No call-site changes. Flagged MEDIUM.
3. **Middleware `as any` count / inheritance:** `body: any` (L41) + `(c.env as …)` (L225); 0 ts-ignore; 0 `!`. The predicate extraction can inherit `any` from `rpcPayload.method` — type the extracted helper's params explicitly. Flagged MEDIUM.
4. **Does check-types currently pass?** Not run (expensive). Source review shows no obvious pre-existing type error in these files; the `as any` returns and `body: any` are intentional and compile.
5. **`c.env` typed?** No — it's cast as `Record<string, unknown>` at L225. New `DEBUG_TENANT_MW` flag must use the same cast. Flagged INFO.

---

## Severity summary

| ID | Sev | One-liner |
|---|---|---|
| F1 | HIGH | `payouts`/`commission-splits` `.for`/`.as` diverge — shared body breaks them at **runtime** (not compile); exclude or parameterize |
| F2 | MEDIUM | Shared signature must be `value: unknown`, not `rows: unknown[]` |
| F3 | MEDIUM | Keep helper return inferred/`unknown`; do not annotate as Drizzle builder (would fail check-types) |
| F4 | MEDIUM | Task C predicate extraction can spread `any` from `rpcPayload.method` — type params explicitly |
| F5 | LOW | Exported helper must include the **superset** of chain methods (`groupBy`/`leftJoin`/`offset`…) actually used, else runtime break |
| F6 | INFO | New debug flag must use `(c.env as Record<string, unknown>)` cast (L225 pattern); L249–257 also log on happy path |

**No CRITICAL (nothing fails check-types).** The single highest-value takeaway: the shared helper is type-safe to drop in everywhere, but **`payouts.test.ts` and `commission-splits.test.ts` must not be naively converted** — their `.for`/`.as` semantics differ and the failure surfaces as a green-suite regression, not a type error.
