---
title: Commission Tracks Architecture
goal: Generalize the trainer-only commission engine into stackable delivery/sales/marketing "tracks" without changing current behavior
created_at: 2026-05-30 15:23
linked_pr:
---

# Commission Tracks Architecture

Refactor the commission calculator into a `gather → plan → persist` pipeline (behavior-preserving), then generalize the trainer-only model into scalable, stackable commission **tracks** (delivery / sales / marketing / referrer) so future teams earn cleanly on the same order. Ships in four phases; trainer behavior is unchanged through Phase 2, sales/marketing gated behind a new sales-attribution model in Phase 3+.
