# Setup Guide (If You Decide to Proceed)

This is the minimal setup. Do NOT add plugins, RAG, or sync automation until you've used the vault for two weeks and identified a real gap.

## Phase 0: Audit Existing Context (Required — Do This First)

Before adding Obsidian, clean up what you already have.

### Task 0.1: Audit `CLAUDE.md` files

**Files to review:**
- `C:\Project\Avantej\CLAUDE.md` (project)
- `C:\Users\user\.claude\CLAUDE.md` (user global)

**For each file, ask:**
- Is every line still accurate? (architecture, commands, conventions)
- Is anything duplicated between the two files? → Keep it in the more-specific one.
- Is anything evolving/ephemeral? → Move to auto-memory.
- Is anything project state (phase status, WIP)? → Delete; use `git log` instead.

**Target:** project `CLAUDE.md` under 200 lines, user `CLAUDE.md` under 150 lines.

### Task 0.2: Audit auto-memory

**File:** `C:\Users\user\.claude\projects\C--Project-Avantej\memory\MEMORY.md`

Currently contains Phase 2S, Phase 3, bug fixes, backup info — a lot of it reads more like a changelog than recallable memory.

**For each entry, ask:**
- Is this still true? (e.g., "Phase 3 completed" may be stale)
- Is it about SURPRISING/NON-OBVIOUS facts, or just history? → If history, delete. `git log` is authoritative.
- Could a new developer derive this by reading the code? → If yes, delete.

**Target:** MEMORY.md under 100 lines, each pointing to a small focused memory file.

### Task 0.3: Audit skills

**Dir:** `C:\Users\user\.claude\skills\`

You have: paseo, paseo-chat, paseo-committee, paseo-handoff, paseo-loop, paseo-orchestrator.

**Ask:**
- Which have you used in the last month?
- Delete unused ones. They pollute skill discovery.

### Acceptance
- [ ] CLAUDE.md audit complete, duplicates removed
- [ ] MEMORY.md entries trimmed to non-obvious facts only
- [ ] Unused skills archived or removed

## Phase 1: Create Obsidian Vault (Only if Audit Revealed a Gap)

### Task 1.1: Install Obsidian and create vault

1. Download Obsidian from obsidian.md
2. Create a vault at a **neutral location** — NOT inside a project repo:
   - Recommended: `C:\Users\user\Knowledge\` or `C:\Users\user\Documents\Obsidian\`
3. Open the vault. Disable all default plugins initially.

### Task 1.2: Minimal folder structure

```
Knowledge/
├── _claude/                  # Claude-facing notes (exported to repos)
│   ├── avantej/
│   │   ├── CLAUDE.md         # Master copy — this is what gets synced to repo
│   │   └── memory/           # Optional: edit memory here visually
│   └── global/
│       └── CLAUDE.md         # Master copy of ~/.claude/CLAUDE.md
├── adr/                      # Architecture Decision Records
│   └── avantej/
├── research/                 # Library evaluations, spikes, exploratory notes
├── journal/                  # Daily notes (optional)
└── prompts/                  # Reusable prompt library
    └── coding/
```

**Key decision:** The `_claude/` folder is the **master source** for CLAUDE.md files. The files in the repo become generated artifacts.

### Task 1.3: Move existing content in

1. Copy `C:\Project\Avantej\CLAUDE.md` → `Knowledge/_claude/avantej/CLAUDE.md`
2. Copy `C:\Users\user\.claude\CLAUDE.md` → `Knowledge/_claude/global/CLAUDE.md`
3. Start writing ADRs in `adr/avantej/` as decisions come up — one file per decision, named `NNNN-short-title.md`

**ADR template:**

```markdown
# ADR NNNN: <Title>

Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by ADR-XXXX

## Context
What situation prompted this decision?

## Decision
What did we decide to do?

## Alternatives Considered
What else did we evaluate and why not?

## Consequences
What does this make easier / harder?

## Related
- Links to code: `packages/db/src/schema/tenant/...`
- Links to other ADRs: `[[0003-multi-tenant-db]]`
```

### Task 1.4: One-way sync script (vault → repo)

Create `C:\Users\user\Knowledge\_sync.sh`:

```bash
#!/bin/bash
# Sync vault CLAUDE.md files into repos
# Run manually after editing in Obsidian

set -e

VAULT="C:/Users/user/Knowledge/_claude"

# Avantej project
cp "$VAULT/avantej/CLAUDE.md" "C:/Project/Avantej/CLAUDE.md"
echo "Synced: Avantej CLAUDE.md"

# Global user CLAUDE.md
cp "$VAULT/global/CLAUDE.md" "C:/Users/user/.claude/CLAUDE.md"
echo "Synced: Global CLAUDE.md"
```

**Usage:** Run `bash C:/Users/user/Knowledge/_sync.sh` after editing in Obsidian.

**Do NOT:** set up a file-watcher or automatic bidirectional sync. Manual is a feature — it prevents accidental overwrites.

### Acceptance
- [ ] Vault exists, folder structure created
- [ ] Existing CLAUDE.md files copied into vault (vault is now master)
- [ ] Sync script works: edit in Obsidian → run script → changes appear in repo
- [ ] Used for 2 weeks before moving to Phase 2

## Phase 2: Claude Code Integration (Only If Phase 1 Revealed Gaps)

After 2 weeks, ask: **"What still isn't working?"** Common gaps and fixes:

### Gap: "I keep forgetting to run the sync script"

**Fix:** Add a hook to detect stale CLAUDE.md on session start.

Edit `C:/Users/user/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'diff -q C:/Users/user/Knowledge/_claude/avantej/CLAUDE.md C:/Project/Avantej/CLAUDE.md > /dev/null || echo \"⚠️  Vault CLAUDE.md differs from repo — run _sync.sh\"'"
          }
        ]
      }
    ]
  }
}
```

### Gap: "I want Claude to pull ADRs when planning"

**Fix:** Create a custom skill that loads ADR content on demand.

Create `C:/Users/user/.claude/skills/adr-context/SKILL.md`:

```markdown
---
name: adr-context
description: Load Avantej architecture decision records before planning a feature that touches core architecture.
---

Load all ADRs from the vault and summarize decisions relevant to the current task:

1. Read all files in `C:/Users/user/Knowledge/adr/avantej/`
2. Filter to ADRs whose content mentions keywords from the current task
3. Summarize each relevant ADR in 2-3 lines
4. Note any ADR whose decision this task might violate

Output should be prefixed "Relevant ADRs:" and bullet-listed.
```

### Gap: "I want Obsidian's semantic search over my notes"

**Fix:** Install Smart Connections plugin. Configure to use OpenAI embeddings (or a local model via Ollama). This gives you "find notes related to X" inside Obsidian — but does NOT automatically feed Claude Code. You'd copy-paste relevant notes into the Claude session when needed.

### Gap: "I want to share Avantej context with Cursor/ChatGPT"

**Fix:** Add an export script:

```bash
# _export-bundle.sh — concatenate vault notes into one file for pasting elsewhere
cat C:/Users/user/Knowledge/_claude/avantej/CLAUDE.md \
    C:/Users/user/Knowledge/adr/avantej/*.md \
    > C:/tmp/avantej-context-bundle.md
```

### Acceptance
- [ ] Only added mechanisms that addressed real pain from Phase 1
- [ ] No mechanism added "just in case" — all justify their existence

## What Not to Do in Phase 2

See `anti-patterns.md` — specifically avoid local RAG stacks, vector DBs, and complex plugin chains. These are genuine traps that waste weeks.
