---
title: Web App Debt Cleanup (Q2 2026)
goal: Remediate critical findings from 5-agent review of apps/web — security, type safety, tests, and bundle size.
created_at: 2026-05-09 15:30
linked_pr:
---

# Web App Debt Cleanup

Remediate the 5.5/10-rated `apps/web` findings: token-leaking console.logs, 116 type errors, 77 failing tests, 12+ `as any` casts, 6 god-files >900 lines, fake-async `usePermission`, unused deps, and missing code splitting. Ships in 6 phases over ~3 weeks; Phase 1 lands security fixes within 24h.
