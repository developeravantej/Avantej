# Test Plan: Features Page

**Route:** `/features`
**Auth required:** no
**Last round:** 1

## Preconditions
- No authentication needed
- App running at localhost:3001

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/features`
**Steps:**
1. Open browser to `http://localhost:3001/features`
2. Wait for full render
**Expected:**
- Hero section with "Powerful Features for Your Business" heading
- Core Features section with 6 feature cards (Dashboard, Scoreboards, Client Mgmt, Calendar, Payroll, Admin)
- Additional Features section (Claims, Role Mgmt, Financial Analytics, Package Mgmt, Payments, Purchase Approval)
- System Features section (Data Center, Announcements, Branding)
- No console errors

### TC-02: Feature cards hover state
**Trigger:** Hover over feature cards
**Steps:**
1. Navigate to `/features`
2. Hover over any feature card
**Expected:**
- Card shows shadow on hover (transition-shadow class)
- Icon remains visible

### TC-03: All feature card icons render
**Trigger:** Inspect all icons
**Steps:**
1. Navigate to `/features`
2. Scroll through all feature sections
**Expected:**
- All 15 feature cards render with their respective Lucide icons
- No broken icon placeholders

### TC-04: No auth required
**Trigger:** Access without login
**Steps:**
1. Ensure logged out
2. Navigate to `/features`
**Expected:**
- Page renders without redirect

### TC-05: Mobile responsiveness
**Trigger:** Resize to mobile
**Steps:**
1. Navigate to `/features`
2. Resize to 375px width
**Expected:**
- Feature grids collapse to single column
- No overflow

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — static content page | — |

## Edge Cases

### EC-01: Direct URL navigation
**Setup:** Navigate directly to `/features`
**Expected:** Page loads without requiring app navigation history

## Known Gaps
- No interactive elements; purely informational page
- No API calls
