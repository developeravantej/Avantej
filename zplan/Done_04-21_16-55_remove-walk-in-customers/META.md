---
title: Remove Saved Walk-in Customers — Go Fully Anonymous
goal: Eliminate the WalkInCustomers entity end-to-end; all walk-in interactions (POS sales, attendance check-ins) are anonymous with no DB record.
created_at: 2026-04-21 16:55
linked_pr:
---

# Remove Saved Walk-in Customers — Go Fully Anonymous

Replace the entire saved-walk-in-customer workflow (UI + router + service paths) with anonymous walk-ins everywhere the system currently accepts them. POS already bypasses `walkInCustomers` via the `"anonymous"` sentinel; this work brings the attendance drop-in flow into the same model, removes the walk-in customers page + redirect route, stubs the `walkInCustomers` oRPC router to return empty/disabled responses, and fixes two correctness leaks found during planning (POS search still returns walk-ins, 30-min anti-duplicate collapses when every walk-in shares the same `clientId`).
