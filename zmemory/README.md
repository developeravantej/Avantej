# zmemory — Project Mistake Log

## Purpose

Tracks mistakes made during /execute sessions so they are not repeated.
Each entry is written after a session completes. Claude compares new mistakes
against this index semantically (root cause, not error text) before marking
[REPEATED].

## Files

- INDEX.md — one-row-per-pattern lookup table (always read this first)
- YYYY-MM.md — monthly detail logs (full context per entry)

## Entry Lifecycle

1. First occurrence → logged in INDEX.md (count = 1) + detail in YYYY-MM.md
2. Second occurrence → count incremented, entry marked [REPEATED] in INDEX.md
3. [REPEATED] entries surface as warnings at the start of the next relevant /execute run

## Entry Format (YYYY-MM.md)

### [YYYY-MM-DD] Short pattern name (×N) [REPEATED if N > 1]
**Context:** which domain / skill / task type this tends to happen in
**Root cause:** one sentence — WHY it happened
**Fix applied:** what resolved it
**Recurrence:** N
