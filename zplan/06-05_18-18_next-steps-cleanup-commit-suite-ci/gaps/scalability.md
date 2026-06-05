# Scalability / Runtime-Correctness Audit — Task C

**Target:** `apps/server/src/middleware/orpc-tenant.middleware.ts` (runs on EVERY `/rpc` request in a Cloudflare Worker)
**Plan:** `zplan/06-05_18-18_next-steps-cleanup-commit-suite-ci/prompts/06-05_18-33_server-holding-it-back.md` — Task C
**Scope:** Only production code change in the plan. Rest is test code (no runtime impact).

---

## Summary

Task C is a logging + public-endpoint-predicate **cleanup**. It is low-risk and a genuine (if modest) win. The console.log on the happy path (line 200) fires on every successful request and is correctly identified for removal. The one real caution is correctness: the public-endpoint consolidation must **not reorder the security gates** (org-existence 403 at line 149, suspension 403 at line 156) relative to `getTenantDb`, and must **not change which endpoints skip the session requirement** (line 187). The current code already runs the full suspension/DB chain even for public invitation endpoints — that behavior must be preserved unless the plan explicitly intends to change it (it does not).

No CRITICAL/HIGH findings. Nothing here causes deadlock or data loss under load.

---

## Findings

### F1 — Happy-path `console.log` on every successful request — LOW/MEDIUM (in plan scope; remove)
- **Line 200-203:** `console.log("✅ Tenant DB set up successfully for organization:", organizationId)` fires on **every** successful oRPC request.
- In Cloudflare Workers, `console.log` output is shipped to the logging pipeline (Tail Workers / Logpush / dashboard logs). At scale this is non-trivial: per-request CPU for serialization + log-ingestion cost + noise that buries real errors. It is pure debug noise — it conveys nothing actionable on the success path.
- **Verdict:** Gating/removing it is a genuine perf + observability win. Confirmed correct for the plan.

### F2 — Other unconditional hot-path logs the plan should also gate — LOW/MEDIUM (recommend folding into Task C)
The plan calls out line ~200 but the same reasoning applies to several sibling logs that fire on normal traffic:
- **Line 109** `console.log("🔓 Public invitation endpoint detected", …)` — fires on every invitation/registration request. Low volume vs. general traffic, but still pure debug.
- **Line 249** `console.log("Member not found for user … this is OK for invitation endpoints")` — fires on a **normal** branch (e.g. a freshly-invited user who has a session but no member row yet). Not an error condition; should not be an unconditional log.
- **Line 255** `console.log("No user session for invitation endpoint …")` — fires on the normal public-endpoint path.

These three are emoji/debug-style logs on non-error branches. **Recommendation:** while touching this file for Task C, gate all of them behind a debug flag (e.g. `c.env.DEBUG_TENANT_MW === "true"`) or remove them. Leave the genuine `console.error`/`console.warn` calls (lines 45, 70, 172, 188, 205, 260, 270, 277) intact — those are real fault paths and are appropriate.

### F3 — Body is cloned + JSON-parsed on every `/rpc` request before need is known — LOW (INFO, out of plan scope)
- **Lines 37-43:** `c.req.raw.clone()` then `await clonedRequest.json()` runs on **every** `/rpc` POST to extract `organizationId`, before the code knows whether the route even needs a tenant DB.
- This is an inherent design cost: every RPC call pays a full body clone + JSON parse in the middleware, and the handler parses the body again downstream. For large POST bodies (bulk imports, POS carts) this is double-parse overhead on the hot path.
- **Not in plan scope.** Reported as INFO/LOW so the plan can note it. A future optimization could check a header or a method allowlist before parsing, but that is a separate change with its own risk surface (oRPC body-format variance — see lines 57-77). Do NOT bundle into this cleanup.

### F4 — Sequential per-request await chain; public endpoints do NOT short-circuit it — MEDIUM (INFO for plan; behavior must be preserved)
Per non-platform-admin request the middleware runs, sequentially:
1. control-panel `organizations.findFirst` (line 131) — suspension/existence check
2. `auth.api.getSession` (line 179)
3. `getTenantDb` (line 199)
4. tenant `members.findFirst` (line 233)
5. `getDescendantNodeIds` (line 239)

That is 3-5 sequential awaits on every request.

**Key behavioral fact the refactor must preserve:** the current code does **NOT** short-circuit public invitation/registration endpoints out of the suspension/DB chain. The `isInvitationPublicEndpoint` flag (line 104) only affects two things:
- whether a missing user session is tolerated (line 187), and
- whether the member lookup is skipped (line 231).

Public endpoints still execute the control-panel suspension check (line 128 gate is `!isPlatformAdminCall`, NOT `!isInvitationPublicEndpoint`) and still call `getTenantDb`. This is intentional per the comment at lines 145-148 (an invitation's target org always exists, and we want suspension to still apply).

**Implication for Task C:** the consolidation of the public-endpoint predicate is a *naming/dedup* change only. It MUST keep `isPlatformAdminCall` (not the public-endpoint flag) as the gate for the suspension check, and MUST keep public endpoints flowing through `getTenantDb`. If the refactor "optimizes" by short-circuiting public endpoints before the suspension check, it would be a **behavior change / security regression** (a suspended tenant's invitation flow would no longer be blocked, and an unknown-org invitation would skip the 403). Do not do this as part of Task C.

### F5 — Security-gate ordering must be preserved — MEDIUM (the main correctness caution for Task C)
The two security gates that must remain **before** `getTenantDb`:
- **Line 149-154:** org-not-found → `403` (prevents getTenantDb on an unknown org, which would otherwise surface as a 500).
- **Line 155-166:** suspended/cancelled → `403`.

The plan's stated change (consolidate path-based + method-based public detection into one predicate; gate/remove a console.log) does **not** touch this ordering, so per the plan it is behavior-preserving. **Confirm during implementation** that the consolidated predicate is computed where `isInvitationPublicEndpoint` is today (after `method`/`organizationId` extraction, lines 83-105) and that no security gate moves relative to it. The predicate today depends on both `c.req.path` (available immediately) AND `method` (only available after body parse), so the consolidated predicate still cannot be evaluated before the body is parsed — fine, it does not need to be.

### F6 — `getDescendantNodeIds` boundedness — INFO (out of plan scope)
- **Line 239:** `getDescendantNodeIds(tenantDb, member.hierarchyScopeId)` runs per request for authenticated members. Whether this is bounded depends on the hierarchy depth/fan-out and the implementation in `@avantej-core/services`. For Malaysian SME gyms the tree is small (regions→districts→locations, a handful of branches), so this is not a practical scaling concern today. Flagged INFO only; not in Task C scope and not changed by it.

---

## Recommendations for the plan

1. **Proceed with Task C** — remove/gate the line-200 happy-path `console.log`. Genuine perf + noise win (LOW/MEDIUM).
2. **Widen the log cleanup** to also gate/remove lines 109, 249, 255 (debug logs on non-error branches) while in the file. Keep all `console.error`/`console.warn` fault-path logs.
3. **Hard constraint on the predicate consolidation:** keep the suspension check gated by `isPlatformAdminCall` (NOT the public-endpoint flag), keep public endpoints flowing through `getTenantDb`, and keep the org-existence (149) and suspension (156) 403s before `getTenantDb`. The consolidation is naming/dedup only — verify no gate is reordered.
4. **Note (do not implement in Task C):** the per-request body clone+parse (F3) and the 3-5 sequential awaits (F4) are pre-existing costs. Record as backlog INFO; out of scope for a logging/dedup change.

## Severity roll-up
- CRITICAL: none
- HIGH: none
- MEDIUM: F4, F5 (correctness/behavior-preservation cautions, not defects), F2 (log breadth)
- LOW: F1 (the planned change)
- INFO: F3, F6
