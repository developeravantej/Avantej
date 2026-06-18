# Domain audit-customers

## Endpoints / Procedures

### auth.ts (3)
- login: Sign in with email/password
- userContext: Get user context, orgs, hierarchy, permissions
- verifyEmail: Verify email via token

### customer-profiles.ts (9)
- upsert: Upsert own profile + GHL sync
- upsertForCustomer: Staff edits profile + GHL sync
- softDelete: Mark isDeleted=true + GHL delete
- restore: Clear isDeleted flag
- retryGhlSync: Manually retry GHL
- addEmailAndDispatchMagicLink: Replace placeholder email
- resendMagicLink: Send sign-in link
- createUnclaimed: Create placeholder customer
- sendClaimLink: Send claim email

### invitations.ts (3)
- sendEmail: Send invitation email
- accept: Accept invitation + create member + GHL sync
- acceptWithSignup: Atomic signup + accept + GHL sync

### customer-directory.ts (3)
- list: Paginated list with aggregates
- getStats: KPI aggregates
- getById: Full detail + scope check

### households.ts (5)
- create: Create household
- addMember: Add profile to household
- removeMember: Remove profile
- get: Fetch household
- list: List households

### members/ (11)
- create, list, getById, updateRole, updateScope, suspend, deactivate, softDelete, restore, remove, retryGhlSync

### member-profiles.ts (2)
- get, upsert

### user-activity-log.ts (1)
- list: List activity for user

### walk-in-customers.ts (5)
- list: STUB (empty), getById/create/update/deactivate: DEPRECATED, convertToPackage

## Gaps (P1/P2/P3)

P1 - GHL sync failure silent in accept/acceptWithSignup [status: partial | testable: true]
  File: apps/server/src/routers/invitations.ts:186-213, 399-424
  Issue: fireCustomerSync() errors swallowed, returns success:true regardless
  Why: Invitation acceptance should be transactional; half-baked customers if GHL fails
  Persistence: members, customer_profiles created; ghl_contact_links missing

P1 - Missing email trigger in createUnclaimed [status: partial | testable: true]
  File: apps/server/src/routers/customer-profiles.ts:630-740
  Issue: Placeholder user created but no verification/claim email sent
  Why: Dead-end state; staff must manually call sendClaimLink() afterward
  Persistence: user row exists with emailVerified=false (incomplete)

P1 - Placeholder email collision risk [status: partial | testable: true]
  File: apps/server/src/routers/customer-profiles.ts:684
  Issue: unclaimed-{randomUUID()}@avantej.placeholder, no collision check
  Why: Rare but possible; silent member creation failure if collision occurs

P2 - Households.list privilege escalation [status: partial | testable: true]
  File: packages/api/src/routers/households.ts:247-269
  Issue: Non-admin with empty accessibleNodeIds gets all households
  Fix: Return [] when scopeNodeIds null and caller not admin
  Testable: Create non-admin with empty accessibleNodeIds, verify returns []

P2 - Soft-delete unreachable from is_unclaimed=true [status: partial | testable: true]
  File: apps/server/src/routers/customer-profiles.ts:779
  Issue: Once sendClaimLink flips isUnclaimed=false, no path to isDeleted or archival
  Why: Lifecycle incomplete; stale unclaimed accounts stuck forever

P2 - walk-in-customers.list static empty [status: partial | testable: true]
  File: packages/api/src/routers/walk-in-customers.ts:16-18
  Issue: list() stubbed to return empty, bypasses deprecated-endpoint pattern
  Testable: Call list(), verify returns empty and does not throw

P3 - Audit log missing in updateRole [status: partial | testable: true]
  File: packages/api/src/routers/members/role.procedures.ts:100
  Issue: updateRole() does not call writeAudit(); updateScope() does
  Testable: Call updateRole(), query audit_logs, verify no entry

P3 - Missing null-check in dateOfBirth [status: partial | testable: true]
  File: apps/server/src/routers/customer-profiles.ts:147-154
  Issue: new Date("invalid-date") creates Invalid Date without throwing
  Testable: Call upsertForCustomer with dateOfBirth="not-a-date"

P3 - Email parameter unused in createUnclaimed [status: partial | testable: true]
  File: apps/server/src/routers/customer-profiles.ts:637
  Issue: email: z.string().email().optional() accepted but never used
  Fix: Remove optional parameter or use to dispatch verification email

## Summary

Biggest gaps:
1. GHL sync failures silent in accept/acceptWithSignup (P1, critical)
2. Unclaimed customer creation has no email trigger (P1, UX)
3. Households.list privilege escalation (P2, security)
4. Audit log missing for updateRole (P3)
5. Placeholder email collision risk (P1, rare)

Testable findings: 17 endpoints testable for CRUD, lifecycle gaps, error handling
Codebase cleanliness: No stubs/TODO/FIXME in owned files; consistency issues in error handling
