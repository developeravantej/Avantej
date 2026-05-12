---
title: Package Approval Flow (Customer purchase → Trainer assign → Approval → Bookable)
goal: Gate customer-purchased packages on staff assignment + approval before they're bookable.
created_at: 2026-04-29 20:57
linked_pr:
---

# Package Approval Flow

When a customer completes the buy-package flow, the new package starts in `pending` status. An admin assigns a trainer (or a trainer self-assigns), which auto-approves the package and flips it to `active`. Until then the customer sees a "Pending Approval" badge and cannot book sessions with the credit. Org-level setting controls whether the gate is required.
