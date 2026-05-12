# META — Service Config & Trainer-to-Service Assignment

| Field | Value |
|---|---|
| Session ID | 05-07_10-04_service-config |
| Created | 2026-05-07 |
| Area | E — Service Config & Trainer-to-Service Assignment |
| Status | PLANNED |
| Plan file | plan/plan.md |

## Scope

Two feature pillars:

1. **Service Category Config UI** — surface the already-existing `service_category_config` table and `serviceCategoryConfigRouter` in the Categories tab so admins can set booking rules (buffer time, advance booking, cancellation window, default duration/capacity) per category. The backend is fully implemented; only the UI is missing meaningful presentation.

2. **Trainer-to-Service Assignment UI** — surface the already-existing `service_members` table and `serviceMembersRouter` on the Services tab (service detail dialog) and in the Appointments Calendar form so schedulers see only trainers qualified for the selected service.

## Key Finding

Both backend routers (`serviceCategoryConfig.*`, `serviceMembers.*`) already exist and are wired in `packages/api/src/routers/index.ts`. No schema changes are required. This is a pure frontend build.

## Files Affected (estimate)

- `apps/web/src/components/forms/service-category-form.tsx` — already has booking rules section; needs surfacing in detail dialog
- `apps/web/src/components/forms/service-category-detail-dialog.tsx` — add booking rules display panel
- `apps/web/src/components/tables/service-category/view/data-table.tsx` — already opens detail dialog on row click
- `apps/web/src/components/forms/service-detail-dialog.tsx` — add Trainers tab
- `apps/web/src/hooks/useAppointmentFormData.ts` — add service-scoped trainer query
- `apps/web/src/components/calendar/appointment-form/StaffPicker.tsx` — accept filtered trainer list
- `apps/web/src/components/calendar/appointment-form/AppointmentFormContent.tsx` — wire service→trainer filter
