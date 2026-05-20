---
title: Installment System Completeness
goal: Close the remaining gaps in the installment lifecycle so packages flow correctly from sale → approval → payment → settlement → close-out without manual SQL.
created_at: 2026-05-17 20:46
linked_pr:
---

# Installment System Completeness

Fixes the operational gaps in the existing installment system: missing reschedule endpoint, broken approval → installment hand-off, no automated overdue evaluation, missing settlement and waive flows, inaccurate `paymentStatus` tracking, refund/reactivation gaps, and several small alignments. Scope is staff/admin-facing only — no customer notifications or customer-facing UI in this session.
