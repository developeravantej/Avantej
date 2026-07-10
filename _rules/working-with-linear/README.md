# RULE: Working with Linear (issue → fix → proof)

> Established 2026-07-09. Canonical workflow for handling any Linear issue in this
> repo (teams **AVANTEJ** and **NCT**). Read this before you start on a Linear
> issue, and follow it end to end.

## The two hard rules

1. **Assign it to yourself first.** Before doing any work on a Linear issue, assign
   it to yourself (`me`) and move it to **In Progress**. This claims the work so two
   people don't fix the same bug, and makes status honest on the board.
2. **A fix is not done until visual + executable proof is attached.** Attach BOTH,
   where each applies:
   - **Executable proof** — a Playwright e2e assertion that fails on the old code
     and passes on the fix (a delta-based spec against the real `/rpc` boundary, or
     a component test). This is the regression guard.
   - **Visual proof** — an e2e **video walkthrough** of the fixed pages, or, when the
     interaction can't be driven (see the Radix note below), a **screenshot of the
     fixed state**. Attach it to the issue.
   No proof → not done. Prefer video; fall back to screenshot only when automation
   genuinely can't drive the step.

## Full workflow (do these in order)

1. **Check for a rule first.** Before touching the affected area, look in `_rules/`
   (see `_rules/INDEX.md`) for a rule covering it. If one exists, read it and comply.
2. **Assign + status.** Assign the issue to yourself and set status **In Progress**.
3. **Reproduce.** Confirm you can trigger the bug before changing anything
   (matches the Bug Fix Protocol in `CLAUDE.md`). Note exact route, user, and steps.
4. **Branch.** Use the branch name Linear generates for the issue
   (the `gitBranchName` field, e.g. `wilfred/avantej-9-...`) so the PR auto-links.
5. **Fix minimally.** Address the root cause only — no opportunistic cleanup.
6. **Prove.** Write/extend an e2e spec (see the reusable harness below) and capture a
   video walkthrough or screenshot of the fixed state. **Attach both to the issue.**
7. **Comment.** Post a comment with: root cause, the fix (files touched), the passing
   assertion output, and the attached proof.
8. **Close honestly.** Only move to **Done** after the proof holds and
   type-check/tests pass. If blocked, leave it In Progress with a comment saying why.

## Reusable proof harness (built for scale — don't reinvent it)

The batch that closed AVANTEJ-5..14 left a self-contained, reusable harness under
`_e2e/`. Use it for every Linear fix so proof scales instead of being hand-rolled:

- **`_e2e/web/global-setup.api.ts`** — API-only login (sign-in over HTTP → capture
  cookies → resolve org via `/rpc/auth/userContext`). It never loads the dashboard,
  so it stays stable against the local Worker (the default browser global-setup's
  dashboard burst crashes it).
- **`_e2e/playwright.avantej9.config.ts`** — template config wiring that global-setup +
  `video: "on"`. Copy it per feature; point `testMatch` at your spec.
- **`_e2e/web/_safe-mutation.ts`** — `rpc()`, `getOrgId()`, `getBranchId()`, `testId()`,
  `Cleanup`. Drive the real `/rpc/<router>/<proc>` boundary on **disposable,
  test-prefixed** rows you create and tear down — never a pre-existing real row.
- **Delta-based assertions** — assert *changes* (revenue unchanged, count +1, refund
  subtracted once) so specs are immune to other tenant data. See
  `_e2e/web/sales/net-collected-refund.rule.spec.ts` and `_e2e/avantej5-proof.mjs`.
- **Video / screenshot capture** — after the API assertions pass, set
  `localStorage.current_organization_id` via `page.addInitScript` and `goto` the fixed
  route(s). Recording with `video: "on"` while navigating the fixed pages yields a real
  (non-blank) walkthrough; `page.screenshot` gives the still. Both attach to Linear via
  the MCP: `prepare_attachment_upload` → PUT bytes → `create_attachment_from_upload`.
- **Running it locally** — the env is fiddly (worktree `.dev.vars`, web on `:3022`,
  single-value `CORS_ORIGIN`, tenant migrations). The full recipe is in memory:
  `project_e2e_local_run_setup`.

## Why

- Front-desk staff are the end users; a "fixed" bug that regresses erodes trust fast.
  The **executable** spec is the regression guard; the **video/screenshot** is the
  human-verifiable proof for whoever reviews the work.
- Assigning up front is the single cheapest way to avoid duplicated effort across the
  parallel-agent workflow this repo uses. For a batch of issues, fan out **read-only**
  root-cause subagents (one per issue) and keep all edits in one owner to avoid
  shared-tree conflicts.

## Radix / automation note

This app's Radix `<Select>` dropdowns check `event.isTrusted`, so they can't be driven
by Playwright — that's why mutation proofs go through the `/rpc` API boundary rather
than clicking the UI, and why a screenshot (not an interaction video) is the accepted
visual proof for those flows.

## Tooling notes

- Linear is reached via the connected Linear MCP (assign, comment, status, attachments).
- The issue's `gitBranchName` is the canonical branch — don't invent your own.
- Verify UI fixes in the browser (web dev server — `:3021`, or `:3022` in the e2e setup)
  before capturing the final proof (see `CLAUDE.md` → Owner Context).
