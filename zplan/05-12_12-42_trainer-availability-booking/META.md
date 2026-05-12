---
title: Trainer Availability + Conflict-Aware Booking
goal: Customer books a workout only into a slot the assigned trainer is actually free for, with concurrent-booking safety.
created_at: 2026-05-12 12:42
linked_pr:
---

# Trainer Availability + Conflict-Aware Booking

Make the native `book-workout` schedule step reflect the assigned trainer's real weekly availability minus already-booked appointments, with a server-side conflict re-check at insert time so two customers can't grab the same slot. Reconciles the gap between the web "Trainer Availability" admin view (`coach_intake_availability`) and the booking engine (`trainer_availability`).
