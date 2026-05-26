# Domain Re-Audit: auth-customers (2026-05-27)

## callbackURL fix verification

**Verdict: PARTIAL — fix is correct for `sendClaimLink` but the same bug class persists in two sibling procedures.**

### Evidence

The fix at `apps/server/src/routers/customer-profiles.ts:848-852` is syntactically correct and type-safe:

```typescript
const frontendURL =
    getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3021";
await (auth as any).api.signInMagicLink({
    body: { email: input.email, callbackURL: `${frontendURL}/dashboard` },
    headers: context.honoContext.req.raw.headers,
});
```

1. **Syntactically correct**: `getEnvVar()` (lines 31-39) is a valid helper that tries `cloudflare:workers` env first and falls back to `process.env`. TypeScript compiles cleanly because the helper is defined in the same file and the `(auth as any)` cast already existed.

2. **Redirect-to-server-root bug resolved**: Before this fix, `signInMagicLink` with no `callbackURL` sent users to the Better-Auth server root (port 3020) after clicking the magic link. The fix sends `/dashboard` on the frontend origin instead. This is the correct production behavior.

3. **Edge cases:**

   - **Trailing slash on `CORS_ORIGIN`**: If `CORS_ORIGIN=https://app.example.com/`, the constructed URL becomes `https://app.example.com//dashboard`. This is a double-slash which browsers normalize, but Better-Auth's `trustedOrigins` check (line 188 of `better-auth.ts`) compares the raw env value, so this is unlikely to cause a trust failure. Low risk — the value is operator-controlled and documented in `.env.example` without a trailing slash. Not a blocking issue.
   - **`CORS_ORIGIN` containing a path**: Not a realistic risk — the env var is expected to be an origin (scheme + host + optional port), not a path. The `.env.example` and `wrangler.jsonc` confirm this expectation.
   - **Default port mismatch**: The fallback is `http://localhost:3021` (correct — web dev port). Other `getEnvVar` usages in sibling files use `http://localhost:3001` (old port). The fallback here is correct for this procedure.

4. **Incomplete fix — sibling procedures still lack `callbackURL`:**

   - `addEmailAndDispatchMagicLink` (line 531): `signInMagicLink` body has **no `callbackURL`**. This is a separate staff-facing flow for GHL leads (non-unclaimed placeholder emails), and the same redirect-to-server-root bug applies.
   - `resendMagicLink` (line 617): `signInMagicLink` body has **no `callbackURL`**. This is the generic resend path. Same bug.

---

## New / remaining findings

### AC-05 — `resendMagicLink` missing `callbackURL`

- **File**: `apps/server/src/routers/customer-profiles.ts:617`
- **Severity**: P2
- **Status**: missing
- **Testable**: true
- **Note**: `signInMagicLink` called without `callbackURL`; magic link redirects customer to server root (port 3020) instead of the frontend `/dashboard`. Sibling fix in `sendClaimLink` was not applied here.
- **Persistence**: none (no DB write; dispatch-only)

### AC-06 — `addEmailAndDispatchMagicLink` missing `callbackURL`

- **File**: `apps/server/src/routers/customer-profiles.ts:531`
- **Severity**: P2
- **Status**: missing
- **Testable**: true
- **Note**: Same root cause as AC-05. Staff flow for GHL placeholder-email leads — after clicking the magic link the customer lands on the server root, not the dashboard. The `sendClaimLink` fix was not propagated to this sister procedure.
- **Persistence**: none (the email update to the CP user is persisted, but the missing `callbackURL` only affects the dispatch URL, not DB state)

### AC-07 — `email` param accepted in `createUnclaimed` but silently ignored

- **File**: `apps/server/src/routers/customer-profiles.ts:647`
- **Severity**: P2
- **Status**: missing
- **Testable**: true
- **Note**: `z.string().email().optional()` is declared in the input schema and accepted by the handler. The handler never reads `input.email` — the placeholder email `unclaimed-{uuid}@avantej.placeholder` is always used regardless. Callers who pass `email` believing it will be stored or used to pre-fill `sendClaimLink` are silently misled. The param is dead code. Either document that the field is reserved for future use, remove it, or use it to pre-populate the real email on the CP user immediately.
- **Persistence**: no — the passed email is never written anywhere

### AC-08 — `softDelete` has no guard for unclaimed profiles

- **File**: `apps/server/src/routers/customer-profiles.ts:196`
- **Severity**: P3
- **Status**: missing
- **Testable**: true
- **Note**: `softDelete` performs `SET is_deleted=true` with `WHERE user_id = targetUserId` (line 243). There is no check whether `is_unclaimed=true`. A staff member with `customer_management:delete` can soft-delete a not-yet-claimed profile, which leaves a dangling control-panel user row (the placeholder email user) with no cleanup and no claim path. The `sendClaimLink` guard at line 789 correctly blocks sending a claim link to already-deleted profiles via the `isUnclaimed` check, but there is no symmetric guard on `softDelete` to prevent deleting an unclaimed profile before it has been claimed.
- **Persistence**: yes — writes `is_deleted=true` + `deleted_at` + `deleted_source='avantej'` to `customer_profiles`; the corresponding CP `user` row with placeholder email is **not** cleaned up in any code path

### AC-09 — `dateOfBirth` `z.string().datetime()` blocks plain date strings

- **File**: `apps/server/src/routers/customer-profiles.ts:649`
- **Severity**: P3
- **Status**: partial
- **Testable**: true
- **Note**: Zod 4.x `z.string().datetime()` requires a full ISO 8601 datetime string with time component (e.g. `2000-01-15T00:00:00Z`). Plain date strings like `"2000-01-15"` are rejected by the schema. The handler then calls `new Date(input.dateOfBirth)` which would produce a valid Date from a datetime string, but if the frontend sends `"2000-01-15"` (date-only, which is the UI convention for date-of-birth pickers), Zod rejects it before the handler runs, surfacing a `BAD_REQUEST`. The `upsertForCustomer` sibling at `packages/api/src/routers/customer-profiles.ts:131` already uses `z.string().nullable().optional()` (no `.datetime()`) precisely for this reason. The inconsistency means `createUnclaimed` is more restrictive than the update path without justification.
- **Persistence**: no — validation fires before any DB write

### AC-10 — `createUnclaimed` race on placeholder email uniqueness

- **File**: `apps/server/src/routers/customer-profiles.ts:694`
- **Severity**: P3
- **Status**: partial
- **Testable**: false
- **Note**: Placeholder email `unclaimed-{randomUUID()}@avantej.placeholder` is generated (line 694) then inserted into the CP `user` table without a prior uniqueness check. UUID v4 collision probability is ~2^-61 per pair, effectively zero in practice. However, the insert at line 700 does not use `onConflictDoNothing` or `onConflictDoUpdate`, so if a collision ever occurred it would throw an unhandled DB unique-constraint violation (HTTP 500 with an opaque error). The `customerProfiles` insert at line 725 correctly has a unique partial index (`WHERE user_id IS NOT NULL`) but the CP insert does not. Risk is negligible but the error surface is ugly if hit.
- **Persistence**: yes — CP `user` row is written on success

---

## Summary

- **Fix verified as correct for `sendClaimLink`**: The `callbackURL` is properly constructed from `CORS_ORIGIN || FRONTEND_URL || localhost:3021` and appended with `/dashboard`. Syntax is clean, type-safe, and the redirect-to-server-root bug is resolved for this specific procedure.

- **Two sibling procedures carry the same bug (AC-05, AC-06)**: `resendMagicLink` and `addEmailAndDispatchMagicLink` both dispatch magic links without `callbackURL`. Customers clicking those links land on the server root (port 3020). These are P2 and straightforward one-line fixes mirroring the already-merged pattern.

- **Dead `email` parameter in `createUnclaimed` (AC-07)**: The optional `email` input is accepted and ignored, misleading callers about what the procedure does with a pre-known email. P2 — either honour it or remove it.

- **`softDelete` lacks an unclaimed guard (AC-08)**: Unclaimed profiles can be soft-deleted, leaving orphaned CP user rows with placeholder emails and no cleanup path. P3 — low probability in practice but leaves data inconsistency.

- **`dateOfBirth` validator is too strict in `createUnclaimed` (AC-09)**: `z.string().datetime()` rejects plain date strings; the sibling update procedure uses a looser schema. P3 — UI breakage possible.
