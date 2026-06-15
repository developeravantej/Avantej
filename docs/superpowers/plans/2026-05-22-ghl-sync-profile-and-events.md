# GHL Sync — Profile Render Fix, Field Mapping & Sync-Events Viewer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make synced GHL contact data actually render in the customer Profile form, map more GHL fields into the profile, and add an in-app viewer for raw GHL sync events.

**Architecture:** Three independent workstreams. (A) Web bug fixes in `customer-profile-panel.tsx` — form never binds fetched data on fresh load, and gender case mismatch. (B) Server sync mapping in `gohighlevel.service.ts` — normalize gender + extract/write emergency contact, address, real DOB, passport. (C) New tenant-scoped oRPC procedure `ghlSync.listEvents` + a "Sync Events" section on the existing GHL integration page.

**Tech Stack:** React + TanStack Router/Query (web, vitest), Hono + oRPC + Drizzle on Cloudflare Workers (server, bun:test), Neon Postgres (control-panel + per-tenant branches).

**Out of scope (flagged):** GHL `service` / `service_start_date` / `payment_method` / `currency` / `remark` / `primary_coach` are package/sales-order domain — they have **no** `customer_profiles` column and require package-instance creation logic. Not mapped here. Raise as a separate plan if needed.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/web/src/components/customers/customer-profile-panel.tsx` | Customer profile form (split-pane / dedicated page) — fix data binding + gender tolerance | Modify |
| `apps/web/src/components/customers/customer-detail-sheet.tsx` | Customer profile form (slide-in sheet) — **same bug, same fix** | Modify |
| `apps/web/src/lib/gender.ts` | Pure gender-normalization helper (shared, testable) | Create |
| `apps/web/src/lib/gender.test.ts` | Unit tests for gender helper | Create |
| `apps/server/src/services/gohighlevel.service.ts` | Normalize gender on write; extend `extractCustomFieldsForProfile`; write emergency/address/dob/passport + raw lead_acquisition_type | Modify |
| `apps/server/src/services/gohighlevel.service.test.ts` | Unit tests for new extraction + gender normalization | Modify |
| `packages/db/src/migrations/tenant/0072_customer_lead_acquisition_type.sql` | Tenant migration: add `customer_profiles.lead_acquisition_type` text column | Create |
| `packages/db/src/schema/tenant/customer-profiles.ts` | Add `leadAcquisitionType` column to schema | Modify |
| `packages/db/src/generated/tenant-migrations.generated.ts` | Regenerated via `bun gen:migrations` | Modify (generated) |
| `packages/services/src/customer-profile.service.ts` | (verify) `upsertCustomerProfile` already accepts emergency/address/dob — no change expected | Read |
| `packages/api/src/routers/ghl-sync.ts` | New `ghlSync.listEvents` tenant-scoped procedure | Create |
| `packages/api/src/routers/index.ts` | Register `ghlSync` router in `appRouter` | Modify |
| `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx` | Add "Sync Events" section consuming `ghlSync.listEvents` | Modify |

---

## Workstream A — Fix Profile form rendering

### Task 1: Extract + TDD a gender-normalization helper

GHL sends `"Male"`; the `<Select>` options are lowercase (`male`/`female`). Normalize any case/synonym to the canonical lowercase union the form uses.

**Files:**
- Create: `apps/web/src/lib/gender.ts`
- Test: `apps/web/src/lib/gender.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/gender.test.ts
import { describe, expect, it } from "vitest";
import { normalizeGender, type Gender } from "./gender";

describe("normalizeGender", () => {
	it("lowercases canonical values", () => {
		expect(normalizeGender("Male")).toBe<Gender>("male");
		expect(normalizeGender("FEMALE")).toBe<Gender>("female");
		expect(normalizeGender("Other")).toBe<Gender>("other");
	});
	it("maps prefer-not-to-say variants", () => {
		expect(normalizeGender("Prefer not to say")).toBe<Gender>("prefer_not_to_say");
		expect(normalizeGender("prefer_not_to_say")).toBe<Gender>("prefer_not_to_say");
	});
	it("returns empty string for unknown / nullish", () => {
		expect(normalizeGender(null)).toBe("");
		expect(normalizeGender(undefined)).toBe("");
		expect(normalizeGender("banana")).toBe("");
		expect(normalizeGender("")).toBe("");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/lib/gender.test.ts`
Expected: FAIL — `Cannot find module './gender'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/gender.ts
export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

const CANON: Record<string, Gender> = {
	male: "male",
	m: "male",
	female: "female",
	f: "female",
	other: "other",
	prefer_not_to_say: "prefer_not_to_say",
	"prefer not to say": "prefer_not_to_say",
};

/** Normalize any case/synonym to the canonical Gender union, or "" if unknown. */
export function normalizeGender(value: string | null | undefined): Gender | "" {
	if (!value) return "";
	const key = value.trim().toLowerCase();
	return CANON[key] ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/lib/gender.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/gender.ts apps/web/src/lib/gender.test.ts
git commit -m "feat(web): add gender normalization helper"
```

---

### Task 2: Fix form-population bug + use gender helper (split-pane panel)

> **Two components share this exact bug.** Both `customer-profile-panel.tsx` (split-pane / dedicated `/dashboard/customers/$id` page) and `customer-detail-sheet.tsx` (slide-in sheet) render the same "Profile" form, both keyed `[memberId]`, both cast `gender as Gender`, and both are mounted from `dashboard/_layout/customers/v2/view.tsx`. The screenshot's "Profile" header matches either. Task 2 fixes the panel; **Task 2b fixes the sheet identically.** Do both.

**Bug:** `useEffect(..., [memberId])` reads the loaded query result, but it is `undefined` on first render (still loading), so the effect bails; when data arrives, `memberId` is unchanged so the effect never re-runs → form stays empty on fresh load. Fix: re-run when the loaded record identity changes, but do **not** clobber unsaved edits (preserve the original intent of the eslint-disable).

**Files:**
- Modify: `apps/web/src/components/customers/customer-profile-panel.tsx:12` (import), `:232-249` (effect), `:238` (gender), `:494` (select value)

- [ ] **Step 1: Import the helper**

At the import block (around line 31), add:

```ts
import { normalizeGender } from "@/lib/gender";
```

- [ ] **Step 2: Replace the population effect**

Replace the existing effect (lines 232-249):

```ts
	useEffect(() => {
		if (!detail) return;
		const profile = detail.profile;
		setProfileForm({
			phone: profile?.phone ?? "",
			dateOfBirth: toDateInputValue(profile?.dateOfBirth),
			gender: (profile?.gender as Gender) ?? "",
			address: profile?.address ?? "",
			emergencyContactName: profile?.emergencyContactName ?? "",
			emergencyContactPhone: profile?.emergencyContactPhone ?? "",
			medicalNotes: profile?.medicalNotes ?? "",
			fitnessGoals: (profile?.fitnessGoals ?? []).join(", "),
			notes: profile?.notes ?? "",
		});
		setFormDirty(false);
		// intentional: profile in deps would wipe unsaved form edits on every background refetch
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [memberId]);
```

with:

```ts
	// Populate the form once data arrives for this member. Keyed on memberId +
	// the loaded profile id so it (a) runs when the fetched record first lands
	// on a fresh load, and (b) re-runs only when switching customers — never on
	// a background refetch of the same record, which would wipe unsaved edits.
	const loadedProfileKey = detail ? `${memberId}:${detail.profile?.id ?? "none"}` : null;
	useEffect(() => {
		if (!detail) return;
		const profile = detail.profile;
		setProfileForm({
			phone: profile?.phone ?? "",
			dateOfBirth: toDateInputValue(profile?.dateOfBirth),
			gender: normalizeGender(profile?.gender),
			address: profile?.address ?? "",
			emergencyContactName: profile?.emergencyContactName ?? "",
			emergencyContactPhone: profile?.emergencyContactPhone ?? "",
			medicalNotes: profile?.medicalNotes ?? "",
			fitnessGoals: (profile?.fitnessGoals ?? []).join(", "),
			notes: profile?.notes ?? "",
		});
		setFormDirty(false);
		// loadedProfileKey changes only on member switch or first data arrival.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadedProfileKey]);
```

> Note: `detail.profile.id` exists — `getById` returns the full `customerProfiles` row as `profile`. If `profile` is null (no profile yet) the key is `"<memberId>:none"`, which still flips from `null` → set once `detail` loads, so the effect runs exactly once.

- [ ] **Step 3: Verify the Select tolerates the normalized value**

The Select already reads `profileForm.gender || "_none"` (line 494). Since `gender` is now normalized to the canonical lowercase union, no further change is needed there. Confirm the value flows: open the file and check line ~494 reads `value={profileForm.gender || "_none"}`.

- [ ] **Step 4: Type-check**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun check-types`
Expected: PASS (no new errors in `customer-profile-panel.tsx`).

- [ ] **Step 5: Manual verification against the live app**

Servers are already running (web :3021, server :3020). With a synced customer present (`avantejtest@gmail.com`):
1. Log in at http://localhost:3021 as `franchisee@gmail.com` / `password123`.
2. Open `/dashboard/customers/v2/view`, select "Avantej TEST".
3. Confirm **Phone** shows `018-326 3131`, **Gender** shows `Male`, **Date of Birth** is populated (derived from age 45).
Expected: fields render filled, not placeholders.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/customers/customer-profile-panel.tsx
git commit -m "fix(web): bind customer profile form on fresh load + normalize gender render"
```

---

### Task 2b: Apply the identical fix to the slide-in sheet

**Files:**
- Modify: `apps/web/src/components/customers/customer-detail-sheet.tsx` — import (~line 12 area), effect (`:218-234`), gender cast (`:224`)

This component uses `data` (not `detail`) as its query result variable and has an `open` prop, but the bug and fix are otherwise identical to Task 2.

- [ ] **Step 1: Import the helper**

Add with the other `@/` imports:

```ts
import { normalizeGender } from "@/lib/gender";
```

- [ ] **Step 2: Replace the population effect**

Replace lines 216-234:

```ts
	// Populate form when a new customer's data arrives (not on every render).
	// Keying on memberId avoids blowing away user edits on background refetch.
	useEffect(() => {
		if (!data) return;
		const profile = data.profile;
		setProfileForm({
			phone: profile?.phone ?? "",
			dateOfBirth: toDateInputValue(profile?.dateOfBirth),
			gender: (profile?.gender as Gender) ?? "",
			address: profile?.address ?? "",
			emergencyContactName: profile?.emergencyContactName ?? "",
			emergencyContactPhone: profile?.emergencyContactPhone ?? "",
			medicalNotes: profile?.medicalNotes ?? "",
			fitnessGoals: (profile?.fitnessGoals ?? []).join(", "),
			notes: profile?.notes ?? "",
		});
		setFormDirty(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [memberId]);
```

with:

```ts
	// Populate the form once data arrives for this member. Keyed on memberId +
	// the loaded profile id so it runs when the fetched record first lands on a
	// fresh open, and re-runs only on member switch — never on a background
	// refetch of the same record, which would wipe unsaved edits.
	const loadedProfileKey = data ? `${memberId}:${data.profile?.id ?? "none"}` : null;
	useEffect(() => {
		if (!data) return;
		const profile = data.profile;
		setProfileForm({
			phone: profile?.phone ?? "",
			dateOfBirth: toDateInputValue(profile?.dateOfBirth),
			gender: normalizeGender(profile?.gender),
			address: profile?.address ?? "",
			emergencyContactName: profile?.emergencyContactName ?? "",
			emergencyContactPhone: profile?.emergencyContactPhone ?? "",
			medicalNotes: profile?.medicalNotes ?? "",
			fitnessGoals: (profile?.fitnessGoals ?? []).join(", "),
			notes: profile?.notes ?? "",
		});
		setFormDirty(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadedProfileKey]);
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 4: Manual verification**

In the v2 customers view, open the customer via the **slide-in sheet** path (the row action that opens the right-hand sheet, as opposed to the split-pane). Confirm Phone/Gender/DOB render filled for "Avantej TEST".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/customers/customer-detail-sheet.tsx
git commit -m "fix(web): bind customer detail sheet form on fresh load + normalize gender render"
```

---

## Workstream B — Server sync field mapping

### Task 3: Normalize gender on the sync write

So existing/new tenant rows store canonical lowercase gender (defense-in-depth alongside Task 1's render tolerance).

**Files:**
- Modify: `apps/server/src/services/gohighlevel.service.ts` (`extractCustomFieldsForProfile`, ~line 1101)
- Test: `apps/server/src/services/gohighlevel.service.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `gohighlevel.service.test.ts`:

```ts
import { extractCustomFieldsForProfile } from "./gohighlevel.service";

describe("extractCustomFieldsForProfile — gender normalization", () => {
	it("lowercases gender from GHL", () => {
		const cf = extractCustomFieldsForProfile({ contact: { gender: "Male" } });
		expect(cf.gender).toBe("male");
	});
	it("maps prefer-not-to-say and unknowns", () => {
		expect(extractCustomFieldsForProfile({ contact: { gender: "Prefer not to say" } }).gender).toBe("prefer_not_to_say");
		expect(extractCustomFieldsForProfile({ contact: { gender: "banana" } }).gender).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test src/services/gohighlevel.service.test.ts -t "gender normalization"`
Expected: FAIL — `cf.gender` is `"Male"`, not `"male"`.

- [ ] **Step 3: Add a server-side normalizer + use it**

Near the top helpers of `gohighlevel.service.ts`, add:

```ts
const GENDER_CANON: Record<string, string> = {
	male: "male", m: "male",
	female: "female", f: "female",
	other: "other",
	prefer_not_to_say: "prefer_not_to_say",
	"prefer not to say": "prefer_not_to_say",
};

function normalizeGenderValue(value: string | null): string | null {
	if (!value) return null;
	return GENDER_CANON[value.trim().toLowerCase()] ?? null;
}
```

In `extractCustomFieldsForProfile`, change the gender line (currently `gender: pick(["gender"]),`) to:

```ts
		gender: normalizeGenderValue(pick(["gender"])),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test src/services/gohighlevel.service.test.ts -t "gender normalization"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/gohighlevel.service.ts apps/server/src/services/gohighlevel.service.test.ts
git commit -m "feat(server): normalize GHL gender to canonical lowercase on sync"
```

---

### Task 4: Extract emergency contact, address, real DOB, passport from the payload

**Files:**
- Modify: `apps/server/src/services/gohighlevel.service.ts` — `GhlCustomFields` type (~1077) + `extractCustomFieldsForProfile` (~1100)
- Test: `apps/server/src/services/gohighlevel.service.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("extractCustomFieldsForProfile — contact detail fields", () => {
	it("extracts emergency contact, address, dob, passport", () => {
		const cf = extractCustomFieldsForProfile({
			contact: {
				emergency_name: "Jane Doe",
				emergency_contact_no: "+60111222333",
				full_address: "12 Jalan Ampang, KL",
				date_of_birth: "1989-04-01",
				nric_no__id_no: "A1234567",
			},
		});
		expect(cf.emergencyContactName).toBe("Jane Doe");
		expect(cf.emergencyContactPhone).toBe("+60111222333");
		expect(cf.address).toBe("12 Jalan Ampang, KL");
		expect(cf.dateOfBirth).toBe("1989-04-01");
		expect(cf.idPassport).toBe("A1234567");
	});
	it("leaves new fields null when absent", () => {
		const cf = extractCustomFieldsForProfile({ contact: { id: "x", email: "a@b.com" } });
		expect(cf.emergencyContactName).toBeNull();
		expect(cf.address).toBeNull();
		expect(cf.dateOfBirth).toBeNull();
		expect(cf.idPassport).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bun test src/services/gohighlevel.service.test.ts -t "contact detail fields"`
Expected: FAIL — properties undefined / type error.

- [ ] **Step 3: Extend the type + extractor**

Add to `GhlCustomFields` (after `leadOriginator`):

```ts
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	address: string | null;
	dateOfBirth: string | null; // ISO date string as provided by GHL
	idPassport: string | null;
```

Add to the returned object in `extractCustomFieldsForProfile` (after `leadOriginator: ...`):

```ts
		emergencyContactName: pick(["emergency_name", "emergency_contact_name"]),
		emergencyContactPhone: pick([
			"emergency_phone",
			"emergency_contact_no",
			"emergency_contact_phone",
		]),
		address: pick(["full_address", "address"]),
		dateOfBirth: pick(["dob", "date_of_birth", "dateOfBirth"]),
		idPassport: pick(["id_passport", "nric_no__id_no"]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bun test src/services/gohighlevel.service.test.ts -t "contact detail fields"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/gohighlevel.service.ts apps/server/src/services/gohighlevel.service.test.ts
git commit -m "feat(server): extract emergency/address/dob/passport from GHL payload"
```

---

### Task 4c: Add `lead_acquisition_type` text column (tenant migration)

`lead_acquisition_type` ("MARKETING") is currently resolved to a `lead_sources` FK (lookup-only, null if unmatched) and the raw value is otherwise lost. Persist it as raw text so the badge always renders. Follows the file-based tenant migration workflow (CLAUDE.md → "Tenant Migration Workflow").

**Files:**
- Create: `packages/db/src/migrations/tenant/0072_customer_lead_acquisition_type.sql`
- Modify: `packages/db/src/schema/tenant/customer-profiles.ts`
- Modify (generated): `packages/db/src/generated/tenant-migrations.generated.ts`

- [ ] **Step 1: Author the idempotent migration SQL**

```sql
-- packages/db/src/migrations/tenant/0072_customer_lead_acquisition_type.sql
-- Persist the raw GHL lead_acquisition_type alongside the resolved lead_source FK,
-- so the value survives even when no lead_sources lookup row matches.
ALTER TABLE customer_profiles
	ADD COLUMN IF NOT EXISTS lead_acquisition_type text;
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `packages/db/src/schema/tenant/customer-profiles.ts`, in the `=== 3.2 lead source / attribution ===` block (next to `campaignId`), add:

```ts
	// Raw GHL lead_acquisition_type text (badge display). Kept alongside the
	// resolved leadSourceId FK so the original value survives a lookup miss.
	leadAcquisitionType: text("lead_acquisition_type"),
```

- [ ] **Step 3: Regenerate the bundled migrations module**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun gen:migrations`
Expected: `packages/db/src/generated/tenant-migrations.generated.ts` now includes `0072_customer_lead_acquisition_type`.

- [ ] **Step 4: Verify generated module matches SQL**

Run: `bun verify:migrations`
Expected: PASS (no drift between SQL files and generated module).

- [ ] **Step 5: Apply to the dev tenant branch + confirm column exists**

The Worker runs migrations at request time, but apply explicitly to confirm. Restart the server (it runs `runTenantMigrations` per request), then fire any signed webhook (the request triggers migration). Then verify via the events page or by re-syncing. As a direct check, the column appears once a request to that org runs.

> If a direct DB check is desired, use the org tenant branch connection (decrypt `organization.connection_string` with `ENCRYPTION_KEY`) — out of band; not required for the task.

- [ ] **Step 6: Commit (SQL + schema + generated together)**

```bash
git add packages/db/src/migrations/tenant/0072_customer_lead_acquisition_type.sql packages/db/src/schema/tenant/customer-profiles.ts packages/db/src/generated/tenant-migrations.generated.ts
git commit -m "feat(db): add customer_profiles.lead_acquisition_type tenant column"
```

---

### Task 5: Write the new fields into customer_profiles (and passport into user)

`customer_profiles` insert/update is at lines ~811-841. Add emergency/address; prefer a real DOB over the age-derived one. Passport goes on the control-panel `user` row.

**Files:**
- Modify: `apps/server/src/services/gohighlevel.service.ts` — create branch (~793-842) and the `processDependentInGroup` path (~1000) if it writes profiles
- Test: manual integration via live webhook (server unit DB writes are integration-level; covered by manual verification)

- [ ] **Step 1: Compute an effective DOB**

After the existing `const dobFromAge = ...` line (~793), add:

```ts
	// Prefer an explicit DOB from GHL over the age-derived approximation.
	const explicitDob = customFields.dateOfBirth
		? (() => {
				const d = new Date(customFields.dateOfBirth as string);
				return Number.isNaN(d.getTime()) ? null : d;
			})()
		: null;
	const effectiveDob = explicitDob ?? dobFromAge;
```

- [ ] **Step 2: Use effectiveDob + write emergency/address/leadAcquisitionType in the INSERT**

In the `customerProfiles` insert (`.values({ ... })` ~813-823), replace `dateOfBirth: dobFromAge,` with `dateOfBirth: effectiveDob,` and add:

```ts
				emergencyContactName: customFields.emergencyContactName,
				emergencyContactPhone: customFields.emergencyContactPhone,
				address: customFields.address,
				leadAcquisitionType: customFields.leadAcquisitionType,
```

- [ ] **Step 3: Same fields in the UPDATE branch**

In the update `.set({ ... })` (~829-840), replace `dateOfBirth: dobFromAge ?? existingProfile.dateOfBirth,` with `dateOfBirth: effectiveDob ?? existingProfile.dateOfBirth,` and add:

```ts
				emergencyContactName: customFields.emergencyContactName ?? existingProfile.emergencyContactName,
				emergencyContactPhone: customFields.emergencyContactPhone ?? existingProfile.emergencyContactPhone,
				address: customFields.address ?? existingProfile.address,
				leadAcquisitionType: customFields.leadAcquisitionType ?? existingProfile.leadAcquisitionType,
```

- [ ] **Step 4: Write passport onto the user update**

In the control-panel `user` update `.set({ ... })` (~780-790), add:

```ts
				idPassportNo: customFields.idPassport ?? userRecord.idPassportNo,
```

(`userRecord` is the resolved/created user; `idPassportNo` is a column on the `user` table per `packages/db/src/schema/auth.ts:12`.)

> **Intentional — single write site.** Add `idPassportNo` to the user UPDATE only, NOT the INSERT. In the create branch the UPDATE (~778-791) always runs immediately after the INSERT (~745-764) on the same request, so a freshly created user still gets the passport. Do not also add it to the INSERT — that would create two write sites that can drift.

- [ ] **Step 5: Type-check**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 6: Manual integration verification**

Restart the server so the new code loads, then fire a signed webhook with the new fields and confirm via the events endpoint + UI.

```bash
# from repo root — fetch the webhook secret via a temp bun script
# (Neon's tagged-template sql uses ${...} interpolation, NOT positional $1 + array)
cd /Users/ngchwanlii/App/prod/avantej-core/apps/server
cat > /tmp/getsecret.ts <<'EOF'
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
const r = await sql`select webhook_secret from ghl_branch_links where ghl_location_id='G0izzPbelobw04MIntR1'`;
console.log(r[0].webhook_secret);
EOF
SECRET=$(DATABASE_URL=$(grep '^DATABASE_URL=' .dev.vars | sed 's/^DATABASE_URL=//; s/^"//; s/"$//') bun /tmp/getsecret.ts)
BODY='{"eventType":"create","contact":{"id":"detail-probe-001","first_name":"Detail","last_name":"Probe","email":"developer.avantej@gmail.com","phone":"+60123000111","gender":"Female","age":"30","emergency_name":"Jane Doe","emergency_contact_no":"+60111222333","full_address":"12 Jalan Ampang, KL","date_of_birth":"1995-02-15","nric_no__id_no":"A1234567"}}'
SIG=$(printf '%s' "${SECRET}.${BODY}" | openssl dgst -sha256 -hex | sed 's/^.* //')
curl -s -X POST "http://localhost:3020/webhooks/gohighlevel/G0izzPbelobw04MIntR1" -H "Content-Type: application/json" -H "x-wh-signature: sha256=${SIG}" -d "$BODY"
```

Then open the customer in the UI (Task 2 Step 5 flow) and confirm Address, Emergency Contact, Emergency Phone, DOB, Gender all render.
Expected: webhook returns `status:"processed"`; fields visible in the panel.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/gohighlevel.service.ts
git commit -m "feat(server): persist emergency/address/dob/passport from GHL sync"
```

---

## Workstream C — Sync-Events viewer

### Task 6: `ghlSync.listEvents` oRPC procedure

Tenant-scoped read of `ghl_sync_events` ordered newest-first, returning raw payload for inspection.

**Files:**
- Create: `packages/api/src/routers/ghl-sync.ts`
- Modify: `packages/api/src/routers/index.ts` (register router in `appRouter`, ~line 2787)

- [ ] **Step 1: Create the router**

```ts
// packages/api/src/routers/ghl-sync.ts
import { ghlSyncEvents } from "@avantej-core/db/schema/tenant/ghl-sync-events";
import { requirePermission } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../procedures";

export const ghlSyncRouter = {
	listEvents: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				limit: z.number().int().min(1).max(100).default(25),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", { message: "Member context required" });
			}
			await requirePermission(
				context.tenantDb,
				context.member,
				"user_management",
				"read",
			);
			return context.tenantDb
				.select({
					id: ghlSyncEvents.id,
					eventType: ghlSyncEvents.eventType,
					ghlContactId: ghlSyncEvents.ghlContactId,
					email: ghlSyncEvents.email,
					status: ghlSyncEvents.status,
					errorMessage: ghlSyncEvents.errorMessage,
					rawPayload: ghlSyncEvents.rawPayload,
					createdAt: ghlSyncEvents.createdAt,
				})
				.from(ghlSyncEvents)
				.orderBy(desc(ghlSyncEvents.createdAt))
				.limit(input.limit);
		}),
};
```

> Verify the import path for `protectedProcedure` matches a sibling router (open `packages/api/src/routers/customer-directory.ts` line 1-10 and copy its exact import for `protectedProcedure` and `requirePermission`). Adjust the two import lines above to match if they differ.

- [ ] **Step 2: Register in appRouter**

In `packages/api/src/routers/index.ts`, add the import at the top with the other router imports:

```ts
import { ghlSyncRouter } from "./ghl-sync";
```

Then add to the `appRouter` object literal (near where `ghl`/customer routers are merged, ~line 2787):

```ts
	ghlSync: ghlSyncRouter,
```

- [ ] **Step 3: Type-check**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun check-types`
Expected: PASS — `client.ghlSync.listEvents` is now typed end-to-end.

- [ ] **Step 4: Manual verification**

Server auto-reloads. Confirm the procedure responds via the oRPC HTTP endpoint while logged in (reuse the cookie flow):

```bash
curl -s -c /tmp/c.txt -X POST http://localhost:3020/api/auth/sign-in/email -H "Content-Type: application/json" -d '{"email":"franchisee@gmail.com","password":"password123"}' >/dev/null
curl -s -b /tmp/c.txt "http://localhost:3020/rpc/ghlSync/listEvents" -H "Content-Type: application/json" -d '{"organizationId":"996febce-aaad-4ded-8f47-02d2b566c8ee","limit":5}'
```

Expected: JSON array of events with `rawPayload`. (If the RPC path differs, confirm the mount prefix in `apps/server/src/index.ts`.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/routers/ghl-sync.ts packages/api/src/routers/index.ts
git commit -m "feat(api): add ghlSync.listEvents tenant-scoped procedure"
```

---

### Task 7: "Sync Events" section on the GHL integration page

**Files:**
- Modify: `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx`

- [ ] **Step 1: Add a query + render a section**

Inside `GoHighLevelIntegrationPage`, after the existing `organizationId` line, add a query:

```ts
	const { data: syncEvents } = useQuery({
		queryKey: ["ghlSync", "events", organizationId],
		queryFn: () =>
			client.ghlSync.listEvents({ organizationId: organizationId!, limit: 25 }),
		enabled: !!organizationId,
		staleTime: 30_000,
	});
```

Then, before the closing wrapper of the page's returned JSX, add a card:

```tsx
			<Card>
				<CardHeader>
					<CardTitle>Sync Events</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					{!syncEvents || syncEvents.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No sync events yet.
						</p>
					) : (
						syncEvents.map((e) => (
							<details key={e.id} className="rounded-md border px-3 py-2 text-sm">
								<summary className="flex cursor-pointer flex-wrap items-center gap-2">
									<Badge
										variant={
											e.status === "processed"
												? "default"
												: e.status === "failed"
													? "destructive"
													: "secondary"
										}
									>
										{e.status}
									</Badge>
									<span className="font-medium">{e.eventType}</span>
									<span className="text-muted-foreground">{e.email ?? "—"}</span>
									<span className="text-muted-foreground text-xs">
										{new Date(e.createdAt).toISOString().slice(0, 19).replace("T", " ")}
									</span>
									{e.errorMessage && (
										<span className="text-red-600 text-xs">{e.errorMessage}</span>
									)}
								</summary>
								<pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs">
									{JSON.stringify(e.rawPayload, null, 2)}
								</pre>
							</details>
						))
					)}
				</CardContent>
			</Card>
```

(`Card`, `CardHeader`, `CardTitle`, `CardContent`, `Badge`, `useQuery`, `client` are already imported in this file.)

- [ ] **Step 2: Type-check**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun check-types`
Expected: PASS.

- [ ] **Step 3: Manual verification**

Log in as `franchisee@gmail.com`, navigate to the GHL Integration page (sidebar → "GHL Integration"). Confirm a "Sync Events" card lists recent events; expanding one shows the raw JSON payload, and the earlier bad-signature event shows a red error + `failed` badge.
Expected: events render with expandable raw payloads.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_authenticated/go-highlevel-integration.tsx
git commit -m "feat(web): add GHL sync events viewer to integration page"
```

---

## Workstream D — Lead attribution badges

### Task 8: Render lead_acquisition_type + lead_originator as badges

Show two badges in the customer Profile (panel + sheet): the raw acquisition type (`profile.leadAcquisitionType`, e.g. "MARKETING") and the campaign / originator (`profile.campaignId`, e.g. "MMARKETING"). Both fields are on the `customerProfiles` row that `getById` already returns as `detail.profile` / `data.profile` — no API change needed (after Task 4c's column exists).

**Files:**
- Modify: `apps/web/src/components/customers/customer-profile-panel.tsx` (Profile `<CardContent>`, ~line 459)
- Modify: `apps/web/src/components/customers/customer-detail-sheet.tsx` (Profile `<Section>`, ~line 323)

- [ ] **Step 1: Add badges to the panel**

In `customer-profile-panel.tsx`, inside the Profile `<CardContent className="space-y-4">` (immediately after the opening tag, before the first field grid ~line 460), add:

```tsx
								{(profile?.leadAcquisitionType || profile?.campaignId) && (
									<div className="flex flex-wrap items-center gap-2">
										{profile?.leadAcquisitionType && (
											<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
												Lead source
												<Badge variant="secondary">{profile.leadAcquisitionType}</Badge>
											</span>
										)}
										{profile?.campaignId && (
											<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
												Campaign
												<Badge variant="secondary">{profile.campaignId}</Badge>
											</span>
										)}
									</div>
								)}
```

(`profile` is already destructured from `detail` at ~line 361; `Badge` is already imported.)

- [ ] **Step 2: Type-check the panel**

Run: `cd /Users/ngchwanlii/App/prod/avantej-core && bun check-types`
Expected: PASS. (If TS reports `leadAcquisitionType` missing on the profile type, Task 4c's schema change + a TS server reload is required first — confirm `leadAcquisitionType` is in `customerProfiles.$inferSelect`.)

- [ ] **Step 3: Add the same badges to the sheet**

In `customer-detail-sheet.tsx`, at the top of the Profile `<Section title="Profile" icon={User}>` body (~line 324), add the same block. Note this component exposes the profile as `data.profile`; bind to a local first:

```tsx
								{(data?.profile?.leadAcquisitionType || data?.profile?.campaignId) && (
									<div className="flex flex-wrap items-center gap-2">
										{data.profile.leadAcquisitionType && (
											<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
												Lead source
												<Badge variant="secondary">{data.profile.leadAcquisitionType}</Badge>
											</span>
										)}
										{data.profile.campaignId && (
											<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
												Campaign
												<Badge variant="secondary">{data.profile.campaignId}</Badge>
											</span>
										)}
									</div>
								)}
```

(Confirm `Badge` is imported in this file; if not, add `import { Badge } from "@/components/ui/badge";`.)

- [ ] **Step 4: Type-check + manual verification**

Run: `bun check-types` (expect PASS). Then re-sync the test contact (Task 5 Step 6 fires `lead_acquisition_type` + `lead_originator`), open the customer in both the panel and the sheet, and confirm two badges: `MARKETING` and `MMARKETING`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/customers/customer-profile-panel.tsx apps/web/src/components/customers/customer-detail-sheet.tsx
git commit -m "feat(web): show lead source + campaign badges on customer profile"
```

---

## Final verification

- [ ] **Lint + types + tests across the monorepo**

```bash
cd /Users/ngchwanlii/App/prod/avantej-core
bun check-types
bun check
cd apps/web && bun test src/lib/gender.test.ts
cd ../server && bun test src/services/gohighlevel.service.test.ts
```

Expected: all green.

- [ ] **End-to-end smoke**: fire one signed webhook (Task 5 Step 6), then confirm the customer renders fully in the profile panel **and** the event appears in the Sync Events viewer.

---

## Self-Review Notes

- **Spec coverage:** gender fix → Tasks 1-3 (render + sync, both layers, per user choice). Form-empty bug → Task 2. Extra field mapping (emergency/address/dob/passport) → Tasks 4-5 (per user "map them too"; `service`/`payment` explicitly out of scope as package-domain). Sync-events admin page via new oRPC procedure → Tasks 6-7 (per user "new oRPC procedure").
- **Type consistency:** `normalizeGender` (web) returns `Gender | ""`; `normalizeGenderValue` (server) returns `string | null`. `GhlCustomFields` new keys (`emergencyContactName`, `emergencyContactPhone`, `address`, `dateOfBirth`, `idPassport`) are used identically in Tasks 4 and 5. `ghlSync.listEvents` field set matches the `ghlSyncEvents` columns selected in Task 6 and consumed in Task 7.
- **Assumptions to verify during execution:** (1) `getById` returns `profile.id` (used for the effect key) — confirmed it returns the full `customerProfiles` row. (2) Exact import specifiers for `protectedProcedure` / `requirePermission` — copy from a sibling router. (3) oRPC HTTP mount prefix (`/rpc`) for the curl check.
