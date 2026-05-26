# Iteration 1 — 2026-05-27

## Trigger
sendClaimLink callbackURL fix in prior conversation → incremental re-audit found same bug class in 2 sibling procedures + 3 additional gaps.

## Changes this iteration

### apps/server/src/routers/customer-profiles.ts
- `sendClaimLink`: already fixed in prior conversation (callbackURL: frontendURL/dashboard)
- `resendMagicLink` (AC-05): added `callbackURL: \`${frontendURL}/dashboard\`` to signInMagicLink body + getEnvVar frontendURL lookup
- `addEmailAndDispatchMagicLink` (AC-06): same fix
- `createUnclaimed` input schema (AC-07): removed dead `email: z.string().email().optional()` param; changed `dateOfBirth: z.string().datetime().optional()` → `z.string().optional()` (AC-09)
- `softDelete` (AC-08): added isUnclaimed guard before update — throws BAD_REQUEST if profile.isUnclaimed=true

## Targets resolved: 5 (AC-05, AC-06, AC-07, AC-08, AC-09)
## Targets deferred: 1 (AC-10 — cosmetic)
