# MOVE Tenant — Provision + Seed Plan

> Status: **DRAFT for review**. Created 2026-06-28.
> Goal: stand up a fresh production tenant **"move"** in the new Neon account (org **ZHIYUAN TECHNOLOGY**, `org-rough-moon-47165576`, plan `launch`), then seed real business data from 3 source files.

---

## 0. Source files

| File | Rows | Content | Format |
|---|---|---|---|
| `~/Downloads/Location-Branch.csv` | 23 branches | MY + TH + SG branches | CSV (CRLF) |
| `~/Downloads/Staff.csv` | 124 staff | coaches + managers | CSV (CRLF) |
| `~/Downloads/Offering-Service.xlsx` | 70 offerings (Sheet11) | services + packages | XLSX (2 sheets) |

Known data-quality issues (see §7).

---

## 1. Architecture facts (verified against code)

- App routes tenants **purely by `organizations.id` UUID** (custom control-panel table), resolved in `tenant.middleware.ts` (URL param / `X-Organization-Id` header / session). The Better-Auth org-plugin tables (`organization`/`member`/`invitation`) are **never written** by provisioning and are **not needed** for routing.
- Tenant connection string is stored **encrypted** via `encrypt()` (`packages/db/src/lib/encryption.ts`, AES-256-GCM, env `ENCRYPTION_KEY` = 64-hex). Store encrypted; raw breaks `getTenantDb()`.
- Hierarchy is a fixed **4-level adjacency tree**: `organization(0) → country(1) → state(2) → branch(3)` (enum `hierarchy_node_type`). A branch **is** a hierarchy node; address/manager live in `branch_details`. `country_node_id` is denormalized on state+branch rows.
- A member is pinned to ONE `hierarchy_scope_id`; `accessibleNodeIds` = that node + all descendants (recursive CTE).
- Money is stored in **cents/sen** (RM × 100). `services.price` = full/display price; installments are derived at POS checkout (per-installment = `floor(total/n)`, remainder on last). **POS shows the per-installment amount, not full price** — do NOT pre-store a full price as the installment amount.
- Commission reaches a trainer only if `members.trainerTierId` is set AND that tier has a `commission_tier_rates` row; else the engine skips with `no_tier_rate`. Rotation vs requested both yield a split at runtime.

---

## 2. KEY DECISION: use the existing migration harness (do NOT hand-roll seeds)

`apps/server/scripts/migration/` is a production-grade importer already in the repo:

- **Canonical DTOs** (`core/canonical.ts`): `CanonicalBranch`, `CanonicalStaff`, `CanonicalService`, `CanonicalClient`, `CanonicalAppointment`.
- **Complete loaders** (`core/loaders/`): `00-bootstrap`, `01-location`, `02-staff` (cross-DB), `03-product`, `04-client`, `07-appointment` — branches/staff/services all production-ready.
- **Fidelity-safe XLSX reader** (`adapters/xlsx.ts`, ExcelJS, uses rendered text → preserves leading zeros / NRIC / locale dates).
- **Transforms** (`adapters/transforms.ts`): `decimalToCents`, `normalizePhone` (E.164), `parseDate`, `mapValue`, `composeAddress`, `toInt`, `toBool`, `firstOf`.
- **Idempotent crosswalk** (`core/crosswalk.ts`, table `mig_xwalk`): legacyId → newId, re-run safe.
- **Orchestrator** (`engine/run.ts`): `--org <slug> --client <slug> --file <path> [--commit]`. **Dry-run by default** with rollback; commits only after reconciliation passes.
- **Per-client manifest** (`adapters/clients/pt-franchise/manifest.ts`): column → canonical mapping. Adding a client = one new manifest file; loaders unchanged.

**Harness gaps for MOVE:**
1. Does NOT create the tenant — assumes the Neon DB + org-root node already exist (P1–P3 below cover this).
2. Only reads XLSX — MOVE has 2 CSVs → add a small `adapters/csv.ts` shim (~30 LOC) returning `RawRow[]`.
3. Sales / packages / redemption loaders are README-blocked (multi-currency + commission). MOVE only supplies Branch/Staff/Service, so out of scope now.

---

## 3. Phased plan + progress

```
P1 ✅ Create 2 Neon projects in ZHIYUAN    avantej-control-prod + avantej-tenant-move (ap-southeast-1, pg17)
P2 ✅ Apply schema                          control + tenant applied & verified
P3 ✅ Bootstrap "move" in CONTROL-PANEL     owner+account+sub+org+registry + tenant org-root + admin member + RBAC
P4 ✅ move manifest + consolidation step    adapters/clients/move/{manifest.ts,build-source.ts,data/} (built source.xlsx from 3 raw files; NO csv adapter needed — consolidated to xlsx)
P5 ✅ Dry-run migrator                      reconciled clean: 23 branch / 124 staff / 70 service / 0 client / 0 appt
P6 ✅ Commit                                COMMITTED + verified in tenant DB (3 country/6 state/23 branch/23 branch_details/124 member/123 profile/70 service/341 xwalk)
P7 ✅ Commission wiring                     scripts/seed-move-commission.ts (MOCK rates): 4 categories + 70 services categorized + 4 tiers + 114 coaches assigned + 4 configs/4 slots/16 rates. Lead 35/Senior 35/Junior 44/Master 0.
P8 ✅ Verify                                browser: login franchisee@gmail.com → MOVE tenant, 23 branches, 70 services/4 categories, POS branded MOVE. ⚠️ found+fixed bcrypt→scrypt login bug (fix-auth-password-scrypt.ts); same bug in seed-franchise-owner.ts.
P9 ✅ Repoint app — CUTOVER LIVE          set 3 Worker secrets on avantej-core-server (ENCRYPTION_KEY new → NEON_API_KEY prod → DATABASE_URL old-breeze, flip last). NO wrangler deploy (secret put reuses deployed code). move conn re-encrypted with new key. Verified: live login franchisee@gmail.com → "MOVE Owner" HTTP 200. Rollback URL saved ~/.rollback-database-url (young-haze).

### P9b — dev/prod worker split (done)
Added `env.prod` to `apps/server/wrangler.jsonc` + `apps/web/wrangler.jsonc` (UNCOMMITTED — commit with branch). Deployed this branch's code (incl. scope-switcher guards) to new workers.

| Env | Server worker | Web worker | DB | Verified |
|---|---|---|---|---|
| **prod** | `avantej-core-server-prod` | `avantej-core-web-prod` | MOVE / old-breeze | login → MOVE Owner 200 ✅ |
| **dev** | `avantej-core-server` | `avantej-core-web` | dev / young-haze | health 200 ✅ |

- server-prod has all 20 secrets (17 copied from `.dev.vars` = **dev-grade Stripe/Google/Resend → swap to real prod**; 3 = MOVE DB/encryption/neon-key).
- `wrangler deploy --env prod` worked for server but NOT the assets-only web → used `wrangler deploy --name avantej-core-web-prod` instead. Web build bakes `VITE_SERVER_URL` (swap `.env.production` per env).
- dev worker (`avantej-core-server`) reverted to `.dev.vars` DB/ENCRYPTION/NEON values (off MOVE). ⚠️ if the old deployment used a different ENCRYPTION_KEY than `.dev.vars`, old test-tenant decrypt may break — low impact (deprecated env).

### ⚠️ POST-CUTOVER (must do)
- **Commit the `wrangler.jsonc` env.prod blocks** (server + web).
- **Swap prod Stripe/Google/Resend secrets to REAL prod values** (currently dev-grade from `.dev.vars`) via `wrangler secret put X --env prod`.
- **SAVE `~/.move-enc-key` (prod ENCRYPTION_KEY) to a password manager** — ONLY readable copy; Worker secret can't be read back. Lose it → cannot decrypt any tenant DB.
- Revoke `avantej-migration` (exposed, project-creation done, unused) — safe now.
- Rotate `avantej-neon-prod-api-key` (exposed but Worker USES it): mint clean key (don't paste) → `wrangler secret put NEON_API_KEY` → THEN revoke the exposed one. Not before.
- Latent bug: `seed-franchise-owner.ts` hashes bcrypt; Better-Auth = scrypt → fix.
- Optional cleanup: delete old Avantej Neon projects; multi-currency + tier-name cosmetics.

### P8 findings (live UI)
- ✅ scrypt login works after fix. P3 bootstrap used bcrypt (wrong) — Better-Auth = scrypt. Staff have NO credential account by design (lazy magic-link claim).
- ⚠️ multi-currency visible: TH offerings render THB as RM (e.g. RM 56,074.77 = 56074 THB) — services has no currency column.
- ⚠️ tier-variant services share name+country suffix at different prices (pricing_tier) → look duplicated. Cosmetic; consider adding tier to name.

### Commit results (verified live in curly-rain)
- 3 countries → 6 states → 23 branches (+23 branch_details addresses)
- 124 members (102 trainer, 22 admin incl owner) + 123 member_profiles
- 70 services (offering_id-keyed, country-suffixed names, org-wide)
- 341 mig_xwalk rows (re-runs are idempotent)
- ⚠️ 1 staff merged: dup email `<staff-email-redacted>` (STF-00146 + STF-00170) → patch in-app later
- ⚠️ staff scope = primary branch (option C); managers NOT org-root; coach_tier pending P7
- ⚠️ branch tier/pricing_tier/tax_rate, multi-currency, pic_user_id links all deferred
```

### Provisioned infra (ZHIYUAN org `org-rough-moon-47165576`)
| Project | ID | Region | Schema |
|---|---|---|---|
| avantej-control-prod | `old-breeze-77534411` | ap-southeast-1 | ✅ 14 tables |
| avantej-tenant-move | `curly-rain-53962628` | ap-southeast-1 | ✅ 107 tables (→ migration 0096) |

Conn strings: `~/.move-control-conn`, `~/.move-tenant-conn` (pooler URIs; local, chmod 600).
Neon API key: `~/.neon-key` (org-wide, **exposed in chat → revoke after migration**).

### "move" identity (control-panel DB old-breeze)
| Thing | Value |
|---|---|
| org.id | `addd98a6-a346-4494-a632-63a4b3bdc559` |
| org name / slug | MOVE Private Fitness / `move` |
| owner | `franchisee@gmail.com` / `password123` (bcrypt), user `9c0f366e-afa3-432e-ba6c-fed42e3cb4fc` |
| tenant org-root node | `369e685b-4247-463d-9231-6ae5eecc7cd5` |
| admin member (tenant) | `e54b6489-b795-4ae4-8334-6b4f30d8f65e` |

### Gotchas hit during P1–P3 (for re-runs)
- **turbo strips inline env** → run `drizzle-kit`/scripts directly, not via `bun db:*` turbo wrappers.
- **tenant schema**: raw `drizzle-kit migrate` chokes on dup-numbered SQL files → use `runTenantMigrations()` (canonical runtime path, applied through migration 0096).
- **control-panel migrations LAG the Drizzle schema** (hand-maintained; missing `user.first_name` etc.) → committed migrations gave an incomplete `user` table. Fix = `drizzle-kit push` after `DROP SCHEMA public CASCADE` (push needs an empty DB or a TTY for rename-conflict prompts). **For P9/prod the control-panel schema must come from `push`, not `migrate`.**
- **ENCRYPTION_KEY** used to encrypt `organizations.connection_string` must match the prod Worker's key (P9), else `getTenantDb()` decrypt fails. Currently used the `.dev.vars` key.

> Open: is `avantej-control-prod` a brand-new control-panel, or do we keep using the existing one and only add tenant "move"? If brand-new, P9 applies + migrate existing tenants. If only adding "move" to current control-panel, skip P9. **Confirm.**

---

## 4. Column → target mapping

### 4.1 Branches (`Location-Branch.csv` → `hierarchy_nodes` + `branch_details`)

| CSV column | → canonical / target |
|---|---|
| `country` (Malaysia/Thailand/Singapore) | country node (depth 1) |
| **derived** `ghl_branch_name.split(" - ")[0]` (Kuala Lumpur, Bangkok, Central…) | **state node (depth 2)** |
| `branch_name` (`MOVE BUKIT JALIL`) | branch node (depth 3), globally unique ✓ |
| `registered_address` | `branch_details.address` |
| `branch_code` (legacyId) | crosswalk `source_id` |
| `branch_tier`, `pricing_tier`, `tax_rate`, `operation_date`, `branch_status`, `max_coach_capacity` | **no column** (deferred → migration 0095) |

### 4.2 Staff (`Staff.csv` → control `user`+`account`+`organization_members`, tenant `members`+`member_profiles`)

| CSV column | → target |
|---|---|
| `staff_code` (STF-xxxxx) | crosswalk `source_id` (stable) |
| `staff_name` | `user.name`, `member_profiles.displayName` |
| `staff_email` | `user.email` (lowercased, unique) |
| `staff_phone_no` | `normalizePhone()` → `member_profiles.phoneNumber` |
| `is_coach` / `is_manager` | role (see §5 #3) |
| `coach_tier` (Lead/Senior/Junior/Master) | `trainer_tiers` + `members.trainerTierId` |
| `access_branch_name` (multi) | `hierarchy_scope_id` (see §5 #2) |

### 4.3 Offerings (`Offering-Service.xlsx` Sheet11 → `service_categories` + `services`)

| xlsx column | → target |
|---|---|
| `offering_name` | `services.name` |
| `offering_category` (Trial, Personal Training, Semi-Private Training, Fitcation) | `service_categories.name` |
| `offering_code` | crosswalk `source_id` |
| `price_excluding_tax` (float) | `services.price` = **round(× 100)** sen/satang |
| `included_session_count` | `sessionCount` (package-style) |
| `days_to_expire` / `total_validity_day` | `expiryDays`, set `expirable=true` |
| `days_of_buffer` | `gracePeriodDays` |
| `offering_type` (Service) | `type` (`private`/`semi_private` from category) |
| `country_code` / `currency_code` (TH/THB, MY/MYR) | scope + currency (see flags) |

> Sheet1 (260 rows) = session-expansion lookup, mostly duplicates → **ignore** for seeding.

---

## 5. Decisions — recommendations

| # | Decision | Resolution | Status |
|---|---|---|---|
| 1 | State level | Derive in manifest: `state = ghl_branch_name.split(" - ")[0]` | ✅ LOCKED |
| 2 | Manager multi-branch scope | Owner rejected org-root. **PENDING** — single `hierarchy_scope_id` can't list N branches; cross-country managers exist (see note) | ⛔ PENDING |
| 3 | Role mapping | `is_manager`→**admin**; coach-only→**trainer**; both-false→**staff**; both-true→**admin + trainerTier** | ✅ LOCKED (confirmed) |
| 4 | Coach tiers + rates | **MOCK PLACEHOLDER** (confirm real later): Master 15% / Lead 12% / Senior 10% / Junior 8%. Rank assumed Master=top → Junior=bottom | ✅ LOCKED (mock, flagged) |
| 5 | Service scope + currency | Seed **org-wide** (`branchId=NULL`), 70 rows once; keep each offering's own-currency price | ✅ LOCKED |
| 6 | Owner login | **`franchisee@gmail.com` / `password123`** (fresh control-panel DB → no clash with old DB's test-fitness-franchise) | ✅ LOCKED |
| 7 | Subscription | Trial / null sub (`payment_status=active`, `subscription_id` NULL) | ✅ LOCKED |
| 8 | Data fixes | Phone→`normalizePhone()`; dup email→1-row manual fix; TH reg sci-notation→ignore (unstored) | ✅ LOCKED |
| 9 | Control-panel DB | **FRESH** `avantej-control-prod` in ZHIYUAN → P9 repoint applies | ✅ LOCKED |

### ⛔ Pending: manager scope (#2)
`members` allows ONE `hierarchy_scope_id` per user (unique on userId; accessible = node + descendants). A manager's `access_branch_name` lists multiple branches, sometimes **cross-country** — e.g. STF-00009 ANIQ DANISH KU = `MOVE SS2, MOVE SUNWAY NEXIS, MOVE SETIA ALAM` (MY) **+ MOVE TANJONG PAGAR (SG)`. No single node = exactly those 4 except an ancestor. Owner said no to org-root. Options:
- **A. Nearest common ancestor** — same-country mgr → country node; cross-country mgr → org root anyway.
- **B. Country of primary branch** — cross-country mgr loses other-country visibility.
- **C. Primary (first) branch only** — most restrictive; mgr sees < what they manage.
Awaiting owner pick.

### ⚠️ Mock data note (#4)
Coach-tier commission rates are PLACEHOLDER (Master 15 / Lead 12 / Senior 10 / Junior 8 %). Replace with real rates before go-live. Tracked here + as a code comment in the commission seed.

---

## 6. Real flags (not blockers)

- **Multi-currency**: tenant "move" spans MYR + THB + SGD; `services` has **no currency column**. Seeding priced rows works, but POS currency display across countries is an unsolved app-level gap. Parked.
- **Extended branch fields** (branch_tier, pricing_tier, tax_rate, operation_date, max_coach_capacity) have **no schema home** until proposed `migrations-proposed/0095_branch_details_migration_fields.sql` is promoted to `migrations/tenant/`. Seed core tree now; promote 0095 if those are needed.
- **No SG offerings** in the xlsx (only TH + MY) → SG branches get staff but no services.

---

## 7. Data-quality issues (from file inspection)

**Staff.csv**
- 124 rows; CRLF.
- `coach_tier` blank on 3 rows (all pure managers — legitimately empty).
- **Duplicate email** `<staff-email-redacted>` shared by STF-00146 and STF-00170 → email is unique; 2nd insert collides. Fix one before import.
- `staff_phone_no` free-form digits, no `+`, mixed country codes (60=MY, 66=TH, 65=SG) → E.164 normalize.
- `is_coach`/`is_manager` are literal `TRUE`/`FALSE` strings.
- `access_branch_name` multi-value: single unquoted, or comma-list in quotes → split on `, ` after CSV parse. Joins to `Location-Branch.branch_name`.

**Location-Branch.csv**
- 23 rows; CRLF.
- `business_registration_no` corrupted to sci-notation on 3 TH rows (`1.05567E+11`) — precision lost; not stored anyway.
- `max_coach_capacity` blank for MY-014 (MOVE SOLARIS, the only Inactive branch).
- `termination_date` sentinel `01-01-99` = "none"; only MOVE SOLARIS has a real date. Format `DD-MM-YY`.
- `tax_rate` is a `%`-string (`8.00%`) — strip + /100.

**Offering-Service.xlsx**
- 2 sheets. Sheet11 = 70 offerings (the table). Sheet1 = 260-row session lookup (dupes → ignore).
- `price_excluding_tax` is raw unrounded float (`7289.7196...`) → round to minor units.
- `tax_rate` is decimal float (`0.07`, `0.08`) — different representation than the CSV's `%`-string.
- Only TH + MY (no SG). `pricing_tier` Tier 3 / Tier 4.

---

## 8. Build artifacts (to be created)

- `apps/server/scripts/migration/adapters/csv.ts` — CSV → `RawRow[]` shim.
- `apps/server/scripts/migration/adapters/clients/move/manifest.ts` — MOVE column mapping (copy pt-franchise).
- Tenant provisioning step for "move" (P1–P3) — either reuse `seed-franchise-owner.ts` for the control-panel bootstrap or wire `neon.service.ts` provisioning + org-root before the migrator run.
- (Optional) promote `0095_branch_details_migration_fields.sql` if extended branch fields wanted.

## 9. Reference paths

- Orchestrator: `apps/server/scripts/migration/engine/run.ts`
- Canonical: `apps/server/scripts/migration/core/canonical.ts`
- Loaders: `apps/server/scripts/migration/core/loaders/`
- XLSX adapter: `apps/server/scripts/migration/adapters/xlsx.ts`
- Transforms: `apps/server/scripts/migration/adapters/transforms.ts`
- Template manifest: `apps/server/scripts/migration/adapters/clients/pt-franchise/manifest.ts`
- Crosswalk: `apps/server/scripts/migration/core/crosswalk.ts`
- Control-panel bootstrap template: `apps/server/scripts/seed-franchise-owner.ts`
- Commission wiring: `apps/server/scripts/seed-commission-config.ts`
- Encryption util: `packages/db/src/lib/encryption.ts` (env `ENCRYPTION_KEY`)

---

## 10. Next action

Owner provides the 3 inputs (§5) → implement manifest + CSV adapter → P1–P3 provision → P5 dry-run → review reconciliation → P6 commit.
