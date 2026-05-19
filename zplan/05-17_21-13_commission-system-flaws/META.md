---
title: Commission System Flaw Remediation
goal: Close 7 remaining correctness/governance gaps in the trainer commission pipeline (flaws #7–#13).
created_at: 2026-05-17 21:13
linked_pr:
---

# Commission System Flaw Remediation

Tightens commission calculation, manual-adjustment governance, and approval-batch safety after audits #1 and #2 of `commission-calculator.service.ts`, `commission-splits.service.ts`, and `appointment.service.ts`. Targets payroll-affecting edge cases (POS quantity tiers, price drift, mid-cycle rate changes, comp orders without sales orders, cross-trainer batch approvals) and gives `pending_review` a real resolution path.
