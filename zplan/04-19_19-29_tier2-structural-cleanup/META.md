---
title: Tier 2 — Structural Cleanup
goal: Fix data correctness bugs, standardize navigation/layout patterns, harden security, clean repo
created_at: 2026-04-19 19:29
linked_pr:
---

# Tier 2 — Structural Cleanup

Fixes 15+ data correctness and UX bugs (expenses currency stored as "usd", payouts hard-capped at 50 records, branch UUID text inputs, installments `any` casts, cancelled sales silent errors, commissions empty until config exists, announcements client-side-only audience filter), wires the notification bell unread badge, removes stale localStorage session caching risk, deletes five legacy duplicate route files, and cleans up root-level junk markdown files and the `apps/server/src/Untitled` folder.
