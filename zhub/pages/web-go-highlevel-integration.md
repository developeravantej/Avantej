# GoHighLevel Integration

**Route:** `/_authenticated/go-highlevel-integration`
**File:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx:1`
**Platform:** web
**Auth required:** authenticated (no RBAC permission check beyond `_authenticated` wrapper)
**Last updated:** 2026-04-15

---

## 1. What It Does

**Purpose (user perspective):** Admin/developer tool for managing the GoHighLevel (GHL) webhook integration — view connected GHL locations, add new location mappings, browse recent sync events, and inspect contact links between GHL contacts and Avantej users.

**Produces:** Four cards: (1) webhook setup instructions, (2) connected locations manager with add-new form, (3) recent sync events table with expandable raw+parsed payload viewer, (4) contact links table.

**On success:** Locations, events, and links populate on mount and on "Refresh". Adding a location mapping saves it and refreshes the list.
**On failure / error states:** Inline red error banner (`border-red-300 bg-red-50`) with error message. All async calls show loading via the "Loading..." button state.

---

## 2. How It Works

**Execution flow:**
```
GoHighLevelIntegrationPage
  → on mount: refresh()
      → GET {SERVER_URL}/webhooks/gohighlevel/locations (credentials: include)
      → if selectedLocationId:
          → GET {SERVER_URL}/webhooks/gohighlevel/{locationId}/events?limit=25
          → GET {SERVER_URL}/webhooks/gohighlevel/{locationId}/links?limit=50
  → on selectedLocationId change:
      → GET {SERVER_URL}/webhooks/gohighlevel/{locationId}/events?limit=25
      → GET {SERVER_URL}/webhooks/gohighlevel/{locationId}/links?limit=50
  → saveLocationMapping():
      → POST {SERVER_URL}/webhooks/gohighlevel/locations { locationId, webhookSecret? }
      → refresh()
```

**Inputs:**
- `newLocationId` — text input for new GHL location ID
- `newSecret` — optional webhook secret
- `selectedLocationId` — select dropdown to switch between connected locations

**State management:** All state in local `useState` — no React Query, no global state.

**Outputs:** Tables of events and contact links; webhook URL preview; location list.

**Side effects:**
- POST to register a new GHL location mapping persisted in the backend DB.
- All API calls use `credentials: "include"` (sends session cookies) via raw `fetch` — no oRPC.

---

## 3. What Depends On It

**Calls these API endpoints (raw fetch, not oRPC):**
- `GET /webhooks/gohighlevel/locations` — list connected GHL locations
- `POST /webhooks/gohighlevel/locations` — register a new location mapping
- `GET /webhooks/gohighlevel/{locationId}/events?limit=25` — fetch recent sync events
- `GET /webhooks/gohighlevel/{locationId}/links?limit=50` — fetch contact links

**Uses these components:**
- `Card`, `CardHeader`, `CardContent`, `CardTitle` — `@/components/ui/card`
- `Button` — `@/components/ui/button`
- Native `<input>`, `<select>`, `<table>` — no shadcn wrappers

**Uses these hooks:**
- `useState` (×5) — loading, error, locations, events, links, form fields
- `useEffect` (×2) — initial load, location change
- `useMemo` — webhook URL preview

**Navigation: who navigates here:**
- `apps/web/src/components/app-sidebar.tsx:246` — "GHL Integration" sidebar item under a tools/settings section

**Navigation: where it goes:** No outbound navigation.

---

## 4. Data Shapes

**DB tables touched (via backend webhook routes):**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| `ghl_locations` | SELECT, INSERT | `location_id`, `organization_id`, `is_active`, `webhook_secret` |
| `ghl_sync_events` | SELECT | `event_key`, `event_type`, `ghl_contact_id`, `email`, `status`, `error_message`, `raw_payload` |
| `ghl_contact_links` | SELECT | `ghl_contact_id`, `user_id`, `customer_profile_id`, `sync_status`, `last_synced_at` |

**Key local types:**
```typescript
type GhlLocation = {
  locationId: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type GhlSyncEvent = {
  id: string;
  eventKey: string;
  eventType: string;
  ghlContactId: string | null;
  email: string | null;
  status: string;
  errorMessage: string | null;
  rawPayload: Record<string, unknown> | null;
  createdAt: string;
};

type GhlContactLink = {
  id: string;
  ghlContactId: string;
  userId: string;
  customerProfileId: string | null;
  syncStatus: string;
  lastSyncedAt: string | null;
  profileIsDeleted: boolean | null;
};
```

---

## 5. Tests

**Test files:** None found.
**Scenarios covered:** N/A
**Not tested (risk areas):**
- `extractParsedFieldsPreview` field normalization logic is complex and entirely untested — it handles many GHL custom field name variants.
- No error handling for partial failures when loading events and links in parallel.
- Webhook secret is submitted in plaintext; no masking on the saved-state display.

---

## 6. Notes

- `SERVER_URL` is read from `import.meta.env.VITE_SERVER_URL` with fallback to `http://localhost:3000` — this is a direct backend URL, not proxied through `/rpc`.
- This page deliberately bypasses the oRPC client in favor of raw `fetch` — the GHL webhook routes are REST endpoints, not oRPC procedures.
- `extractParsedFieldsPreview` normalizes GHL field names from multiple naming conventions (snake_case, camelCase, long custom field names) — it is a client-side normalization preview only and does not affect what the backend stores.
- The page has no RBAC guard beyond `_authenticated` — any logged-in user can access it. This may be intentional for a developer/admin-only tool, but should be restricted if exposed to general staff.
- Events table is capped at 25 and links at 50 — no pagination controls.
