# /analyse — Codebase Health Audit

You are running a comprehensive codebase health audit. Your job is to find what's **missing, broken, incomplete, or orphaned** — not to document what exists (that's what `/hub` does).

## Pre-requisites

Before launching agents, read `zhub/index.md` fully. Extract every item from the "Known Issues" section into a checklist. Agents must tag re-discovered known issues as `[KNOWN]` so the report highlights **new** findings.

## Output

All output goes to `zanalyse/` at the project root. Create it if it doesn't exist.

### Output structure

```
zanalyse/
  index.md              — Executive summary + priority-ranked master issue list
  gaps/
    schema-coverage.md  — Tables & fields without service/API/frontend coverage
    api-coverage.md     — Procedures not called from any frontend
    stub-detection.md   — Stubs, mocks, TODOs, hardcoded values, `any` casts
    rbac-audit.md       — Permission gaps in procedures and pages
    dead-code.md        — Duplicate routes, unused exports, unreachable pages
    data-integrity.md   — Validation gaps, nullable issues, FK gaps
```

### Finding format

Every finding in every file must follow this format:

```markdown
### [SEVERITY] Short title
- **File:** `path/to/file.ts:123`
- **Status:** NEW | KNOWN
- **What's wrong:** One-sentence description of the problem.
- **What to do:** Concrete fix instruction — not "look into this" but "add X to Y".
```

Severity levels: `CRITICAL` (runtime errors, data loss), `BUG` (wrong behavior), `GAP` (missing feature/coverage), `NIT` (code quality, cleanup).

---

## Audit Agents

Launch the following agents **in parallel**. Each agent gets the zhub known-issues checklist and its specific instructions below.

---

### Agent 1: Schema & Field Coverage

**Goal:** Find tables and individual columns that lack service functions, API procedures, or frontend usage.

**Steps:**
1. List every table in `packages/db/src/schema/tenant/` and `packages/db/src/schema/control-panel/`.
2. For each table, extract every column name.
3. For each table:
   - Search `packages/services/src/` for any function that reads or writes this table. Record which columns are referenced.
   - Search `packages/api/src/routers/` and `apps/server/src/routers/` for procedures touching this table.
   - Search `apps/web/src/` and `apps/native/` for any frontend code referencing the table name or its API router.
4. Report:
   - **Orphaned tables**: tables with zero service functions.
   - **Partially covered tables**: tables with service functions but no API router, or API router but no frontend usage.
   - **Orphaned fields**: columns that exist in the schema but are never read or written in any service, API input/output schema, or frontend code. For each orphaned field, list the table, column name, and type.
   - **Write-only fields**: columns written by services but never read/displayed anywhere.
   - **Read-only fields**: columns read but never written (besides DB defaults/migrations).

**Output:** `zanalyse/gaps/schema-coverage.md`

---

### Agent 2: API Coverage

**Goal:** Find API procedures that no frontend page ever calls.

**Steps:**
1. Read `zhub/shared/api-overview.md` to get the full procedure list.
2. For each procedure, grep `apps/web/src/` and `apps/native/` for usage (search for the procedure name in client calls like `client.router.procedure` or `orpc.router.procedure`).
3. Categorize:
   - **Dead procedures**: not called from any frontend.
   - **Web-only**: called from web but not native (flag if it's a customer-facing feature that should be on native).
   - **Native-only**: called from native but not web (flag if it's an admin feature that should be on web).
4. Also check for frontend code calling procedures that **don't exist** in the API (typos, removed routes, optimistic references).

**Output:** `zanalyse/gaps/api-coverage.md`

---

### Agent 3: Stub & Mock Detection

**Goal:** Find placeholder implementations, hardcoded values, and type safety escapes.

**Steps:**
1. Grep the entire codebase for these patterns:
   - `setTimeout` used as fake async (not debounce/throttle)
   - `console.log` in event handlers or API calls (not dev scripts)
   - `TODO`, `FIXME`, `HACK`, `XXX` comments
   - `MOCK_`, `mock`, `placeholder`, `stub` in variable/function names
   - `: any`, `as any`, `as unknown as` type casts
   - Hardcoded currency strings (`"usd"`, `"USD"`, `"MYR"`) that should come from config
   - Hardcoded tax rates (`* 1.1`, `* 0.1`, `0.06`, `0.08`) that should come from DB
   - Hardcoded magic numbers in business logic
2. For each finding, check if it's in zhub's known issues. Tag accordingly.
3. Exclude: test files, seed scripts, and legitimate uses (e.g., `setTimeout` for animation).

**Output:** `zanalyse/gaps/stub-detection.md`

---

### Agent 4: RBAC Audit

**Goal:** Find permission enforcement gaps.

**Steps:**
1. List every API procedure that uses `protectedProcedure`.
2. Check which ones verify permissions beyond just "is authenticated" (look for `accessibleNodeIds` filtering, `member.role` checks, or `requirePermission` calls).
3. For each that does NOT check permissions:
   - Is it a read-only list? (lower risk — still flag as GAP)
   - Is it a mutation (create/update/delete)? (higher risk — flag as BUG)
4. On the frontend side, check which dashboard pages have route guards (`beforeLoad` with permission checks) vs. which just render for any authenticated user.
5. Cross-reference: if a page calls a mutation that lacks server-side permission checks AND the page lacks client-side guards, flag as CRITICAL.

**Output:** `zanalyse/gaps/rbac-audit.md`

---

### Agent 5: Dead Code & Duplicates

**Goal:** Find unreachable code, duplicate routes, and unused exports.

**Steps:**
1. From zhub/index.md, identify pages flagged as "legacy route" or "duplicate of dashboard version". Verify they still exist.
2. Check for route files in `apps/web/src/routes/` that are NOT referenced in navigation (sidebar, links, breadcrumbs) — only reachable by direct URL.
3. In `packages/services/src/`, find exported functions that are never imported anywhere.
4. In `packages/api/src/routers/`, find procedures defined but not registered in the router index.
5. In `apps/web/src/components/`, find components that are never imported.
6. Check for duplicate implementations: same business logic in both a service file and inline in an API handler.

**Output:** `zanalyse/gaps/dead-code.md`

---

### Agent 6: Data Integrity

**Goal:** Find validation gaps, unsafe nullable fields, and missing constraints.

**Steps:**
1. Compare Zod input schemas in API procedures against the DB schema columns they write to:
   - Fields in DB but missing from Zod input (will get null/default — is that intentional?)
   - Fields in Zod input but not in DB (will be silently dropped — bug?)
   - Type mismatches (e.g., Zod says `string` but DB column is `integer`)
2. Find cross-database references (tenant DB referencing control panel IDs) without existence checks.
3. Find `DELETE` operations without cascade consideration — will orphan records?
4. Find places where user input flows into queries without validation (SQL injection risk is low with Drizzle, but look for raw SQL or string interpolation).
5. Check for missing unique constraints on fields that should be unique (e.g., email, slug, code).

**Output:** `zanalyse/gaps/data-integrity.md`

---

## After All Agents Complete

1. Collect all findings from the 6 gap files.
2. Deduplicate: if multiple agents found the same issue, merge into one finding.
3. Build `zanalyse/index.md` with:
   - **Summary stats**: total findings by severity (CRITICAL: X, BUG: X, GAP: X, NIT: X), new vs. known.
   - **Priority list**: all CRITICAL and BUG items in a single ranked table.
   - **Coverage scorecard**: for each dimension, a one-line health rating (e.g., "Schema: 34/42 tables covered, 12 orphaned fields").
   - **Links** to each gap file for full details.

## Important Rules

- Use `zhub/` as your starting point. Don't re-trace the full stack from scratch.
- Every finding must have a concrete "what to do" — no vague observations.
- Tag `[KNOWN]` for anything already in zhub's Known Issues. The value of this audit is **new** discoveries.
- Don't suggest fixes that require architectural changes. Keep recommendations scoped to the current architecture.
- Exclude test files, seed scripts, and migration files from stub/mock detection (those are expected to have mocks).
