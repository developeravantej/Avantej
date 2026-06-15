---
title: Approvals — Two-Stage Payment → Assignment Pipeline
goal: Add a payment-confirmation stage to the approvals page so unpaid packages have a home and trainers are only assigned to paid packages
created_at: 2026-05-31 19:06
linked_pr:
---

# Approvals — Two-Stage Payment → Assignment Pipeline

Adds an "Awaiting payment" stage to the Operations → Approvals page where front-desk staff confirm off-platform payments (manual transfer / cash) before a package becomes assignable to a trainer. Online (Stripe) payments auto-confirm via webhook and never need the manual step. Ships for gym front-desk staff, managers, and trainers.
