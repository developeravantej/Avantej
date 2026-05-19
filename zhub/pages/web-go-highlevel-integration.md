# GoHighLevel Integration Admin Dashboard

**Route:** `/go-highlevel-integration`
**File:** `apps/web/src/routes/_authenticated/go-highlevel-integration.tsx`
**Platform:** web
**Auth required:** authenticated, rbac(system_admin)
**Last updated:** 2026-05-12

---

## 1. What It Does

**Purpose (user perspective):** System admin debugging/monitoring dashboard for GoHighLevel webhook integration. View connected GHL locations, recent sync events, and contact links.

**Produces:** Multi-card dashboard showing: webhook setup instructions, connected locations dropdown, sync events table (limit 25), contact links table (limit 50), and location mapping form.

**On success:** Displays live data from server endpoints; allows admins to add new location mappings and view webhook payloads with field parsing.

**On failure / error states:** Error banner shows network/permission errors. Loading spinner shows during data fetch. Access denied message if user is not system admin.

---

## 2. How It Works

**Execution flow:**
1. Route guard checks `requireSystemAdmin()` → redirects to `/dashboard` if not admin
2. Component checks `useIsSystemAdmin()` hook
3. On mount, calls `loadLocations()` → fetches from `GET /webhooks/gohighlevel/locations`
4. When location selected, calls `loadLocationData()` → fetches events and links in parallel
5. Admin can save new location mapping via `POST /webhooks/gohighlevel/locations` with locationId + webhookSecret

**Inputs:** Location selection (dropdown); new location ID and webhook secret (form inputs); refresh button

**State management:** Local state for locations, selectedLocationId, events, links, loading, error, newLocationId, newSecret

**Outputs:** Direct fetch API calls to server (not via oRPC client). Navigation redirects to `/dashboard` if not admin.

**Side effects:** Fetches webhook data; creates location mappings; displays raw and parsed GHL payloads

---

## 3. What Depends On It

**Calls these API endpoints:**
- `GET /webhooks/gohighlevel/locations` — fetch all connected locations
- `GET /webhooks/gohighlevel/{locationId}/events?limit=25` — fetch recent sync events
- `GET /webhooks/gohighlevel/{locationId}/links?limit=50` — fetch contact links
- `POST /webhooks/gohighlevel/locations` — save new location mapping

**Uses these components:**
- `Card, CardContent, CardHeader, CardTitle` — `@/components/ui/card` — layout
- `Button` — `@/components/ui/button` — action buttons

**Uses these hooks:**
- `useIsSystemAdmin` — check system admin role
- `useMemo` — compute webhook URL preview
- `useState` — manage form and data state
- `useEffect` — load data on mount and location change

**Navigation: who navigates here:** System admin only (route guard enforces)

**Navigation: where it goes:** `/dashboard` if not admin (redirect in beforeLoad)

---

## 4. Data Shapes

**DB tables touched:** (Backend: ghl_locations, ghl_sync_events, ghl_contact_links)

**Key types / Zod schemas:**
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
  updatedAt: string;
  profileIsDeleted: boolean | null;
  profileDeletedAt: string | null;
};
```

---

## 5. Tests

**Test files:** None found

**Scenarios covered:** None

**Not tested (risk areas):** Admin auth bypass, malformed webhook payloads, rate limiting on endpoint hits, error handling for 500 responses, XSS via raw payload display

---

## 6. Notes

- Uses native `fetch` API instead of oRPC client (direct HTTP).
- Webhook URL preview shows template format when no location selected.
- Payload viewer shows both raw JSON and normalized field extraction (contact.id, email, phone, emergency contact info, etc.).
- Location mapping form accepts optional webhook secret for Bearer token security.
- Server URL loaded from `import.meta.env.VITE_SERVER_URL` (fallback `http://localhost:3000`).
- "Recent Sync Events" limited to 25; "Contact Links" limited to 50 per query.
- Missing error state for auth failures on individual API calls (only shows loading state).
- **2026-05-12 cleanup (commit `25f6d75b`):** Removed `console.*` debug logging and tightened type narrowing in payload extraction helpers (`extractParsedFieldsPreview`); behaviour and endpoints unchanged.

