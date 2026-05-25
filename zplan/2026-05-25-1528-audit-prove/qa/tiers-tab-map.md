# Trainer Tiers Tab — Component Map

**Route:** `/dashboard/trainers/view?tab=tiers`
**Route file:** `apps/web/src/routes/_authenticated/dashboard/_layout/trainers/view.tsx`
**Traced:** 2026-05-25

---

## 1. Entry Guard (route `beforeLoad`)

```
view.tsx:10-13
  requirePermission("user_management:read")
    → authClient.getSession()
    → fetchUserContext()
    → checks ctx.permissions includes "user_management:read"
    → if missing: redirectUnauthorized("/dashboard")
```

Note: the tab-level content uses `trainer_tier_management` permissions at the oRPC layer, but the route gate only checks `user_management:read`.

---

## 2. Component Tree

```
TrainersTabPage  [view.tsx:25]
  tab === "tiers" branch [view.tsx:29]
  └── TrainerTiersPage  [trainer-tiers-page.tsx:19]
        ├── useUserContext()                         → orgId (string | "")
        ├── useState: createOpen, deactivateTarget,
        │             missingRateBanner, createForm
        ├── useQuery(["trainerTiers", orgId, "list"])
        │     └── client.trainerTiers.list(...)
        ├── useApiMutation (create)
        │     └── client.trainerTiers.create(...)
        ├── useApiMutation (deactivate)
        │     └── client.trainerTiers.deactivate(...)
        ├── useApiMutation (reactivate)
        │     └── client.trainerTiers.reactivate(...)
        │
        ├── [guard] !orgId → "Select an organization…" [line 101-107]
        ├── [error] isError → <Alert> + Retry button [line 134-152]
        ├── [loading] isLoading → "Loading…" [line 153]
        ├── [empty] tiers.length === 0 → "No tiers yet" [line 155-158]
        ├── [table] tiers.length > 0 → <table> [line 160-221]
        │     └── per tier row:
        │           isActive → "Deactivate" button → setDeactivateTarget(id)
        │           !isActive → "Reactivate" button → reactivateMutation.mutate(id)
        ├── <CreateTierDialog>  [trainer-tier-dialogs.tsx:28]
        │     Fields: name (required, text), rank (number, min 0), description (textarea, optional)
        │     Submit → handleCreate() → createMutation.mutate(...)
        └── <DeactivateTierDialog>  [trainer-tier-dialogs.tsx:112]
              Shows: tier name, destructive confirm button
              Cancel → setDeactivateTarget(null)
              Confirm → deactivateMutation.mutate(deactivateTarget)
```

---

## 3. API Calls → Server Handlers → DB

### 3a. LIST

| Layer | Detail |
|---|---|
| Client call | `client.trainerTiers.list({ organizationId, includeInactive: true })` |
| oRPC procedure | `packages/api/src/routers/trainer-tiers.ts:15` |
| Permission check | `trainer_tier_management:read` |
| Service | `listTrainerTiers(tenantDb, { includeInactive: true })` |
| DB | `SELECT * FROM trainer_tiers ORDER BY rank ASC` (no filter when includeInactive=true) |
| Table | `trainer_tiers` |

### 3b. CREATE

| Layer | Detail |
|---|---|
| Client call | `client.trainerTiers.create({ organizationId, name, rank, description? })` |
| oRPC procedure | `packages/api/src/routers/trainer-tiers.ts:33` |
| Zod validation | `name: z.string().min(1)`, `rank: z.number().int().default(0)` |
| Permission check | `trainer_tier_management:create` |
| Service | `createTrainerTier(tenantDb, { name, description, rank })` |
| Uniqueness check | `SELECT id FROM trainer_tiers WHERE LOWER(name) = LOWER($name) LIMIT 1` — throws "A tier with this name already exists" |
| DB write | `INSERT INTO trainer_tiers (name, description, rank) RETURNING *` |
| Post-insert check | `getConfigsMissingRateForTier(tenantDb, tier.id)` → checks `category_commission_configs` + `commission_tier_rates` / `commission_condition_rates` |
| Return | `{ tier, missingRateCategories: MissingRateCategory[] }` |
| Tables touched | `trainer_tiers` (write), `category_commission_configs`, `commission_tier_rates`, `commission_condition_rates` (reads) |

**Note:** The uniqueness constraint is enforced at the service layer (case-insensitive LOWER() check), not via DB UNIQUE INDEX on lowercased name. The DB does have a `uniqueIndex` on the raw `name` column (`trainer_tiers_name_unique`), so the DB would also catch case-sensitive duplicates. The service check catches case-insensitive ones first.

**Rank uniqueness:** There is NO uniqueness constraint on `rank` in the DB schema (`trainer-tiers.ts:12`), only an ordinary index. Duplicate ranks are permitted.

### 3c. DEACTIVATE

| Layer | Detail |
|---|---|
| Client call | `client.trainerTiers.deactivate({ organizationId, id })` |
| oRPC procedure | `packages/api/src/routers/trainer-tiers.ts:98` |
| Permission check | `trainer_tier_management:delete` |
| Service | `deactivateTrainerTier(tenantDb, id)` |
| DB write | `UPDATE trainer_tiers SET is_active=false, updated_at=now() WHERE id=$id RETURNING *` |
| Not-found guard | throws "Trainer tier not found" if no row returned |
| Return | Updated tier row (plain, no missingRateCategories) |
| Tables touched | `trainer_tiers` |

### 3d. REACTIVATE

| Layer | Detail |
|---|---|
| Client call | `client.trainerTiers.reactivate({ organizationId, id })` |
| oRPC procedure | `packages/api/src/routers/trainer-tiers.ts:123` |
| Permission check | `trainer_tier_management:update` |
| Service | `reactivateTrainerTier(tenantDb, id)` |
| DB write | `UPDATE trainer_tiers SET is_active=true, updated_at=now() WHERE id=$id RETURNING *` |
| Not-found guard | throws "Trainer tier not found" if no row returned |
| Post-update check | `getConfigsMissingRateForTier(tenantDb, id)` |
| Return | `{ tier, missingRateCategories: MissingRateCategory[] }` |
| Tables touched | `trainer_tiers` (write), `category_commission_configs`, `commission_tier_rates`, `commission_condition_rates` (reads) |

---

## 4. Missing-Rate-Categories Banner

**Source:** `trainer-tiers-page.tsx:118-132`

**Wired up:** YES — correctly wired for both create and reactivate paths.

**Create path (`trainer-tiers-page.tsx:52-57`):**
```typescript
const missing = result && "missingRateCategories" in result
  ? result.missingRateCategories : [];
if (missing.length > 0) setMissingRateBanner(missing);
```

**Reactivate path (`trainer-tiers-page.tsx:79-84`):** Same pattern.

**Deactivate path:** No banner (deactivate returns plain tier, no missingRateCategories).

**Banner content:** Lists `categoryId` values (raw UUIDs) — not human-readable category names. This is a UX gap: `c.categoryId` is a UUID (`trainer-tiers-page.tsx:126`), not a display name.

**Banner dismissal:** There is NO dismiss button on the banner. Once set, `missingRateBanner` stays until the next navigation or page refresh. It is never cleared by subsequent mutations.

---

## 5. Form Validation

**Frontend (`handleCreate`, `trainer-tiers-page.tsx:88-99`):**
- `createForm.name.trim()` empty → `toast.error("Name is required")` — does NOT prevent dialog close or form reset.
- No rank validation beyond `parseInt(...) || 0` in the input handler (`trainer-tier-dialogs.tsx:67`).
- Description trimmed, empty string converted to `undefined`.

**Backend (Zod, `trainer-tiers.ts:37`):**
- `name: z.string().min(1)` — catches empty-string from any client bypassing frontend check.
- `rank: z.number().int().default(0)` — must be integer.

---

## 6. State Reset Behaviour

- Dialog close (X button or Cancel) → `onOpenChange` calls `onClose()` which calls `setCreateForm(EMPTY_FORM)` (`trainer-tiers-page.tsx:226-230`).
- Successful create → `setCreateForm(EMPTY_FORM)` + `setCreateOpen(false)` (`trainer-tiers-page.tsx:49-50`).
- Deactivate cancel → `setDeactivateTarget(null)` (`trainer-tiers-page.tsx:240`).
- `EMPTY_FORM = { name: "", rank: 0, description: "" }` (`trainer-tier-dialogs.tsx:17`).

---

## 7. Identified Risks

1. **Banner shows raw UUIDs** — `missingRateBanner` renders `c.categoryId` (UUID) not a human name (`trainer-tiers-page.tsx:126`).
2. **Banner never dismissible** — no close/dismiss button; persists for session lifetime.
3. **Duplicate rank silently allowed** — no uniqueness constraint on `rank` column; service and UI do nothing to prevent two tiers with the same rank number.
4. **`deactivateTarget` not cleared on dialog unmount** — if mutation fails midway, the dialog stays open but the button is re-enabled. If user then navigates away and back, `deactivateTarget` is null (component remounts) — not a persistent issue.
5. **`trainer_tier_management:delete` required for deactivate** — unusual: deactivate is a soft-delete (`is_active=false`), not a DB delete, but the permission level is `delete`. Staff without `delete` permission cannot deactivate.
6. **`getConfigsMissingRateForTier` runs N+1 queries** — one query per active commission config, then one more per condition. No batching. Could be slow with many configs.
