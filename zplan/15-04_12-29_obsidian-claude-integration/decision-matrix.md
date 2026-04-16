# Decision Matrix: Where Does Knowledge Go?

You have 5 places to put project knowledge. Use this matrix to decide which one.

## The Five Mechanisms

| Mechanism | Loaded When | Best For | Size Limit |
|---|---|---|---|
| **`CLAUDE.md`** (project) | Every session in this repo | Stable rules, architecture, conventions | ~200 lines practical |
| **`~/.claude/CLAUDE.md`** (user) | Every session, every project | Personal working style, universal rules | ~200 lines practical |
| **Auto-memory** (`memory/*.md`) | When relevant (via MEMORY.md index) | Learned facts, feedback, project state | Many small files |
| **Skills** (`~/.claude/skills/` or `.claude/skills/`) | On-demand via `/skill-name` | Invokable workflows, multi-step procedures | Unlimited |
| **Hooks** (`settings.json`) | On specific events (PreToolUse, Stop, etc.) | Automation, validation, sync | Shell commands |
| **Obsidian vault** (optional upstream) | Manually referenced or synced | Visual graphs, cross-project notes, non-coding content | Unlimited |

## Decision Tree

```
Is this information needed EVERY session?
├── Yes → Does it apply to ALL projects?
│   ├── Yes → ~/.claude/CLAUDE.md (user global)
│   └── No  → <project>/CLAUDE.md
│
└── No → Is it a FACT to remember or a WORKFLOW to execute?
    │
    ├── FACT → Is it stable or changes over time?
    │   ├── Stable (conventions) → CLAUDE.md
    │   └── Evolving (bug fix, decision, project state) → auto-memory
    │
    ├── WORKFLOW (multi-step task) → Skill
    │
    └── AUTOMATION (trigger on event) → Hook
```

## Concrete Examples from Your Avantej Project

### ✅ Belongs in `CLAUDE.md` (project)
- Multi-tenant DB architecture (control-panel vs tenant)
- oRPC procedure pattern
- Quick-reference commands (`bun dev`, `bun test`)
- Biome formatting conventions
- Package responsibilities table

**Rule of thumb:** If a new developer joining the repo would need to know it on day one, it belongs here.

### ✅ Belongs in auto-memory
- "Better-Auth cookie bug fix applied 2026-02-18" (`memory/bug-fixes.md`)
- "Phase 2S schema decisions — amounts as integer cents" (`memory/phase-2s.md`)
- "Frontend test client mock path is `@/utils/orpc`, not `@/lib/client`" (`memory/testing-gotchas.md`)
- "franchisee@gmail.com test credentials" (`memory/test-credentials.md`)

**Rule of thumb:** Learned through experience, specific enough that CLAUDE.md bloat isn't worth it, but valuable enough to persist.

### ✅ Belongs in a Skill (`.claude/skills/`)
- `/plan` — already exists
- `/hub` — already exists
- A custom `/test-tenant` skill that runs the integration test suite with setup
- A custom `/backup-tenant` skill wrapping `scripts/backup-tenant-tables.ts`

**Rule of thumb:** Multi-step procedure you invoke repeatedly with variations.

### ✅ Belongs in a Hook
- **PostToolUse on Write/Edit**: run `bun check` on changed files
- **Stop**: remind user to commit if there are staged changes
- **PreToolUse on Bash**: block `rm -rf` commands on the repo root
- **UserPromptSubmit**: inject current branch name into context

**Rule of thumb:** Should fire automatically on an event — not something you'd invoke by name.

### 🟡 Belongs in Obsidian (ONLY if you need these)
- **Architecture Decision Records (ADRs)** with visual links between decisions — if you want to see "this decision affected these other decisions" as a graph
- **Research notes** on libraries you're evaluating (drizzle alternatives, Cloudflare Workers patterns) — exploratory, not ready for CLAUDE.md
- **Meeting notes / Slack archive / weekly review** — not project-relevant to AI but useful to have nearby
- **Cross-project patterns** — if you have Avantej + 3 other projects and want shared notes on "how I structure Drizzle schemas"
- **Context you want to share with Cursor/ChatGPT** — export as a markdown bundle

**Rule of thumb:** You need human-facing features (graph view, backlinks, daily notes) that Claude Code's flat-file storage doesn't provide.

## Common Mistakes to Avoid

### ❌ Putting bug fixes in CLAUDE.md
Bug fix history bloats the file and slows every session. Put them in auto-memory.

### ❌ Putting ephemeral project state in CLAUDE.md
"Currently working on Phase 3" — goes stale in a week. Auto-memory is better; even better: just let Claude read `git log`.

### ❌ Creating skills for one-off tasks
A skill is a reusable workflow. If you ran it once, it's not a skill — it's a conversation.

### ❌ Creating hooks for rare operations
Hooks run on every matching event. A pre-commit hook that runs 30s of checks will destroy your flow. Reserve hooks for high-signal automation.

### ❌ Mirroring CLAUDE.md into Obsidian "for organization"
Creates two sources of truth that drift. Pick one master. If Obsidian is master, export to CLAUDE.md on change. If CLAUDE.md is master, don't copy it into Obsidian.

## When Obsidian Genuinely Helps (Be Honest)

Obsidian is worth the overhead **only if** at least one of these is true:

1. You maintain notes across **3+ projects** and want cross-cutting patterns visible
2. You want a **daily note habit** that captures decisions as they happen
3. You want a **graph view** to find orphaned knowledge
4. You share context with **non-Claude tools** (Cursor, teammates, public blog)
5. You take **non-coding notes** (books, research, journaling) and want one app

If none of these apply, improve your CLAUDE.md + memory discipline instead.
