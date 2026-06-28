# GoHighLevel (GHL) Integration — Manual Test Cases (LIVE, operation-mapped)

For a tester running **against the real GHL sub-account** ("MOVE Private Fitness Studio",
location `G0izzPbelobw04MIntR1`). Every create/update/delete below writes **real records in
GHL** — each test has a **Cleanup** step that removes what it made on both sides.

> ⚠️ LIVE. Use clearly-marked `ZZ Test …` names + throwaway phone numbers so leftovers are
> easy to spot. Do cleanup immediately after each test.

## Before you start (preconditions)

| # | Requirement | Confirm |
|---|---|---|
| P1 | Avantej admin login | `franchisee@gmail.com` (admin, "Test Fitness Franchise") |
| P2 | App URL | Local `http://avantej.localhost:3021` · Staging `https://avantej-core-web.ngchwanlii-a9c.workers.dev` |
| P3 | Org connected to GHL | GHL Integration page → **✓ Connected** (`G0izzPbelobw04MIntR1`) |
| P4 | GHL dashboard access | The MOVE location (Contacts, Team/Users, Custom fields) |
| P5 | *(inbound only)* GHL webhook → Avantej | Webhook = `<server>/webhooks/gohighlevel/G0izzPbelobw04MIntR1` + shared secret via a GHL **Workflow → Webhook** action |

**Operation → GHL map** (what each test exercises):

| Test | Operation (UI) | System path | GHL effect |
|---|---|---|---|
| TC-01 | Connection status | `ghl.getOrgShared` | read-only |
| TC-02 | Connect org-shared | `ghl.connectOrgShared` → `validateGhlApiKey` + `ensureCustomFieldsExist` | validate + bootstrap fields |
| TC-03 | Create customer | `customerProfiles.create` → `fireCustomerSync(create)` | contact created |
| TC-04 | Edit customer | `customerProfiles.update` → `fireCustomerSync(update)` | contact updated |
| TC-05 | Delete/restore customer | `profile-lifecycle` → `fireCustomerSync(delete/update)` | contact archived/restored |
| TC-06 | Customer sync retry | `customer-profiles/ghl` → `fireCustomerSync(update)` | re-push |
| TC-07 | Add employee | `members.create` → `dispatchStaffSync(create)` | GHL user created |
| TC-08 | Change staff role | `members/role` → `dispatchStaffSync(update)` | user updated |
| TC-09 | Deactivate staff | `members/status` → `dispatchStaffSync` | user updated |
| TC-10 | Reassign staff branch | `members/scope` → `dispatchStaffSync(update)` | branch custom field |
| TC-11 | Edit staff profile | better-auth `user.update` → `dispatchProfileSync` | user updated |
| TC-12 | Staff sync retry | `members.retryGhlSync` | re-push |
| TC-13 | Inbound contact create | `POST /webhooks/gohighlevel/:loc` → `processGhlWebhook` | Avantej client created |
| TC-14 | Inbound contact update | same webhook | Avantej client updated |
| TC-15 | Bad signature rejected | webhook auth gate | 401, no record |
| TC-16 | Branch retry failed | `ghl.retryFailedSyncs` | re-push errored |

---

## A. Setup / Connection

### TC-GHL-01 — Connection status (read-only)
**Operation:** `ghl.getOrgShared`.
**Journey:**
1. Log in as admin → sidebar **SETTINGS → GHL Integration**.
2. Read the **Organization-Wide GHL Connection** card.
3. Scroll to **Branch Connections** + **Sync Events**.

**Expected:** ✓ Connected, location `G0izzPbelobw04MIntR1`, "Connected at" date, country-field count > 0; branch table + sync-event log render.
**Cleanup:** none.  **Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-02 — Connect org-shared (validate key + bootstrap custom fields) — LIVE
**Operation:** `ghl.connectOrgShared` → `validateGhlApiKey` (GET `/locations/:id`) + `ensureCustomFieldsExist` (creates gender, emergency contact, medical notes, credit points, internal notes).
**Preconditions:** a **spare/sandbox** GHL location + its Private Integration Token (do NOT disconnect the live one unless intended).
**Journey:**
1. GHL Integration page → if testing reconnect, click **Disconnect** on the org card (confirm).
2. In **GHL Location ID**, paste the location id; in **Private Integration Token**, paste the key.
3. Click **Connect**.
4. Watch for the success toast; card flips to **✓ Connected**.
5. In the **GHL dashboard → Settings → Custom fields**, confirm the Avantej fields exist (gender, emergency contact, etc.).

**Expected:** Connect succeeds only with a valid key+location; custom fields present in GHL afterward; bad key → "GHL API key is invalid…" error.
**Cleanup:** if you disconnected the real link, reconnect it with `G0izzPbelobw04MIntR1` + its key. Remove any test custom fields you don't want.
**Result:** ☐ Pass ☐ Fail — ____________

---

## B. Outbound — Customer (GHL Contacts)

### TC-GHL-03 — Create customer → GHL contact — LIVE
**Operation:** `customerProfiles.create` → `fireCustomerSync(operation:"create")` → upsert GHL contact.
**Journey:**
1. Sidebar → **Customers** → **Create Customer** (or POS → New Sale → Member → Create).
2. Enter: Name `ZZ Test Cust <date-time>`, Phone `+60 12-000 <4 rand>`, Email blank (or `zz-cust-<rand>@example.com`), assign **Main Branch**.
3. Save.
4. Open the new customer's profile → check the **GHL sync badge** (refresh after a few seconds → **Synced**).
5. GHL dashboard → **Contacts** → search the name/phone.

**Expected:** Avantej badge = **Synced**; matching GHL contact appears with tag `customer:active`, source "Avantej Sync"; phone matches.
**Cleanup:** delete the test customer in Avantej (TC-05 covers the delete-sync); delete the GHL contact.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-04 — Edit customer → GHL contact updated — LIVE
**Operation:** `customerProfiles.update` → `fireCustomerSync(update)`.
**Journey:**
1. Open the TC-03 test customer → **Edit**.
2. Change a synced field (e.g. last name → `ZZ Test Cust EDITED`, or gender / emergency contact).
3. Save.
4. GHL dashboard → Contacts → open the same contact.

**Expected:** the edited value appears on the GHL contact (name, or the mapped custom field) within seconds.
**Cleanup:** revert or delete in TC-05.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-05 — Delete + restore customer → GHL contact — LIVE
**Operation:** delete → `fireCustomerSync(delete)`; restore → `fireCustomerSync(update)`.
**Journey:**
1. Open the test customer → **Delete** (confirm).
2. GHL dashboard → Contacts → open the contact → check it is archived / `customer:active` tag removed (per delete handler).
3. In Avantej, **Restore** the customer (if the UI exposes restore).
4. GHL → confirm the contact is active again.

**Expected:** delete reflects in GHL (archive/untag); restore re-activates.
**Cleanup:** final delete in Avantej + delete contact in GHL.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-06 — Customer sync retry (force fail → recover) — LIVE
**Operation:** `customer-profiles/ghl` retry → `fireCustomerSync(update)`.
**Journey:**
1. Create a customer while GHL is briefly unreachable (or with a temporarily wrong key) so its badge shows **Error**.
2. Restore the correct key/connection.
3. On the customer (or GHL Integration branch row), click **Retry**.
4. Re-check the badge / GHL contact.

**Expected:** badge moves Error → Synced; contact now present in GHL.
**Cleanup:** delete customer + GHL contact.
**Result:** ☐ Pass ☐ Fail — ____________

---

## C. Outbound — Staff (GHL Users)

### TC-GHL-07 — Add employee → GHL user — LIVE
**Operation:** `members.create` → `dispatchStaffSync(create)` (uses `GHL_AGENCY_ID` companyId).
**Journey:**
1. Sidebar → **Employees** → **Add employee**.
2. Name `ZZ Staff Test <time>`, email `zz-staff-<rand>@example.com`, branch **Main Branch**, a staff role.
3. Save / send invite.
4. Access-control members tab → confirm the **GHL sync badge** on the new staff.
5. GHL dashboard → **Settings → Team / Users** → search the name/email.

**Expected:** badge = Synced; a matching GHL user exists.
**Cleanup:** deactivate/delete the employee in Avantej; delete the GHL user.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-08 — Change staff role → GHL user updated — LIVE
**Operation:** `members/role` → `dispatchStaffSync(update)`.
**Journey:**
1. Open the TC-07 staff → change role (e.g. trainer → manager).
2. Save.
3. GHL → Users → open the user, check role/permission reflects (per mapping).

**Expected:** GHL user updated.  **Cleanup:** revert / delete in TC-07 cleanup.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-09 — Deactivate staff → GHL user — LIVE
**Operation:** `members/status` → `dispatchStaffSync`.
**Journey:**
1. Open the TC-07 staff → **Deactivate**.
2. GHL → Users → confirm the user is disabled/updated per the deactivate mapping.

**Expected:** GHL user reflects deactivation.  **Cleanup:** delete in TC-07.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-10 — Reassign staff branch → GHL branch custom field — LIVE
**Operation:** `members/scope` → `dispatchStaffSync(update)` (writes the branch custom field).
**Journey:**
1. Open the TC-07 staff → reassign to a different branch.
2. Save.
3. GHL → Users → the user's branch custom field shows the new branch name.

**Expected:** branch custom field updated on the GHL user.  **Cleanup:** delete in TC-07.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-11 — Edit staff profile (name/email) → GHL user updated — LIVE
**Operation:** better-auth `databaseHooks.user.update.after` → `dispatchProfileSync`.
**Journey:**
1. Edit the TC-07 staff's name (or have them edit their own profile).
2. Save.
3. GHL → Users → name updated.

**Expected:** GHL user name/email updated.  **Cleanup:** delete in TC-07.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-12 — Staff sync retry — LIVE
**Operation:** `members.retryGhlSync`.
**Journey:**
1. Find a staff with an **Error** GHL badge (or force one as in TC-06).
2. Click **Retry** on the member row.
3. Re-check badge + GHL user.

**Expected:** Error → Synced; GHL user present.  **Cleanup:** delete test staff + GHL user.
**Result:** ☐ Pass ☐ Fail — ____________

---

## D. Inbound — Webhook (GHL → Avantej)

> Needs P5 (webhook configured in GHL). Without it, nothing arrives — a GHL setup gap, not a bug.

### TC-GHL-13 — GHL contact create → Avantej client — LIVE
**Operation:** `POST /webhooks/gohighlevel/:loc` → `processGhlWebhook` (create).
**Journey:**
1. GHL dashboard (MOVE location) → create a contact: `Inbound Test <time>`, phone `+60 12-111 <4 rand>` (a GHL form/workflow submit also works).
2. Wait ~10–30s.
3. Avantej → **GHL Integration → Sync Events** → newest row.
4. Expand it → verify payload.
5. Avantej → **Customers** → search the new contact.

**Expected:** Sync Events row **processed**; payload matches; a new **client** in Customers.
**Cleanup:** delete the client in Avantej + the contact in GHL.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-14 — GHL contact update → Avantej client updated — LIVE
**Operation:** same webhook (update).
**Journey:**
1. In GHL, edit the TC-13 contact (e.g. change last name).
2. Wait → Avantej Sync Events shows a new **processed** update; the client's field updates.

**Expected:** Avantej client reflects the GHL edit.  **Cleanup:** delete client + contact.
**Result:** ☐ Pass ☐ Fail — ____________

### TC-GHL-15 — Bad/unsigned webhook rejected (negative)
**Operation:** webhook auth gate (`verifyGhlWebhookAuth`).
**Journey:** (tech tester) send an unsigned/wrong-secret POST to the webhook URL → server returns **401** and **no** record is created. (Non-tech: confirm Sync Events shows historical `failed … Invalid webhook signature` rows.)
**Expected:** 401, nothing written.  **Cleanup:** none.
**Result:** ☐ Pass ☐ Fail — ____________

---

## E. Error handling

### TC-GHL-16 — Branch-level retry of failed syncs — LIVE
**Operation:** `ghl.retryFailedSyncs`.
**Journey:**
1. GHL Integration → **Branch Connections** → find a branch with a red **"N failed"** badge.
2. Click **Retry**.
3. Read the toast.

**Expected:** toast "Retried N: X recovered, Y still failing"; failed count drops.
**Cleanup:** none.  **Result:** ☐ Pass ☐ Fail — ____________

---

## Summary checklist

| Test | Operation | Pass |
|---|---|---|
| TC-01 | Connection status | ☐ |
| TC-02 | Connect org-shared | ☐ |
| TC-03 | Create customer → contact | ☐ |
| TC-04 | Edit customer → contact | ☐ |
| TC-05 | Delete/restore customer | ☐ |
| TC-06 | Customer retry | ☐ |
| TC-07 | Add employee → user | ☐ |
| TC-08 | Change role | ☐ |
| TC-09 | Deactivate staff | ☐ |
| TC-10 | Reassign branch | ☐ |
| TC-11 | Edit profile | ☐ |
| TC-12 | Staff retry | ☐ |
| TC-13 | Inbound create | ☐ |
| TC-14 | Inbound update | ☐ |
| TC-15 | Bad signature rejected | ☐ |
| TC-16 | Branch retry failed | ☐ |
