---
title: Installment Residual Fixes
goal: Close the 14 remaining edge-case bugs in installment lifecycle that the completeness plan does not cover.
created_at: 2026-05-17 21:30
linked_pr:
---

# Installment Residual Fixes

Tightens the rough edges left after the completeness plan: correct `paymentStatus` at POS creation, mark installment rows on refund, sweep all overdue installments (not just first), clear `nextDueDate` on lock, harden `rescheduleInstallment`, give admins a path out of `creditsAdminOverride`, define waive credit semantics, and unify payment-method enums. Staff/admin only.
