# Anti-Patterns: What NOT to Build

These are genuinely tempting — and genuinely a waste of time for a single-developer, single-project Claude Code workflow.

## ❌ Local RAG Pipeline

**What it looks like:** Chroma/LanceDB vector store, Python script watching the vault, custom embeddings, a query layer.

**Why you think you need it:** "Claude should automatically pull relevant notes."

**Why you don't:**
- Claude Code already has `Read` and `Grep` over your vault if you mount it or reference paths
- Embedding-based retrieval is fuzzy — it misses exact references and hallucinates relevance
- Maintenance cost: re-indexing, embedding API costs, schema drift between chunker and retriever

**Better:** Put the top 20% of notes directly in CLAUDE.md. Reference the rest by path when needed.

## ❌ Bidirectional Auto-Sync

**What it looks like:** File watcher on the repo AND vault, syncing changes both ways.

**Why you don't:**
- Merge conflicts on every edit
- Accidental overwrites when two processes write simultaneously
- Debugging "why did my CLAUDE.md revert" is a Tuesday-afternoon rabbit hole

**Better:** Vault is master, repo is generated. Manual one-way sync (`_sync.sh`). If you edit the repo directly by mistake, you know to copy it back to the vault.

## ❌ Obsidian Plugin Sprawl

**What it looks like:** Installing Templater, Dataview, Smart Connections, Copilot, Text Generator, Obsidian AI, BMO, and 10 others "to cover all the workflows."

**Why you don't:**
- Plugins interact unpredictably
- Each plugin adds load time, UI clutter, and a failure mode
- You'll use 2 of them; the rest distract

**Better:** Start with zero plugins. Add one only when you've felt the pain it solves for 2+ weeks.

## ❌ Complex Prompt Template Systems

**What it looks like:** Templater scripts with 10 frontmatter variables that get injected into Text Generator calls that format a system prompt for Copilot.

**Why you don't:**
- The abstraction is brittle
- You'll forget the template variables within a month
- Claude Code doesn't consume these templates — they're Obsidian-local

**Better:** Keep a `prompts/coding/` folder with flat markdown files. Copy-paste relevant sections into Claude Code. The friction is a feature: it forces you to read the prompt before using it.

## ❌ Duplicating CLAUDE.md Content Into Obsidian "For Reference"

**What it looks like:** Paste project architecture into an Obsidian note so you can "see it alongside other notes."

**Why you don't:**
- Two sources of truth drift
- When they disagree, you won't know which is current
- Claude loads CLAUDE.md, not the Obsidian copy

**Better:** Make Obsidian the master for `_claude/avantej/CLAUDE.md`. Sync one-way to the repo. There is only one CLAUDE.md — it just lives in the vault.

## ❌ Shared Team Vault Without Conventions

**What it looks like:** Three developers editing the same Obsidian vault with Obsidian Sync.

**Why you don't (yet):**
- Merge conflicts in markdown are silent and painful
- Without naming conventions, the vault degenerates fast
- Teammates not using Claude won't maintain `_claude/` folders

**Better (if you need team sharing):** Keep project-critical notes in the repo itself (ADRs in `docs/adr/`). Use Obsidian for personal knowledge only.

## ❌ Treating Auto-Memory as a Journal

**What it looks like:** Auto-memory entries like "2026-04-15: Fixed a Tailwind bug in the sidebar."

**Why you don't:**
- `git log` already captures this
- Memory loads on every relevant conversation — filling it with history slows things down
- Stale memories actively mislead

**Better:** Memory is for non-obvious, surprising, counterintuitive facts. "Drizzle FK needs a unique CONSTRAINT, not unique INDEX" belongs in memory. "Fixed a bug on Tuesday" doesn't.

## ❌ Skills That Are Actually Prompts

**What it looks like:** A skill named `/optimize-query` whose entire body is "review the query and suggest optimizations."

**Why you don't:**
- That's just a prompt. Skills should encapsulate multi-step procedures with specific tools and checks.
- Skill discovery pollution — every skill added makes it harder to find the useful ones.

**Better:** Write reusable prompts in the vault's `prompts/` folder. Reserve skills for procedures that need to run tools, read specific files, or follow branching logic.

## Summary

The healthiest Obsidian + Claude Code setup is **small, boring, and manual**:

- One vault
- Plain markdown files
- One-way sync script
- Zero plugins at first
- No RAG, no embeddings, no automation you didn't prove you need

The bloat accumulates silently. Every tool you add is a tool you have to maintain, debug, and eventually retire.
