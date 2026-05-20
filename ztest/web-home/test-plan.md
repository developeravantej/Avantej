# Test Plan: Home Page

**Route:** `/`
**Auth required:** no
**Last round:** 1

## Preconditions
- No authentication needed
- App running at localhost:3001
- Optional: test with `?invitationToken=<token>&orgId=<id>` query params

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/`
**Steps:**
1. Open browser to `http://localhost:3001/`
2. Wait for page to fully render
**Expected:**
- Header visible with "avantej core" logo, Login button, Get Started button
- Hero section with heading "Streamline Your Business Operations..."
- Key Features section (3 cards: Client Management, Financial Management, Analytics & Reporting)
- Stats section (500+ Active Branches, etc.)
- Comprehensive Business Management features grid
- How It Works section (3 steps)
- Testimonials section (3 cards)
- Pricing section (Starter $99, Professional $299, Enterprise $599)
- CTA section and additional features teaser
- Footer (not explicitly coded; verify no layout breakage)
- No console errors

### TC-02: Login button redirects correctly
**Trigger:** Click Login in header
**Steps:**
1. Navigate to `/`
2. Click the "Login" ghost button in the header
**Expected:**
- Browser navigates to `/login`
- No search params appended (normal flow without invitation)

### TC-03: Get Started button redirects to login
**Trigger:** Click "Get Started" in header
**Steps:**
1. Navigate to `/`
2. Click the primary "Get Started" button in header
**Expected:**
- Browser navigates to `/login`

### TC-04: Hero CTA buttons work
**Trigger:** Click "Get Started" and "Request Demo" in hero section
**Steps:**
1. Navigate to `/`
2. Click the hero "Get Started" button
3. Go back, click "Request Demo"
**Expected:**
- Both navigate to `/login`

### TC-05: Pricing plan CTA buttons work
**Trigger:** Click "Get Started" on each pricing card
**Steps:**
1. Navigate to `/`
2. Click "Get Started" on Starter plan card
3. Go back and verify Professional and Enterprise do the same
**Expected:**
- All three navigate to `/login`

### TC-06: Invitation token preserved in navigation
**Trigger:** Navigate with invitation params
**Steps:**
1. Navigate to `/?invitationToken=abc123&orgId=org456`
2. Click "Login" in header
**Expected:**
- URL navigates to `/login?invitationToken=abc123&orgId=org456`
- Invitation params are forwarded to login page

### TC-07: Invitation token ignored if incomplete
**Trigger:** Navigate with only one param
**Steps:**
1. Navigate to `/?invitationToken=abc123` (no orgId)
2. Click "Login"
**Expected:**
- No search params forwarded to login (empty loginSearch)
- Navigates to `/login` without params

### TC-08: "Explore All Features" link works
**Trigger:** Click "Explore All Features" button in Key Features section
**Steps:**
1. Navigate to `/`
2. Scroll to Key Features section
3. Click "Explore All Features" button
**Expected:**
- Navigates to `/login`

### TC-09: Bottom CTA section links
**Trigger:** Click "Get Started Now" in CTA section and "Explore All Features" in bottom section
**Steps:**
1. Navigate to `/`
2. Scroll to "Ready to transform your business?" section, click button
3. Go back, scroll to bottom "Powerful Features" section, click button
**Expected:**
- Both navigate to `/login`

### TC-10: Page is responsive — mobile viewport
**Trigger:** Resize to 375px width
**Steps:**
1. Navigate to `/`
2. Resize browser to mobile width (375px)
**Expected:**
- Navigation still visible
- Hero section doesn't overflow
- Feature grids stack vertically
- Pricing cards stack vertically
- No horizontal scroll

### TC-11: Social links "coming soon" toast on contact page
**Trigger:** Note: social links are on /contact; verify no broken links here
**Steps:**
1. Navigate to `/`
2. Verify no broken href links in the page source
**Expected:**
- All CTA links are internal `/login` links

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — this is a static marketing page | — |

## Edge Cases

### EC-01: Empty/missing logo image
**Setup:** Simulate logo image 404
**Expected:** Page layout doesn't break; alt text "Logo" visible

### EC-02: Invalid invitation token format in URL
**Setup:** Navigate to `/?invitationToken=&orgId=`
**Expected:** Empty strings treated same as undefined; loginSearch is empty object, no params forwarded

### EC-03: Extra unknown query params
**Setup:** Navigate to `/?foo=bar`
**Expected:** Page renders normally; unknown params are ignored (not validated by validateSearch)

## Known Gaps
- No API calls on this page; all content is static
- Social link functionality ("coming soon" toast) lives on /contact page, not home
- No accessibility testing (keyboard navigation, screen reader)
