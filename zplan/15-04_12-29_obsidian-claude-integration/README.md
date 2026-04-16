# Obsidian + Claude Code Integration — Setup Guide

**Date:** 2026-04-15
**Author:** Claude (planning session)
**Status:** Recommendation + setup instructions

## TL;DR

You already have **four context mechanisms** built into Claude Code:

1. **`CLAUDE.md`** (project + user) — always-loaded static rules
2. **Auto-memory** — persistent learnings across conversations
3. **Skills** — invokable workflows (`/plan`, `/hub`, etc.)
4. **Hooks** — automated behaviors triggered by events

**Before adding Obsidian, answer honestly: what gap does it fill?** If the only reason is "experts use it," don't bother. Obsidian adds real value only if you need one of:

- A **visual knowledge graph** (seeing how notes connect)
- **Cross-project knowledge** (notes that span Avantej + other repos)
- **Non-coding notes** in the same place (meeting notes, research, journaling)
- **Sharing context** with non-Claude tools (Cursor, ChatGPT, teammates)

If your world is "Claude Code + one project," you likely get **90% of the benefit** by organizing what you already have better. See `decision-matrix.md` for where to put new knowledge.

## Files in this Plan

- `README.md` — this file (overview + recommendation)
- `decision-matrix.md` — when to use CLAUDE.md vs memory vs skills vs hooks vs Obsidian
- `setup.md` — step-by-step setup if you decide to proceed
- `anti-patterns.md` — what NOT to build (avoid over-engineering)

## Recommended Path

**Phase 0 (Do this regardless of Obsidian):** Audit your existing `CLAUDE.md` and memory. Most users have stale or duplicated content. Clean it up first.

**Phase 1 (If you proceed with Obsidian):** Single vault, plain markdown, one sync script. No plugins yet. Use it for two weeks before adding anything.

**Phase 2 (Only if Phase 1 reveals real gaps):** Add Smart Connections plugin for semantic search. Add a post-commit hook to auto-export ADRs from Obsidian to the repo.

**What to avoid:** Local RAG pipelines, vector DBs, custom plugins, Templater chains — all covered in `anti-patterns.md`.
