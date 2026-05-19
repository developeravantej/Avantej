# Test Plan: Trainers View

**Route:** `/dashboard/trainers/view`
**Auth required:** yes
**Last round:** 1

## Preconditions
- Log in as franchisee@gmail.com / password123
- Permission required: `user_management:read`
- Route delegates to `TrainersListPage` and `TrainerTiersPage` components

## Test Cases

### TC-01: Page loads — Trainers tab (default)
**Trigger:** Navigate to `/dashboard/trainers/view`
**Steps:**
1. Log in as admin, navigate to route
2. Wait for load
**Expected:**
- Users icon + "Trainers" heading + "Manage trainers and their seniority tiers" description
- "Trainers" and "Tiers" tab buttons
- "Trainers" tab active by default
- TrainersListPage content rendered
- No console errors

### TC-02: Switch to Tiers tab
**Trigger:** Click "Tiers" tab
**Steps:**
1. Navigate to route
2. Click "Tiers" tab
**Expected:**
- URL: `?tab=tiers`
- TrainerTiersPage renders

### TC-03: Switch back to Trainers tab
**Trigger:** Click "Trainers" tab from Tiers
**Expected:**
- URL: `?tab=trainers`
- TrainersListPage renders

### TC-04: Direct navigation to Tiers tab
**Trigger:** Navigate with `?tab=tiers`
**Expected:**
- TrainerTiersPage renders on load

### TC-05: Trainers list — populated
**Trigger:** Wait for trainers data
**Expected:**
- List/table of trainers
- Each row: name, tier, services, hire date, status

### TC-06: Trainers list — empty
**Trigger:** No trainers in org
**Expected:**
- Empty state shown

### TC-07: Trainer tiers — populated
**Trigger:** View TrainerTiersPage
**Expected:**
- Tiers list rendered
- Each tier: name, level, commission rules

### TC-08: Trainer tiers — empty
**Trigger:** No tiers defined
**Expected:**
- Empty state shown in tiers

### TC-09: Permission guard
**Trigger:** Access without user_management:read
**Expected:**
- requirePermission() in beforeLoad redirects (stub behavior)

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| `client.trainers.list(...)` (in TrainersListPage) | TC-05 |
| `client.trainerTiers.list(...)` (in TrainerTiersPage) | TC-07 |

## Edge Cases

### EC-01: Unknown tab param
**Setup:** `?tab=unknown`
**Expected:** Defaults to "trainers" tab

## Known Gaps
- TrainersListPage and TrainerTiersPage not inspected in detail
- CRUD operations in tiers (create/edit) not covered
