<!--
audit-prove domain agent brief. The conductor substitutes {{DOMAIN_NAME}}, {{STACK}},
{{CONVENTIONS}}, {{ROUTERS}}, {{SERVICES}}, {{API_OVERVIEW_DOC}}, {{OUTPUT_PATH}} and
spawns one general-purpose agent per domain (parallel). Keep each brief scoped to ITS
files only — do NOT paste the whole config into every agent. Substitutions resolve from
$SESSION/project.json; drop any {{...}} line whose value is empty.
-->
You are auditing the **{{DOMAIN_NAME}}** domain of this codebase at the repo root.

Stack: {{STACK}}
Conventions to assume: {{CONVENTIONS}}

In this codebase the API surface is exposed by the "router/handler" files below; business logic lives in the "service/logic" files. Handlers call logic functions. (If this project doesn't split that way, treat the first group as the request-handling layer and the second as the logic layer.)

## Your owned files (read ONLY these + imports needed to understand a gap)
API surface (routers / controllers / route handlers):
{{ROUTERS}}
Logic (services / lib):
{{SERVICES}}

## Task — for EACH API-surface file
1. **Endpoints/procedures** — table: name | auth level | one-line purpose | backing logic fn.
2. **Logic functions** — every exported fn in your owned logic files, one-line purpose. Mark `ORPHAN` if no handler / job / cron calls it.
3. **Gaps** — concrete, with `file:line`:
   - Missing CRUD; lifecycle dead-ends (a status nothing can leave/reach).
   - Missing side-effects (e.g. an order that doesn't move stock; a row written but never delivered/notified).
   - Missing automation (overdue / reminder / reconcile jobs).
   - Stubs / TODO / FIXME / `throw new Error("not implemented")` / mock returns — grep owned files.
   - Handlers with no real logic backing, or logic with no caller.
   - Discrepancies with the API overview doc, if one is provided: {{API_OVERVIEW_DOC}} (note stale / missing / wrong entries).

## Critical: classify every finding
For each finding add: `status: implemented | partial | missing` and `testable: true|false`.
- `implemented`/`partial` + a user-facing surface → `testable: true` (it becomes a browser journey).
- `missing` → `testable: false` (it becomes an API-absence assertion, not a journey).

## Persistence (for any finding that WRITES data)
A green UI does not prove the write landed. For every create/update/delete or side-effect, record what the database should contain so the proof can verify it independently:
`persistence: { tenant: <org/tenant key or null>, table: <name>, where: { <key cols> }, expect: { <col: value> } }`
- Trace the logic fn to the exact table(s) and column(s) it writes — include side-table writes the UI never shows (stock movements, audit logs, payment line items, commission splits).
- If a single action must write multiple rows/tables, list one `persistence` entry per table.

Cite `file:line`. Distinguish "definitely broken/missing" from "possibly intentional". **Do NOT modify any code.**

## Output
Write findings to: `{{OUTPUT_PATH}}`
```
# Domain {{DOMAIN_NAME}}
## Endpoints / Procedures
### <file> (`path`)
| Name | Auth | Purpose | Logic fn |
## Logic Functions
### <logic file>
- `fn()` — purpose [ORPHAN]
## Gaps (prioritized P1/P2/...)
### P1 — <title>  (file:line)  [status: partial | testable: true]
<what's wrong, why it matters, how to reproduce if testable>
```
The file IS your deliverable. Your final chat message = a 5-line summary of the biggest gaps + the count of `testable:true` findings.
