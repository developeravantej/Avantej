# 2026-04-18 — Better-Auth Seed-Data Fix

**Impact:** test-ability of half the admin-flow suite.
**Severity (in prod):** low — production users are created through Better-Auth's own sign-up/invite flows. This bug only affects seeded users created directly in the DB.
**Severity (in dev):** high — seeded trainer/staff/client credentials returned HTTP 500 on login, silently blocking any protocol that required a non-admin role.

---

## Symptom observed during testing

`POST /api/auth/sign-in/email` with `trainer.deterministic@test.com / password123` returned HTTP 500 with an **empty body** (no JSON error). The same endpoint with `franchisee@gmail.com / password123` returned 200 with a session token.

All three seeded users (trainer, staff, client) exhibited the same 500. Franchisee (seeded via a different code path before this repo adopted the deterministic trainer/staff fixtures) worked.

## Root cause — two compounding bugs

### Bug 1 — `account.accountId` stored as email instead of `user.id`

Better-Auth's `drizzleAdapter` for the credential provider expects `account.accountId == user.id` (see `better-auth/dist/api/routes/sign-in.mjs:212` — `findUserByEmail(email, { includeAccounts: true })` and line 218 — `credentialAccount = user.accounts.find(a => a.providerId === "credential")`).

**Evidence (state inspection pre-fix):**

| User | `account.accountId` |
|---|---|
| `franchisee@gmail.com` (works) | `wZGQSvB1v2xWt3NwcSV0DYvRDQLxldkH` ← the user's `id` |
| `trainer.deterministic@test.com` (fails) | `trainer.deterministic@test.com` ← the email |
| `staff.deterministic@test.com` (fails) | `staff.deterministic@test.com` |
| `e2e.client@test.com` (fails) | `e2e.client@test.com` |

Setting `accountId` to the email doesn't block lookup by itself, but combined with bug 2 it contributes to the unhelpful 500.

### Bug 2 — passwords hashed with bcrypt, but Better-Auth verifies with scrypt

`better-auth/dist/crypto/password.mjs` uses `@noble/hashes/scrypt`:

```js
const hashPassword = async (password) => {
    const salt = hex.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = await generateKey(password, salt);  // scryptAsync
    return `${salt}:${hex.encode(key)}`;
};
const verifyPassword = async ({ hash, password }) => {
    const [salt, key] = hash.split(":");
    if (!salt || !key) throw new BetterAuthError("Invalid password hash");
    return constantTimeEqual(await generateKey(password, salt), hexToBytes(key));
};
```

The seed stored passwords with:

```ts
const bcrypt = await import("bcryptjs");
const hashedPassword = await bcrypt.default.hash(TRAINER_PASSWORD, 10);
```

bcrypt output looks like `$2b$10$...` — no `:` separator. When Better-Auth's `verifyPassword` runs `hash.split(":")`, the second part is `undefined`, triggering `throw new BetterAuthError("Invalid password hash")`. That exception escaped the route handler and surfaced as an opaque HTTP 500.

## Why franchisee worked

The franchisee user pre-dates the deterministic seed code path — it was created by Better-Auth's own sign-up flow at some earlier point (hence `id` in nanoid format `wZGQSvB1v2xWt3NwcSV0DYvRDQLxldkH`, not UUID; and `accountId = user.id`; and scrypt-hashed password). The seed's `Steps 8/9/12` additive path created the trainer/staff/client from scratch using the wrong primitives.

## Fix

### Code change — `apps/server/scripts/seed-business-data.ts`

1. Added top-level import:
   ```ts
   import { hashPassword } from "better-auth/crypto";
   ```
2. Removed 6 inline `const bcrypt = await import("bcryptjs");` statements.
3. Replaced 6 `bcrypt.default.hash(XX_PASSWORD, 10)` calls with `hashPassword(XX_PASSWORD)`.
4. Replaced 6 `accountId: XX_EMAIL.toLowerCase()` with `accountId: xxUserId`.

Net: one new import; six-plus-six edits across the trainer/staff/client new-user and backfill branches.

### One-shot backfill for existing dev DBs

Two scripts created so teammates don't need to re-seed from scratch:

1. **`apps/server/scripts/backfill-seed-auth-accountid.ts`** — updates `account.accountId` from email to `user.id` for the 3 seed emails. Idempotent — prints `OK` for rows already correct and `FIX` for rows it updated.

2. **`apps/server/scripts/backfill-seed-auth-passwords.ts`** — rehashes the 3 seed passwords using `hashPassword` from `better-auth/crypto` and writes the new hash to `account.password`. Idempotent — safe to re-run; always overwrites with a fresh scrypt salt.

Run order (first-time repair on an existing DB):
```bash
cd apps/server
bun run scripts/backfill-seed-auth-accountid.ts
bun run scripts/backfill-seed-auth-passwords.ts
```

## Verification

```
// Pre-fix
{ staff: 500, client: 500, trainer: 500 }

// Post-fix (after running both backfill scripts once)
{ staff: 200, client: 200, trainer: 200 }
```

Session cookie is set, user object is returned in the response body. The seed script remains idempotent when re-run (existing-user branch taken for all three).

## Follow-up (not blocking)

- `bcryptjs` is still declared in `apps/server/package.json` dependencies. No code in the repo imports it after this change. A cleanup PR could drop it. Left in place this session because removing it would require a `bun install` pass and a review of whether any other seed variant uses it.
- Consider adding an early-exit check in the seed: if a row with `providerId: "credential"` exists but `password` doesn't start with `<hex 16-byte salt>:`, log a warning and call backfill automatically. Would prevent future regressions if the hash algo is ever swapped again.
