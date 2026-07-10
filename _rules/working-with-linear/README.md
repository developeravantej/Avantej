# RULE: Working with Linear (issue → fix → proof)

> Established 2026-07-09. Canonical workflow for handling any Linear issue in this
> repo (teams **AVANTEJ** and **NCT**). Read this before you start on a Linear
> issue, and follow it end to end.

## The two hard rules

1. **Assign it to yourself first.** Before doing any work on a Linear issue, assign
   it to yourself (`me`) and move it to **In Progress**. This claims the work so two
   people don't fix the same bug, and makes status honest on the board.
2. **A fix is not done until an e2e video proves it.** When you fix an issue, you
   must record an end-to-end video that reproduces the original problem path and
   shows it now working. Attach that video to the Linear issue. No video → not done.

## Full workflow (do these in order)

1. **Check for a rule first.** Before touching the affected area, look in `_rules/`
   (see `_rules/INDEX.md`) for a rule covering it. If one exists, read it and comply.
2. **Assign + status.** Assign the issue to yourself and set status **In Progress**.
3. **Reproduce.** Confirm you can trigger the bug before changing anything
   (matches the Bug Fix Protocol in `CLAUDE.md`). Note exact route, user, and steps.
4. **Branch.** Use the branch name Linear generates for the issue
   (the `gitBranchName` field, e.g. `wilfred/avantej-9-...`) so the PR auto-links.
5. **Fix minimally.** Address the root cause only — no opportunistic cleanup.
6. **Prove with e2e video.** Record a Playwright run (see `/e2e-deep`, `/audit-prove`,
   or the `_e2e/` suite) that walks the original reproduction path and shows it fixed.
   Save the video and **attach it to the Linear issue**.
7. **Comment.** Post a comment on the issue with: root cause, the fix (files touched),
   and a link to the e2e video.
8. **Close honestly.** Only move the issue to **Done** after the video proves the fix
   and type-check/tests pass. If blocked, leave it In Progress with a comment saying why.

## Why

- Front-desk staff are the end users; a "fixed" bug that regresses erodes trust fast.
  The video is the regression guard and the proof for whoever verifies the work.
- Assigning up front is the single cheapest way to avoid duplicated effort across the
  parallel-agent workflow this repo uses.

## Tooling notes

- Linear is reached via the connected Linear MCP (assign, comment, status, attachments).
- The issue's `gitBranchName` is the canonical branch — don't invent your own.
- Verify UI fixes in the browser at `http://avantej.localhost:3021/` before recording
  the final video (see `CLAUDE.md` → Owner Context).
