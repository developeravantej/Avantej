---
title: Commission Function Cleanup
goal: Fix four frontend defects and land page-level test coverage for the commission ledger
created_at: 2026-04-23 12:45
linked_pr:
---

# Commission Function Cleanup

Ops/finance-facing commission pages (My / All / Liability) have five load-bearing
defects surfaced by `/check`. This session fixes them with test coverage
authored alongside each fix — red-green — so the `test-design` branch ships
both the fix and the regression guard in one pass.
