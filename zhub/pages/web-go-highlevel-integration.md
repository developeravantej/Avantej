# GoHighLevel Integration

**Route:** `/_authenticated/go-highlevel-integration`
**File:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx:1`
**Platform:** web
**Auth required:** authenticated + **platform admin only** (`requireSystemAdmin` beforeLoad + in-component gate, both added 2026-04-17)
**Last updated:** 2026-04-17

---

## 1. What It Does

**Purpose (user perspective):** Admin dashboard for monitoring and configuring the GoHighLevel (GHL) CRM webhook integration — shows connected locations, recent sync events, and contact-to-member links.
**Produces:** Four sections: (1) webhook setup instructions, (2) connected locations manager with add form, (3) recent sync events table with expandable payload viewer, (4) contact links table.
**On success:** Locations, sync events (last 25), and contact links (last 50) load on mount and when location selection changes.
**On failure / error states:** Inline red error banner displayed on any fetch failure. Refresh/Save buttons disabled during loading. Empty state rows shown when no data yet.

---

## 2. How It Works

**Execution flow:**
```
Route.beforeLoad
  → requireSystemAdmin("/dashboard")
    → reads user context from TanStack Query cache (fetches once if cold)
    → redirects to /dashboard?unauthorized=true when !ctx.isSystemAdmin

GoHighLevelIntegrationPage (renders only if beforeLoad passed)
  → useIsSystemAdmin() { isSystemAdmin, loading: adminLoading }
    → adminLoading  → return null
    → !isSystemAdmin → render "Access Denied" Card (defense in depth)
  → useEffect on mount: refresh()
    → GET /webhooks/gohighlevel/locations (credentials: include)
    → if selectedLocationId: loadLocationData(locationId)
      → GET /webhooks/gohighlevel/{locationId}/events?limit=25
      → GET /webhooks/gohighlevel/{locationId}/links?limit=50
  → useEffect on selectedLocationId change: loadLocationData(locationId)
  → saveLocationMapping():
    → POST /webhooks/gohighlevel/locations
      → body: { locationId, webhookSecret? }
    → refresh()
  → extractParsedFieldsPreview(event): normalizes rawPayload fields for display
```

**Inputs:**
- Location selector dropdown (changes viewed events/links)
- `newLocationId` text input (required to register)
- `newSecret` text input (optional webhook secret)

**State management:** All local React state — `locations[]`, `selectedLocationId`, `events[]`, `links[]`, `loading`, `error`, `newLocationId`, `newSecret`

**Outputs:**
- Webhook URL preview: `${VITE_SERVER_URL}/webhooks/gohighlevel/${selectedLocationId}`
- Tables of sync events and contact links
- `extractParsedFieldsPreview` normalizes ~20 GHL payload fields into a consistent shape

**Side effects:** POST registers a new location on the server

---

## 3. What Depends On It

**Calls these API endpoints (direct fetch, NOT oRPC):**
- `GET /webhooks/gohighlevel/locations` — list registered GHL locations
- `POST /webhooks/gohighlevel/locations` — register new location + optional webhook secret
- `GET /webhooks/gohighlevel/{locationId}/events?limit=25` — recent sync events
- `GET /webhooks/gohighlevel/{locationId}/links?limit=50` — GHL-to-user contact links

**Uses these components:** Shadcn UI primitives only (`Card`, `CardHeader`, `CardContent`, `CardTitle`, `Button`) — no custom components

**Uses these hooks:**
- `useIsSystemAdmin` — `apps/web/src/hooks/usePermissions.ts` — in-component gate (returns `{ isSystemAdmin, loading }`)
- Otherwise all state is local `useState` / `useEffect`

**Uses these guards:**
- `requireSystemAdmin` from `@/lib/route-guards` — route-level `beforeLoad` gate

**Navigation: who navigates here:**
- App sidebar: "GHL Integration" (last item in nav) → `/go-highlevel-integration`

**Navigation: where it goes:** No outbound navigation

---

## 4. Data Shapes

**Key types (defined locally in this file):**
```typescript
GhlLocation    { locationId, organizationId, isActive, createdAt, updatedAt }
GhlSyncEvent   { id, eventKey, eventType, ghlContactId, email, status, errorMessage, rawPayload, createdAt }
GhlContactLink { id, ghlContactId, userId, customerProfileId, syncStatus, lastSyncedAt, profileIsDeleted, profileDeletedAt, updatedAt }
```

**`extractParsedFieldsPreview` normalized output:**
`id`, `name`, `first_name`, `last_name`, `email`, `phone`, `id_passport`, `address_type`, `address`, `dob`, `emergency_name`, `emergency_phone`, `emergency_relationship`, `country`, `location`, `service`, `service_start_date`, `currency`, `payment_method`, `remark`, `primary_coach`

---

## 5. Tests

**Test files:** None found
**Scenarios covered:** N/A
**Not tested (risk areas):** Payload parsing edge cases; POST location registration error handling; credential-dependent fetch calls

---

## 6. Notes

- Uses direct `fetch()` calls with `credentials: "include"` — does NOT go through the oRPC client. Server URL from `VITE_SERVER_URL` env (defaults to `http://localhost:3000`).
- `extractParsedFieldsPreview` handles Thailand-specific custom field names (e.g., `select_main_branch_assigned_in_contract_for_service_thailand`) — this integration is primarily used for Thai operations.
- Described in its subtitle as "Demo sync flow" — likely an internal diagnostic/tooling page rather than a production feature.
- **Platform-admin-only** as of 2026-04-17 (Ticket A of the dashboard-completeness plan). `beforeLoad: requireSystemAdmin("/dashboard")` blocks non-admins before render; in-component `useIsSystemAdmin` check renders an Access Denied Card as defense in depth. Non-admins land on `/dashboard?unauthorized=true`.
- Backend `/webhooks/gohighlevel/*` endpoints are NOT protected by this frontend guard — they accept raw `fetch` calls. Backend auth on those endpoints is tracked as a follow-up (see `zplan/17-04_10-18_dashboard-completeness/00-overview.md` residual gaps).
