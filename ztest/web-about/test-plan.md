# Test Plan: About Page

**Route:** `/about`
**Auth required:** no
**Last round:** 1

## Preconditions
- No authentication needed
- App running at localhost:3001

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/about`
**Steps:**
1. Open browser to `http://localhost:3001/about`
2. Wait for page to fully render
**Expected:**
- Hero section: "About Avantej" heading and subtext visible
- "Our Story" section with 3 paragraphs
- "Our Values" section with 3 items (Customer Success, Innovation, Integrity)
- "Our Leadership Team" section with 4 placeholder team members
- No console errors
- No layout overflow

### TC-02: Page renders without auth
**Trigger:** Access while logged out
**Steps:**
1. Ensure not logged in
2. Navigate to `/about`
**Expected:**
- Page renders normally (no auth redirect)

### TC-03: Values section displays correctly
**Trigger:** Load page, inspect values
**Steps:**
1. Navigate to `/about`
2. Scroll to "Our Values" section
**Expected:**
- Three value items each with: check icon, title, and description
- Customer Success, Innovation, Integrity titles visible

### TC-04: Leadership team section
**Trigger:** Scroll to leadership section
**Steps:**
1. Navigate to `/about`
2. Scroll to "Our Leadership Team"
**Expected:**
- 4 team members: Sarah Johnson (CEO & Co-Founder), Michael Chen (CTO & Co-Founder), Amanda Rodriguez (COO), David Kim (Head of Product)
- Placeholder avatar circles visible for each

### TC-05: Mobile responsiveness
**Trigger:** Resize to mobile viewport
**Steps:**
1. Navigate to `/about`
2. Resize browser to 375px
**Expected:**
- Grid sections stack to single column
- No horizontal scroll

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — static content page | — |

## Edge Cases

### EC-01: Direct URL navigation
**Setup:** Navigate directly to `/about`
**Expected:** Page loads without requiring app navigation history

## Known Gaps
- No interactive elements to test
- No API calls; fully static content
- Leadership team uses placeholder avatars (gray circles); no real images
