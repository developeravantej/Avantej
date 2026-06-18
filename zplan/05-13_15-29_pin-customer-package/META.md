---
title: Pin Customer Package for Dashboard Card
goal: Customer pins one package instance; dashboard "Active Plan" card surfaces the pinned package instead of first-active fallback.
created_at: 2026-05-13 15:29
linked_pr:
---

# Pin Customer Package for Dashboard Card

Customers on the native dashboard see a single "Active Plan" card. Today it shows the first active package returned by `getActiveForClient`. This work lets a customer pin one of their own packages from the packages detail screen, and routes the dashboard card to the pinned package when present, falling back to first-active when not.
