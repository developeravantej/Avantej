# Test Plan: Trainers Tiers (Redirect)

**Route:** `/dashboard/trainers/tiers`
**Auth required:** yes
**Last round:** 1

## Preconditions
- User logged in

## Test Cases

### TC-01: Route redirects to trainers tiers tab
**Trigger:** Navigate to `/dashboard/trainers/tiers`
**Steps:**
1. Log in, navigate to route
**Expected:**
- `redirect()` fires in `beforeLoad`
- Navigates to `/dashboard/trainers/view?tab=tiers`
- TrainerTiersPage rendered

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — pure redirect | — |

## Known Gaps
- Pure redirect stub
