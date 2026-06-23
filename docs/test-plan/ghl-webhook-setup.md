# Wiring the GHL → Avantej inbound webhook (human step, in GHL)

Goal: make GoHighLevel POST contact events to Avantej so real GHL-originated
inbound works (TC-13/14). Avantej is already ready to receive; this configures the
GHL side. Do it in the **MOVE Private Fitness Studio** sub-account.

## What you need

- **Webhook URL:**
  `https://avantej-core-server.ngchwanlii-a9c.workers.dev/webhooks/gohighlevel/G0izzPbelobw04MIntR1`
- **Shared secret:** the `webhook_secret` already stored for this location. Read it
  (don't guess): run `bun db:studio:control-panel` → open table `ghl_branch_links`
  → row where `ghl_location_id = G0izzPbelobw04MIntR1` → copy the `webhook_secret`
  value. (Tell me if it's empty and I'll set one.)

> Important: Avantej verifies a **shared secret**, NOT GHL's native marketplace
> RSA signature. So use a **Workflow → Webhook** action where you can add the
> secret as a header — the native "marketplace app" webhook won't authenticate.

## Steps (GHL dashboard)

1. Switch to the **MOVE Private Fitness Studio** sub-account.
2. Left menu → **Automation → Workflows** → **+ Create Workflow** (start from scratch).
3. **Add Trigger:**
   - `Contact Created` (add a second trigger `Contact Changed` later for updates), or
   - `Form Submitted` if you onboard via a GHL form.
4. **Add Action → Webhook** (Custom Webhook):
   - **Method:** `POST`
   - **URL:** the Webhook URL above
   - **Headers:** add a custom header
     - Key: `x-webhook-secret`
     - Value: the `webhook_secret` you copied
   - **Body / Payload:** ensure it includes the contact fields. Default GHL contact
     payload (id, firstName, lastName, phone, email, locationId) is fine. If you
     hand-build it, include at least `locationId` = `G0izzPbelobw04MIntR1` and the
     contact `id` + `phone` (or `email`).
5. **Save** → toggle the workflow to **Publish** (top right).

## Test it

1. In GHL Contacts, create a test contact (e.g. `ZZ Inbound Test`, a throwaway phone).
2. In Avantej → **GHL Integration → Sync Events**: within ~30s a new **processed**
   row should appear for that contact.
3. Avantej → **Customers**: the contact appears as a client.
4. Delete the test contact in GHL + the client in Avantej afterward.

## If it doesn't arrive

- **Nothing in Sync Events** → workflow not published, wrong URL, or no header secret.
- **`failed … Invalid webhook signature` / `Missing or invalid webhook authorization`**
  → the `x-webhook-secret` value doesn't match `ghl_branch_links.webhook_secret`.
  Re-copy the secret exactly.
- **404 `location_not_found`** → the URL's location id isn't `G0izzPbelobw04MIntR1`
  or the branch-link is inactive.

Once published, ping me and I'll record TC-13/14 against the real GHL-originated event.
