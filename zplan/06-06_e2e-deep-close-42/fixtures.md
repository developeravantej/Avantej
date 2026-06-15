# Validated fixtures + API facts (probed 2026-06-06, local dev tenant)

All confirmed against live API via admin cookie. Specs discover dynamically where possible.

## IDs
- org: `996febce-aaad-4ded-8f47-02d2b566c8ee` (via `getOrgId()`)
- hierarchy org-root node (type `organization`, depth 0): `e5b88c19-da14-42e6-8d91-4a7941fa3ecd`
- a `client` member (owner for packages), userId: `4ca63585-922a-418d-9129-7bb1ca2d5555`
- a service with `branchId: null` (price 5000): `7e5b0636-7ed9-4498-a6bd-9a495dd1f04e`
- a trainer memberId: `b23ada2c-a97f-4017-a3b2-a4735c7911fd` (Azri, org-root scope)
- admin member (franchisee): id `0f30a11c-3a03-47d4-9d4c-139668ccbd15`, userId `wZGQSvB1v2xWt3NwcSV0DYvRDQLxldkH`

## Hierarchy (ALL 200, self-clean) ✅
- createNode {type:"country"|"state"|"branch", name, parentId} — country under org-root, state under country.
- updateNode {nodeId, name} — returns renamed node.
- moveNode {nodeId, newParentId} — state c1→c2 OK, depth recalculated.
- deleteNode {nodeId} — returns `{success:true, ghlSync:[]}`, cascades by default.

## Packages (ALL coverable, no deferrals) ✅
- create REQUIRES exactly one owner: `clientId` OR `walkInCustomerId` (both null → 400 DB error). Use `clientId`.
- create required: serviceId, source, creditsTotal, startsAt(ISO), expiresAt(ISO).
- scaling: premium plan (pricePremiumBps:1000) → totalPrice 5000→**5500**, tax 100→**110**. ✅
- approval gate: source:"purchased" → status forced **pending**. ✅
- creditsRemaining generated: creditsTotal 10, creditsUsed 3 → **7** (read-only). ✅
- purchase_number unique: duplicate → **400**. ✅
- assignTrainer on non-pending → **400** "Package is not pending (current status: active)". ✅
- assignTrainer happy (pending→active) → **200** with any trainer (service branchId null = no branch constraint). ✅
- reject pending → **200** (→cancelled). ✅
- freeze/unfreeze/extend/cancel → all 200. ✅
- cleanup: `packageInstances/cancel`. installment plans: `installmentPlans/deactivate` (NO delete proc).

## installmentPlans
- create {code, name, numInstallments, defaultIntervalDays, pricePremiumBps} → 200.
- cleanup: `deactivate {id}` (NOT `delete` — 404).
- procs: list, getById, getByCode, create, update, setDefault, deactivate, reactivate.

## Router proc paths (oRPC)
- `hierarchy/createNode|updateNode|moveNode|deleteNode|reassignMember|listNodes`
- `branchInvites/create|revoke|list|listAll`
- `members/create|suspend|reactivate|updateRole|updateScope|remove|deactivate|softDelete|restore|list`
- `packageInstances/create|assignTrainer|reject|confirmPayment|cancel|freeze|unfreeze|extend|listAll`
- `installmentPlans/create|deactivate|list`
