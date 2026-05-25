<!--
audit-prove --page brief. White-box, functional QA of ONE route. The conductor
substitutes {{ROUTE}}, {{ROUTE_FILE}}, {{COMPONENT_FILES}}, {{STACK}}, {{CLIENT_PATTERN}},
{{API_GLOB}}, {{SERVICES_GLOB}}, {{HUB_DOC}}, {{OUTPUT_DIR}}. Single agent
(general-purpose), read-only. Drop any {{...}} line whose value is empty.
-->
You are doing **white-box functional QA** of a single route in this web app.

Stack: {{STACK}}
Client→server calls follow this pattern: {{CLIENT_PATTERN}}

## Target
- Route: `{{ROUTE}}`
- Route file: `{{ROUTE_FILE}}`
- Component(s): `{{COMPONENT_FILES}}`
- Existing page doc (may be stale — verify): `{{HUB_DOC}}`

## Trace the page (read-only)
Follow the data path: route file → rendered component(s) → hooks → every client→server call → the backing handler under `{{API_GLOB}}` → its logic under `{{SERVICES_GLOB}}`. You need the server side to know what inputs are validated/rejected and what side effects fire.

## Produce — `{{OUTPUT_DIR}}/<page>-map.md`
1. **Interactive elements** — every button / input / select / toggle / link, and what each does.
2. **Journeys** — the golden path + each alternate path a user can take.
3. **Data states** — does the page correctly render: loading, empty, error, and success? Note any state that is unhandled.
4. **Inputs & validation** — per field: allowed values, blocked values, client-side guard, server-side guard. Flag client/server mismatches.
5. **State transitions & side effects** — e.g. "changing X clears Y", "submit disabled until Z", "mutation invalidates query Q", redirects, toasts.
6. **Permission/RBAC branches** — what the page hides/blocks for which role.

## Then derive functional test cases — `{{OUTPUT_DIR}}/cases.json`
Cases come from the CODE you just read, not guesswork. For every guard, validation rule, branch, and state transition, write a case that asserts the page **honours it**. Include happy paths, boundary/edge inputs, and error paths (network failure, server rejection, empty results).

`cases.json` schema (array):
```json
[{
  "id": "C-01",
  "title": "Submit blocked when a required guard is not met",
  "type": "edge",                       // golden | edge | error
  "steps": ["fill form", "violate the guard", "try submit"],
  "expected": "Submit stays disabled; no mutation fires",
  "selectorHints": ["getByRole('button',{name:/submit|save/i})"],
  "testable": true,                     // false = no UI surface to drive
  "sourceRef": "<component>.tsx:447"
}]
```

Rules: cite `file:line` in `sourceRef`. Mark `testable:false` for anything with no UI surface. **Do NOT modify code.**

Final chat message: 5-line summary — # of cases by type, the riskiest 2–3 functional gaps, and any state the page fails to handle.
