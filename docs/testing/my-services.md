# My Services — Trainer Flow Protocol

> **Page:** `/dashboard/my-services/view`
> **Covers behaviors:** MS1, MS2, MS3, MS4 (plan §4.5)
> **Prerequisite:** Full seed data loaded and **trainer** login completed per `docs/testing/_setup.md` §0, §1, §2.3 (login as `trainer.deterministic@test.com` / `password123`).
> **Result file:** On execution, write results to `zdocs/testing-results/<YYYY-MM-DD-HHMM>_my-services.md` per `_setup.md` §5.

Any override set in this run is cleared in §4 Cleanup.

---

## Pre-conditions

- Trainer session cookie present (`better-auth.session_token`).
- Fixture resolver (`_setup.md §1.2`) returns a defined `serviceId` for `E2E Test Session`. The seeded trainer (`trainer.deterministic@test.com`) is assigned to this service.
- No leftover override: `serviceMembers.listMine` for this trainer returns the `E2E Test Session` row with `bufferTimeMinutes === null`. If non-null, run §4 Cleanup first.

Probe:

```js
const organizationId = "996febce-aaad-4ded-8f47-02d2b566c8ee";
const res = await fetch("/rpc/serviceMembers/listMine", {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ json: { organizationId } }),
});
const rows = (await res.json()).json;
return {
  count: rows.length,
  overridesNotNull: rows.filter((r) => r.bufferTimeMinutes != null).map((r) => ({ serviceId: r.serviceId, v: r.bufferTimeMinutes })),
};
```

Expected: `overridesNotNull` is empty. If not, clear each via the fetch in §2 step 7 before continuing.

---

## §1 — List (MS1)

The page scopes everything to the calling member (`serviceMembers.listMine` uses `context.member.id`, no permission gate).

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Go to `http://localhost:3001/dashboard/my-services/view` | Heading `My Services`; description `Manage your buffer time per assigned service.`; table renders with one row per assigned service | `mcp__claude-in-chrome__navigate` then `mcp__claude-in-chrome__read_page` |
| 2 | Assert the table includes a row for `E2E Test Session` | Service column shows `E2E Test Session`; sub-line shows category name `E2E Category` | `mcp__claude-in-chrome__javascript_tool` → read tbody text |
| 3 | For the `E2E Test Session` row, assert the `Category Default` column shows the seeded value. With the seed `bufferTimeMinutes: 15`, the cell reads `15 min`. If the category's buffer was changed by a previous run (§3 of `service-category.md` sets it to 0 → `None`), the cell would read `None`. Record the actual value. | Cell text is `15 min` OR `None` (see `my-services/view.tsx:136-144`) | `mcp__claude-in-chrome__javascript_tool` |
| 4 | For the `E2E Test Session` row, assert the `My Override` column shows `— (using default)` (see `my-services/view.tsx:153`) — no badge | Cell text literally contains `— (using default)` | `mcp__claude-in-chrome__javascript_tool` |
| 5 | Snapshot the network calls fired during load | Expected: exactly one POST `/rpc/serviceMembers/listMine` | `mcp__claude-in-chrome__read_network_requests` |
| 6 | Confirm the trainer does **not** see any service they are not assigned to. The table row count matches the count returned by `listMine` in Pre-conditions. | Row count in the DOM equals `rows.length` from the probe | `mcp__claude-in-chrome__javascript_tool` |

---

## §2 — Override CRUD (MS2, MS3)

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Click **Edit** on the `E2E Test Session` row | `Sheet` opens; title `Set Buffer Time`; description `Override the default buffer time for this service.` Service field read-only `E2E Test Session`. Category field read-only. Input `buffer-input` pre-filled empty. Footer: Cancel + Save (no Clear Override button yet, because current override is null — see `my-services/view.tsx:306`). | `mcp__claude-in-chrome__find` by button text + click |
| 2 | Type `10` into the `buffer-input` input | Value = 10 | `mcp__claude-in-chrome__form_input` |
| 3 | Click **Save** | `serviceMembers.updateMyBuffer` POST fires with `{ organizationId, serviceId, bufferTimeMinutes: 10 }`; toast `Buffer time updated.`; Sheet closes; table refetches (cache key `["myServices", organizationId]` invalidated) | `mcp__claude-in-chrome__read_page` + `mcp__claude-in-chrome__read_network_requests` |
| 4 | Assert the `E2E Test Session` row's `My Override` column shows a `10 min` badge (per `my-services/view.tsx:156`: `<Badge variant="outline">{val} min</Badge>`) | Cell contains `10 min` (wrapped in a badge element) | `mcp__claude-in-chrome__javascript_tool` |
| 5 | Click **Edit** on the row again | Sheet re-opens; `buffer-input` pre-filled with `10`; footer now includes a **Clear Override** button (only rendered when current value is non-null — `my-services/view.tsx:306`) | `mcp__claude-in-chrome__read_page` |
| 6 | Click **Clear Override** | `updateMyBuffer` fires with `bufferTimeMinutes: null`; toast `Buffer time updated.`; Sheet closes; row's `My Override` reverts to `— (using default)` | `mcp__claude-in-chrome__read_page` |
| 7 | Assert the override row was deleted in `member_service_buffer_overrides`: re-fetch `serviceMembers.listMine` and confirm the `E2E Test Session` row's `bufferTimeMinutes === null`. (The router has no `listMyOverrides` procedure — `listMine` is the authoritative read path for this member's overrides.) | Payload row has `bufferTimeMinutes: null` | `mcp__claude-in-chrome__javascript_tool` |

**Payload snippet for step 7:**

```js
const res = await fetch("/rpc/serviceMembers/listMine", {
  method: "POST", credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    json: { organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
  }),
});
const rows = (await res.json()).json;
return rows.find((r) => r.serviceName === "E2E Test Session");
// expect: { ..., bufferTimeMinutes: null }
```

---

## §3 — RBAC boundary (MS4)

Verify `updateMyBuffer` rejects attempts to mutate a service the trainer is **not** assigned to. Per `service-members.ts:102-106`, the handler throws `NOT_FOUND` with message `"You are not assigned to this service."` (exact string, trailing period).

### §3.1 Obtain an unassigned `serviceId`

`serviceMembers.listMine` returns only services the trainer IS assigned to — we need one the trainer is NOT. Staff-facing member RBAC prevents listing all services, but `services.list` is exposed to authenticated members for catalog reads:

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Fetch `services.list` as the trainer | Returns an array of services for the org | `mcp__claude-in-chrome__javascript_tool` → `fetch("/rpc/services/list", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ json:{ organizationId } }) })` |
| 2 | Cross-reference with `serviceMembers.listMine` to find a `serviceId` in `services.list` but NOT in `listMine` | Record `unassignedServiceId` | `mcp__claude-in-chrome__javascript_tool` |
| 3 | If no unassigned service exists (trainer assigned to all active services), abort §3 and record this in the result file. The RBAC assertion cannot be executed in that fixture state. | Record blocker | n/a |

```js
const organizationId = "996febce-aaad-4ded-8f47-02d2b566c8ee";
async function rpc(p, i) {
  const r = await fetch(`/rpc/${p}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { ...i, organizationId } }),
  });
  return (await r.json()).json;
}
const [all, mine] = await Promise.all([rpc("services/list", {}), rpc("serviceMembers/listMine", {})]);
const mineIds = new Set(mine.map((r) => r.serviceId));
return all.find((s) => !mineIds.has(s.id))?.id ?? null;
```

### §3.2 Attempt the forbidden update

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | From the console, POST `/rpc/serviceMembers/updateMyBuffer` with the unassigned `serviceId` and `bufferMinutes: 10`. (Note: the parameter name in the wire input is `bufferTimeMinutes`, not `bufferMinutes` — use `bufferTimeMinutes`.) | HTTP status 404 (NOT_FOUND); response body `error.message === "You are not assigned to this service."` | `mcp__claude-in-chrome__javascript_tool` |
| 2 | Confirm no row was written: re-fetch `serviceMembers.listMine`; the trainer's override list is unchanged | Row count and `bufferTimeMinutes` values identical to §2 step 7 state | `mcp__claude-in-chrome__javascript_tool` |

**Attack payload for step 1:**

```js
const res = await fetch("/rpc/serviceMembers/updateMyBuffer", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    json: {
      organizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
      serviceId: "<unassignedServiceId from §3.1>",
      bufferTimeMinutes: 10,
    },
  }),
});
return { status: res.status, body: await res.json() };
// expect: status 404, body.json?.error?.message or body.error?.message ~ "You are not assigned to this service."
```

(Exact response shape depends on oRPC's error envelope — inspect and record the full JSON. Passing assertion is: HTTP 4xx AND the message substring `not assigned to this service` appears somewhere in the response.)

---

## §4 — Cleanup

Reverses any state this run may have left behind. Must run even on failure.

| # | Action | Expected observation | MCP tool |
|---|--------|----------------------|----------|
| 1 | Ensure the `E2E Test Session` override is `null` for this trainer: call `serviceMembers.updateMyBuffer({ organizationId, serviceId, bufferTimeMinutes: null })` | Response `{ serviceId, bufferTimeMinutes: null }` | `mcp__claude-in-chrome__javascript_tool` |
| 2 | Re-run the Pre-conditions probe | `overridesNotNull` is empty | `mcp__claude-in-chrome__javascript_tool` |
| 3 | (Optional) Sign out of the trainer account so the next run starts from a cold state per `_setup.md §0.3` | Session cookie cleared | `mcp__claude-in-chrome__javascript_tool` |

---

### See Also

- Integration of these three cascade levels (override → service → category default → 0) is verified end-to-end in `cross-flow_service-to-booking.md §7`.
- Raw buffer enforcement lives in `appointment-view.md §4`.
