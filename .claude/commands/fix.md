---
name: fix
description: Systematic bug fixing process — reproduce, isolate root cause, form hypothesis, fix minimally, and verify. Use when the user reports a bug, error, or unexpected behavior.
model: sonnet
argument-hint: <bug description or file path>
---

# /fix — Systematic Bug Fix Process

You are fixing a bug using a structured, disciplined process. Do NOT jump to a fix. Follow every phase in order. Skip nothing.

**Your argument:** `$ARGUMENTS` (the bug description, error message, or file path the user provided)

---

## Phase 1: REPRODUCE

**Goal:** Confirm the bug exists and understand exactly when it occurs.

1. Read the user's description carefully. Identify:
   - What the user expects to happen
   - What is actually happening
   - Any error messages, stack traces, or screenshots provided
2. Find the relevant code files. Use Grep/Glob to locate the area of the codebase involved.
3. If a dev server is needed, check if one is running. If not, note that reproduction requires the server.
4. Document the minimum reproduction steps.
5. Note the environment (browser, runtime, OS) if relevant.

**Output a short summary:**
```
REPRODUCE:
- Steps: ...
- Expected: ...
- Actual: ...
- Environment: ...
```

---

## Phase 2: ISOLATE

**Goal:** Narrow down to the exact file, function, and line where behavior diverges.

1. Read error messages and stack traces carefully — they often point directly to the source.
2. Trace the execution path from the entry point (route, API call, event handler) to where the bug manifests.
3. Use `git log` and `git blame` on suspect files to check what changed recently.
4. Read the relevant code thoroughly — don't skim. Understand the data flow.
5. Narrow down: which function, which line, which variable holds the wrong value?

**Output:**
```
ISOLATE:
- Root file: path/to/file.ts:LINE
- Function: functionName()
- Data flow: A → B → C (breaks at B)
- Recent changes: commit XYZ changed ...
```

---

## Phase 3: HYPOTHESIZE

**Goal:** Form a clear hypothesis about WHY the bug occurs before writing any fix.

1. Based on your isolation, propose a root cause explanation.
2. Check your hypothesis against edge cases — does it explain ALL observed symptoms?
3. If multiple hypotheses exist, rank them by likelihood.

**STOP HERE. Call the `advisor` tool.** Present your findings from Phases 1-3 and your hypothesis. Ask the advisor:
- "Is my root cause analysis correct?"
- "Are there edge cases or implications I'm missing?"
- "What's the minimal fix approach?"

Wait for advisor guidance before proceeding.

---

## Phase 4: FIX

**Goal:** Make the smallest change that addresses the root cause.

1. Apply the advisor's guidance. If the advisor disagreed with your hypothesis, re-investigate before fixing.
2. Write the minimal fix — only touch what's necessary.
3. Do NOT:
   - Refactor unrelated code
   - Add "while I'm here" improvements
   - Change formatting or style in untouched lines
   - Add unnecessary error handling for unrelated scenarios

---

## Phase 5: VERIFY

**Goal:** Confirm the fix works and nothing else broke.

1. Re-run the original reproduction steps — the bug should be gone.
2. Run the test suite if one exists: `bun test` or relevant test command.
3. Run type checking: `bun check-types`.
4. Check for regressions — did the fix break any other behavior?
5. If this is a UI fix, verify in the browser (golden path + at least one edge case).

---

## Phase 6: REVIEW

**Goal:** Self-review the diff before presenting to the user.

1. Run `git diff` to see exactly what changed.
2. Re-read your own changes — do they make sense? Are there edge cases?
3. Verify the fix is minimal and focused.

**Present to the user:**
```
FIX SUMMARY:
- Bug: [one-line description]
- Root cause: [why it happened]
- Fix: [what was changed and why]
- Files modified: [list]
- Verified: [how you confirmed it works]
```

---

## Rules

- **Never skip Phase 3 (Hypothesize).** Understanding the cause prevents symptom-patching.
- **Always call advisor** after Phase 3 before writing any fix code.
- **Minimal changes only.** The best bug fix is the smallest one that works.
- **If the fix doesn't work**, don't layer more patches. Go back to Phase 2 and re-isolate.
- **If you discover multiple bugs**, fix them one at a time. Complete the full cycle for each.
