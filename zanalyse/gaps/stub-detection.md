# Stub & Mock Detection Audit

**Date:** 2026-04-16
**Branch:** Customer-app
**Scope:** All production code (excluding tests, seeds, migrations, node_modules, .git, zhub, zanalyse, dist, build)

## Summary Counts

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|---|---|---|---|---|---|
| setTimeout Fakes | 1 | 0 | 0 | 0 | 1 |
| Console.log Stubs | 0 | 4 | 3 | 1 | 8 |
| TODO / Placeholder | 2 | 5 | 8 | 3 | 18 |
| Mock / Stub Code | 1 | 2 | 1 | 0 | 4 |
| Type Safety Escapes | 0 | 3 | 3 | 0 | 6 |
| Hardcoded Values | 1 | 3 | 3 | 0 | 7 |
| **Total** | **5** | **17** | **18** | **4** | **44** |

---

## setTimeout Fakes

### [CRITICAL] Onboarding org creation is a fake setTimeout - no actual API call
- **File:** `apps/web/src/routes/_authenticated/onboarding.tsx:66,102`
- **Status:** KNOWN
- **What's wrong:** Both the name availability check (line 66) and org creation (line 102) use `setTimeout` to simulate API calls. The org is never actually created.
- **What to do:** Replace with real `client.organizations.checkNameAvailability()` and `client.organizations.create()` calls. Slug generation must also be implemented.

---

## Console.log Stubs

### [HIGH] Sales View "View" and "Edit" buttons are console.log stubs
- **File:** `apps/web/src/components/tables/sales/view/columns.tsx:148,158`
- **Status:** KNOWN
- **What's wrong:** Both View and Edit button click handlers only call `console.log("View sales order:", ...)` / `console.log("Edit sales order:", ...)`.
- **What to do:** Navigate to a sales order detail page or open a detail dialog.

### [HIGH] Payment View "View" and "Edit" buttons are console.log stubs
- **File:** `apps/web/src/components/tables/payment/view/columns.tsx:220,229`
- **Status:** NEW
- **What's wrong:** View and Edit button click handlers only call `console.log`.
- **What to do:** Navigate to payment detail page or open detail dialog.

### [HIGH] Packages View "Edit" button is console.log stub
- **File:** `apps/web/src/components/tables/packages/view/columns.tsx:127`
- **Status:** NEW
- **What's wrong:** Edit button click handler only calls `console.log("Edit package:", ...)`.
- **What to do:** Open package edit dialog or navigate to edit page.

### [HIGH] Subscribe page has extensive console.log in payment flow
- **File:** `apps/web/src/routes/subscribe.tsx:105,115,145,152,163,182`
- **Status:** NEW
- **What's wrong:** Six `console.log` calls leak payment processing details (tokens, setup data) to browser console in production.
- **What to do:** Remove or replace with a proper logging service that can be disabled in production.

### [MEDIUM] Branch View has 15+ debug console.log statements
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx:154,189,192,195,222,294,328,337,360,369,375,379,389,430`
- **Status:** KNOWN (one was noted as LIMITATION, but the full extent is much worse)
- **What's wrong:** Extensive debug logging throughout the branch view page -- hierarchy mapping, cache reads, API results -- all leaking to browser console.
- **What to do:** Remove all debug `console.log` calls or wrap behind a dev-only flag.

### [MEDIUM] Hierarchical Branch Form has debug console.log throughout
- **File:** `apps/web/src/components/forms/hierarchical-branch-form.tsx:116,160,218,253,405,406,410,412`
- **Status:** NEW
- **What's wrong:** Debug logging for component mount, data loading, error details, and auth tokens leaking to console.
- **What to do:** Remove or replace with conditional dev-only logging.

### [MEDIUM] Server createContext has persistent debug logging
- **File:** `packages/api/src/context.ts:43,48,68`
- **Status:** NEW
- **What's wrong:** Three `console.log` statements in the request context creation path execute on every authenticated request, logging member IDs and accessible node counts.
- **What to do:** Remove or gate behind a `DEBUG` env variable.

### [LOW] Native oRPC client logs errors to console
- **File:** `apps/native/utils/orpc.ts:10`
- **Status:** NEW
- **What's wrong:** Error handler calls `console.log(error)` which may leak sensitive info in production builds.
- **What to do:** Replace with a structured error reporting service.

---

## TODO / Placeholder Code

### [CRITICAL] Permission service is stub: only admin role has any permissions
- **File:** `apps/server/src/services/permission.service.ts:51-53`
- **Status:** NEW
- **What's wrong:** `hasPermission()` returns `true` for admin and `false` for everyone else with a `TODO: Implement RBAC table-based permission checks` comment. Non-admin users effectively have zero permissions.
- **What to do:** Implement proper RBAC checks against the `role_permissions` table in the tenant database.

### [HIGH] Stripe integration is entirely stubbed
- **File:** `apps/web/src/lib/stripe.ts:1-23`
- **Status:** NEW
- **What's wrong:** `getStripe()` always returns `Promise.resolve(null)`. Stripe SDK is not installed. Three TODO comments mark this as unimplemented.
- **What to do:** Install `@stripe/stripe-js`, implement `loadStripe()`, and wire up to checkout flow.

### [HIGH] API client is a stub returning empty arrays
- **File:** `apps/web/src/lib/api.ts:1-47`
- **Status:** NEW
- **What's wrong:** The entire `ApiClient` class is a placeholder. All methods (`getListServices`, `getListServiceCategories`, `getListbranches`) return `{ status: 200, data: [] }` with `console.warn` stubs.
- **What to do:** Remove file entirely if all consumers have migrated to oRPC. If not, migrate remaining consumers.

### [HIGH] Admin service impersonation is stubbed
- **File:** `apps/server/src/services/admin.service.ts:82,166`
- **Status:** NEW
- **What's wrong:** Two TODO comments indicate the admin impersonation feature is not integrated with Better-Auth's admin plugin API.
- **What to do:** Integrate with Better-Auth admin plugin impersonation API.

### [HIGH] Webhook handlers have no database updates
- **File:** `apps/server/src/routes/webhooks.routes.ts:178,186,203`
- **Status:** NEW
- **What's wrong:** Three Stripe webhook events (`subscription.updated`, `subscription.deleted`, `invoice.payment_failed`) log to console but have TODO comments and no actual database updates.
- **What to do:** Implement database updates for subscription status changes and payment failures.

### [HIGH] Auth debug utilities are unimplemented
- **File:** `apps/web/src/lib/auth-debug.ts:4,33,64,90`
- **Status:** NEW
- **What's wrong:** Four functions marked with `TODO: Adapt/Replace with Better-Auth` are still using old auth patterns. The file still has raw JWT decoding and cookie inspection that may not match Better-Auth's session model.
- **What to do:** Either remove entirely or rewrite for Better-Auth session debugging.

### [MEDIUM] Org delete does not clean up Neon project
- **File:** `apps/server/src/routes/organizations.routes.ts:460`
- **Status:** NEW
- **What's wrong:** `TODO: Delete Neon project via API` -- when an org is deleted, its Neon database branch is orphaned.
- **What to do:** Call Neon API to delete the project/branch on org deletion.

### [MEDIUM] Add Appointment modal has placeholder credit values
- **File:** `apps/web/src/components/calendar/add-appointment-modal.tsx:149,161`
- **Status:** NEW
- **What's wrong:** `creditPoints: 0` with TODO to populate from `package_instances`; `creditCost` uses raw price with TODO to confirm display unit.
- **What to do:** Fetch credit data from package instances and confirm whether display unit is cents or ringgit.

### [MEDIUM] Branch form has hardcoded organizationId fallback
- **File:** `apps/web/src/components/forms/hierarchical-branch-form.tsx:79`
- **Status:** NEW
- **What's wrong:** `TODO: Get from user's current organization or route params` -- the org ID source is not properly resolved.
- **What to do:** Get organizationId from user context or route params.

### [MEDIUM] Branch form uses placeholder instead of oRPC
- **File:** `apps/web/src/components/forms/hierarchical-branch-form.tsx:175`
- **Status:** NEW
- **What's wrong:** `TODO: Replace with actual oRPC client call` for branch creation.
- **What to do:** Migrate to oRPC client call.

### [MEDIUM] Branch View needs user details from control panel
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx:242`
- **Status:** NEW
- **What's wrong:** `TODO: Fetch actual user details from control panel DB by picUserId` -- PIC (person-in-charge) names are not resolved.
- **What to do:** Add API call to fetch user names from control panel by userId.

### [MEDIUM] Branch/Role columns use placeholder types
- **File:** `apps/web/src/components/tables/branch/view/columns.tsx:11,18`
- **File:** `apps/web/src/components/tables/role/view/columns.tsx:3`
- **Status:** NEW
- **What's wrong:** `TODO: Replace with actual API types when backend is ready` -- column definitions use locally defined types instead of API-generated types.
- **What to do:** Import types from the oRPC-generated type definitions.

### [MEDIUM] Admin audit log system not implemented
- **File:** `apps/server/src/routers/admin.ts:510`
- **Status:** NEW
- **What's wrong:** `TODO: Implement audit log system` -- admin actions are not audited.
- **What to do:** Implement audit logging for admin operations.

### [MEDIUM] Permissions lib has unimplemented Better-Auth integration
- **File:** `apps/web/src/lib/permissions.ts:7`
- **Status:** NEW
- **What's wrong:** `TODO: Integrate with Better-Auth permission system` at top of file.
- **What to do:** Integrate client-side permission checks with Better-Auth.

### [LOW] Cookie module has adaptation TODO
- **File:** `apps/web/src/lib/cookie.ts:2`
- **Status:** NEW
- **What's wrong:** `TODO: Adapt for Better-Auth cookie handling if needed`.
- **What to do:** Review if cookie utilities are still needed with Better-Auth or remove.

### [LOW] Auth types need Better-Auth adaptation
- **File:** `apps/web/src/types/auth.ts:7`
- **Status:** NEW
- **What's wrong:** `TODO: Adapt for Better-Auth integration` on auth types.
- **What to do:** Update types to match Better-Auth's type definitions.

### [LOW] useAuth hook needs permission integration
- **File:** `apps/web/src/hooks/useAuth.ts:7`
- **Status:** NEW
- **What's wrong:** `TODO: Integrate permission checking with Better-Auth permission system`.
- **What to do:** Wire permission checks to Better-Auth.

---

## Mock / Stub Code

### [CRITICAL] _MOCK_USER_CONTEXT still exists in useUserContext
- **File:** `apps/web/src/hooks/useUserContext.ts:44`
- **Status:** NEW (previously fixed but mock constant remains)
- **What's wrong:** `_MOCK_USER_CONTEXT` with `demo@avantej.com` and `org-1` still defined. While prefixed with `_` suggesting unused, it remains as dead code that could be accidentally referenced.
- **What to do:** Remove the `_MOCK_USER_CONTEXT` constant entirely.

### [HIGH] useRoleMatrix is a deprecated no-op stub
- **File:** `apps/web/src/hooks/useRoles.ts:76-88`
- **Status:** NEW
- **What's wrong:** `useRoleMatrix()` is explicitly marked deprecated and returns dummy values (`matrix: null`, `setMatrix: () => {}`, etc.) to prevent import errors.
- **What to do:** Find and remove all consumers of `useRoleMatrix`, then delete the stub.

### [HIGH] Placeholder image URL in native dashboard
- **File:** `apps/native/app/(app)/dashboard/index.tsx:289`
- **Status:** NEW
- **What's wrong:** User avatar uses `https://via.placeholder.com/48` -- a third-party placeholder service in production.
- **What to do:** Use the user's actual profile image or a local default avatar asset.

### [MEDIUM] Stripe type is aliased to `any`
- **File:** `apps/web/src/lib/stripe.ts:8`
- **Status:** NEW
- **What's wrong:** `type Stripe = any` bypasses all type checking for Stripe operations.
- **What to do:** Install `@stripe/stripe-js` and import the real Stripe type.

---

## Type Safety Escapes

> Note: `routeTree.gen.ts` is auto-generated by TanStack Router and contains ~60 `as any` casts. These are excluded as they are framework-generated.
> Note: `worker-configuration.d.ts` is a Cloudflare Workers type definition file. Its `any` usage is excluded.

### [HIGH] Hierarchy router has 20+ `as any` casts
- **File:** `packages/api/src/routers/hierarchy.ts:158,172,173,219,233,241,340,370,371,465,466,534,546,641,642,785,786`
- **Status:** NEW
- **What's wrong:** Extensive `(node as any).address`, `(node as any).picUserId`, `(nodes: any, { asc }: any)` patterns throughout. The Drizzle query results don't include `address`/`picUserId` in their type, suggesting schema-type mismatch.
- **What to do:** Update the Drizzle schema types to include `address` and `picUserId` columns, or create a proper type that extends the base node type.

### [HIGH] Package Installments view casts all API calls as any
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/installments/view.tsx:62,68,138,148,158,170,180,196,224,254,281,404,405,563,838`
- **Status:** KNOWN
- **What's wrong:** 15 `as any` casts throughout the file. Every API call is wrapped with `(client as any).installments.*`. Instance types, installment arrays, and refund data are all `any`.
- **What to do:** Add proper types for the installments API. Ensure the oRPC client has typed installment procedures.

### [HIGH] Branch View has 8+ `as any` casts
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/branch/view.tsx:239,255,263,277,386,399,454,655,804`
- **Status:** NEW
- **What's wrong:** Branch data is frequently cast with `(branch as any).picUserId`, `(branch as any).code`, `(branch as any).address`. Error handlers use `error: any`.
- **What to do:** Update branch type definitions to include all fields returned by the API.

### [MEDIUM] Access Control pages use `as any` for member data
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/user-assignment.tsx:683,684`
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/access-control/roles.tsx:203,287,597`
- **Status:** NEW
- **What's wrong:** Member data is cast to `any` to access `role` and `hierarchyScopeId` properties. Role save handler parameter is `_roleData: any`.
- **What to do:** Define proper types for member API response that include role and scope fields.

### [MEDIUM] Installment service uses `(err as any).code` pattern
- **File:** `packages/services/src/installment.service.ts:555,566,573`
- **Status:** NEW
- **What's wrong:** Error objects are cast to `any` to set a `.code` property for error classification.
- **What to do:** Create a typed custom error class (e.g., `AppError`) with a `code` property.

### [MEDIUM] Transaction objects cast `as unknown as` for stock/purchase operations
- **File:** `packages/services/src/transfer-orders.service.ts:181,187`
- **File:** `packages/services/src/stock-requests.service.ts:179,180,187`
- **File:** `packages/services/src/purchase-orders.service.ts:137`
- **Status:** NEW
- **What's wrong:** Drizzle transaction objects are cast `tx as unknown as NeonDatabase<typeof tenantSchema>` because the transaction type doesn't match the expected `NeonDatabase` type.
- **What to do:** Create a `TenantTransaction` type that properly represents the Drizzle transaction, or use a utility function that handles the cast once.

---

## Hardcoded Values

### [CRITICAL] Buy Package Done screen uses hardcoded 10% tax rate
- **File:** `apps/native/app/(app)/dashboard/buy-package/done.tsx:24`
- **Status:** KNOWN
- **What's wrong:** `const total = subtotal * 1.1` hardcodes a 10% tax rate while the Pay screen correctly fetches the tax rate from the API.
- **What to do:** Fetch the default tax rate from the API (as the Pay screen does) or pass the calculated total through the purchase flow context.

### [HIGH] Service View price formatted as USD (2 locations)
- **File:** `apps/web/src/components/tables/service/view/columns.tsx:9`
- **File:** `apps/web/src/components/forms/service-detail-dialog.tsx:37`
- **Status:** KNOWN
- **What's wrong:** `currency: "USD"` in `Intl.NumberFormat` produces `$` symbol. This is a Malaysian business -- should be MYR/RM.
- **What to do:** Use `formatPrice(priceCents, "MYR")` from `@/lib/currency.ts` which correctly renders RM.

### [HIGH] Expenses schema defaults currency to "usd"
- **File:** `packages/db/src/schema/tenant/expenses.ts:21`
- **Status:** KNOWN
- **What's wrong:** `.default("usd")` in the schema means any expense created without explicitly setting currency gets USD.
- **What to do:** Change default to `"MYR"` or remove the default and require explicit currency.

### [HIGH] Payments and Payouts schemas default currency to "usd"
- **File:** `packages/db/src/schema/tenant/payments.ts:36`
- **File:** `packages/db/src/schema/tenant/payouts.ts:38`
- **Status:** NEW
- **What's wrong:** Both tables default currency to `"usd"` despite the platform operating in MYR.
- **What to do:** Change defaults to `"MYR"` and run a migration to update existing rows. Consider making currency configurable per-organization.

### [MEDIUM] Hardcoded "MYR" currency strings throughout frontend
- **File:** `apps/web/src/components/claims-widget.tsx:44`
- **File:** `apps/web/src/components/tables/cancelled-sales/view/columns.tsx:113`
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/promotions/view.tsx:85`
- **File:** `apps/web/src/components/tables/package-instances/view/columns.tsx:103`
- **File:** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx:288`
- **File:** `apps/web/src/components/tables/products/view/columns.tsx:111`
- **Status:** NEW
- **What's wrong:** `formatPrice(amount, "MYR")` is hardcoded in 6+ locations. If the platform expands beyond Malaysia, every instance needs updating.
- **What to do:** Create an org-level currency config (e.g., `useOrganizationCurrency()` hook) and use it everywhere.

### [MEDIUM] Package validity defaults to 365 days
- **File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx:57`
- **Status:** NEW
- **What's wrong:** `state.validityDays ?? 365` hardcodes a one-year default validity. This should come from the package definition.
- **What to do:** Ensure `validityDays` is always populated from the package configuration, not defaulted.

### [MEDIUM] Permission priority threshold hardcoded at 100
- **File:** `packages/services/src/permission.service.ts:97`
- **Status:** NEW
- **What's wrong:** `if (role.priority >= 100)` uses a magic number to determine admin-level access. This value is also in the schema comment but not defined as a constant.
- **What to do:** Define `ADMIN_PRIORITY_THRESHOLD = 100` as a named constant in the permissions module.

---

## Additional Observations

### Native app pay.tsx uses `as any` for tax rate and package creation
- **File:** `apps/native/app/(app)/dashboard/buy-package/pay.tsx:45,60`
- Both `(taxRate as any).rateInBasisPoints` and `(client.packageInstances.create as any)(...)` bypass type safety in the payment flow -- a high-risk area for bugs.

### Registration form uses `error: any` in catch block
- **File:** `apps/native/components/registration-form.tsx:1148`
- Catch block types error as `any` instead of using proper error narrowing.
