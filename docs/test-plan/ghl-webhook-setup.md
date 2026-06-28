# GoHighLevel → Avantej inbound webhook — setup guide

How to wire a GHL sub-account so that creating/updating a contact in GHL pushes
it into Avantej (and, when the approval gate is on, into the **Inbound Approval
Queue** on the GHL Integration page).

> Verified against the live code + the deployed prod server on 2026-06-25.

---

## TL;DR

In the GHL sub-account, add a **Workflow** that, on contact create/update,
fires a **Custom Webhook (POST)** to:

```
POST https://avantej-core-server.ngchwanlii-a9c.workers.dev/webhooks/gohighlevel/<LOCATION_ID>
```

…with the Avantej webhook **secret** sent as a header:

```
x-ghl-webhook-secret: <the org's 48-char secret>
```

That's it. **Do NOT use GHL's built-in/native "Webhook"** — it signs with
`x-wh-signature` (RSA) which Avantej does not validate → every call 401s.

---

## 1. Values you need

| Thing | Where to get it | Current value (MOVE / Test Fitness Franchise) |
|---|---|---|
| Server base URL | deployed prod server | `https://avantej-core-server.ngchwanlii-a9c.workers.dev` |
| `LOCATION_ID` | the GHL sub-account location id | `G0izzPbelobw04MIntR1` |
| Webhook secret | GHL Integration page (shown once on connect) **or** DB `organizations.ghl_webhook_secret` | 48 chars, starts `2551aa…`, ends `…f5c0` |

Full webhook URL for this tenant:

```
https://avantej-core-server.ngchwanlii-a9c.workers.dev/webhooks/gohighlevel/G0izzPbelobw04MIntR1
```

---

## 2. Configure the GHL Workflow

1. GHL sub-account → **Automation → Workflows → Create Workflow**.
2. **Trigger:** *Contact Created* (add a second workflow / trigger for
   *Contact Updated* if you also want edits to sync).
3. **Action:** *Custom Webhook* (a.k.a. "Webhook" action inside a workflow — NOT
   the account-level native webhook integration).
   - **Method:** `POST`
   - **URL:** the full webhook URL above
   - **Headers:** add `x-ghl-webhook-secret` = `<secret>`
     *(alternatives that also work: `?secret=<secret>` or `?token=<secret>` in
     the URL query, or `Authorization: Bearer <secret>`)*
   - **Body:** JSON. Include the contact fields (see §3). GHL's default
     contact payload works; map your custom fields to the keys below.
4. Save + publish the workflow.

---

## 3. Fields Avantej reads from the payload

The handler accepts both a **nested** (`{ contact: { … } }`) and a **flat**
payload. Useful keys (custom-field labels on the GHL side map to these):

| Avantej meaning | Payload key(s) |
|---|---|
| Contact id (required) | `contact.id` / `id` |
| Name | `first_name` + `last_name` / `name` |
| Phone | `phone` |
| Email | `email` (phone-only contacts get a placeholder email) |
| **Country** | `selected_country` ← bind to `{{contact.designated_country}}` |
| **Branch** | `selected_location` ← bind to `{{contact.designated_branch}}` |
| Primary coach | `primary_coach` / primary-staff custom field |
| DOB, address, emergency contact, etc. | `dob`, `address`, `emergency_name`, `emergency_phone`, … |

> Branch resolution: `selected_location` is matched (country-scoped first) to an
> Avantej branch; unmatched → the org's fallback branch. This is why `country` +
> `location` should be sent.

---

## 4. Auth behavior (what passes / fails)

Verified against the deployed server:

| Request | Result |
|---|---|
| Correct secret via `x-ghl-webhook-secret` header | **200**, processed (or held — see §5) |
| Correct secret via `?secret=` query | **200** |
| `Authorization: Bearer <secret>` | **200** |
| No secret | **401** `missing_webhook_auth` |
| GHL native `x-wh-signature` (RSA) | **401** `invalid_signature` ← **do not use native webhook** |

---

## 5. Approval gate (optional)

Per org flag `organizations.ghl_require_approval` (toggle on the GHL Integration
page → "Inbound Approval Queue"):

- **OFF (default):** an inbound contact is created as a member immediately.
- **ON:** a brand-new contact is **held** in the Approval Queue; a manager
  clicks **Approve** (→ member created) or **Reject**. Updates to already-linked
  contacts are never gated.

---

## 6. Verify it works

1. In GHL, create a test contact (fill country + location custom fields).
2. In Avantej → **GHL Integration** page:
   - **Sync Events** list shows a new row: `processed` (gate off) or `pending`
     (gate on).
   - With gate ON, the contact appears in the **Inbound Approval Queue**.
3. If you see nothing:
   - **Sync Events shows `failed / Invalid webhook signature`** → GHL is sending
     `x-wh-signature` (native webhook). Switch to a **workflow Custom Webhook**
     with the secret header.
   - **`failed / Missing or invalid webhook authorization`** → the secret header
     is missing or wrong. Re-copy the secret.
   - **Nothing arrives at all** → the GHL workflow isn't firing / wrong URL.
     Check the workflow is published and the URL/location id are exact.

---

## 7. Quick manual test (curl)

```bash
SECRET="<paste full 48-char secret>"
curl -i -X POST \
  "https://avantej-core-server.ngchwanlii-a9c.workers.dev/webhooks/gohighlevel/G0izzPbelobw04MIntR1" \
  -H "Content-Type: application/json" \
  -H "x-ghl-webhook-secret: $SECRET" \
  -d '{"type":"ContactCreate","contact":{"id":"manual-test-1","first_name":"Manual","last_name":"Test","phone":"+60112223333","selected_country":"Malaysia","selected_location":"SS2"}}'
```

Expect `200` with `"status":"processed"` (gate off) or `"status":"pending_approval"` (gate on).
