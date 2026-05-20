# Test Plan: Demo Request Page

**Route:** `/demo`
**Auth required:** no
**Last round:** 1

## Preconditions
- No authentication needed
- App running at localhost:3001

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/demo`
**Steps:**
1. Open browser to `http://localhost:3001/demo`
2. Wait for full render
**Expected:**
- Hero section: "Request a Demo" heading and subtext
- Card with "Get in Touch" title and description
- Form with: Name (*required), Email (*required), Company (optional), "How can we help?" textarea (optional)
- "Request Demo" button
- No console errors

### TC-02: Form submission — all fields filled
**Trigger:** Fill all fields and submit
**Steps:**
1. Navigate to `/demo`
2. Fill Name: "Jane Smith"
3. Fill Email: "jane@example.com"
4. Fill Company: "Acme Fitness"
5. Fill message: "We need a demo for our franchise network."
6. Click "Request Demo"
**Expected:**
- No validation errors
- Toast: "Opening your email client..."
- Browser opens mailto: link to support@avantej.com with subject "Demo Request" and all fields in body

### TC-03: Form submission — required fields only
**Trigger:** Fill only Name and Email
**Steps:**
1. Navigate to `/demo`
2. Fill Name: "Bob"
3. Fill Email: "bob@test.com"
4. Leave Company and message empty
5. Click "Request Demo"
**Expected:**
- No validation errors (Company and message are optional)
- Toast shown
- Mailto body contains "I would like to request a demo of Avantej." as default message

### TC-04: Validation — empty required fields
**Trigger:** Submit empty form
**Steps:**
1. Navigate to `/demo`
2. Click "Request Demo" without filling anything
**Expected:**
- Error on Name: "Name must be at least 2 characters"
- Error on Email: "Please enter a valid email"

### TC-05: Validation — invalid email
**Trigger:** Enter bad email
**Steps:**
1. Navigate to `/demo`
2. Fill Name: "Test", Email: "bademail"
3. Click "Request Demo"
**Expected:**
- Error: "Please enter a valid email"

### TC-06: Validation — short name
**Trigger:** Single char name
**Steps:**
1. Navigate to `/demo`
2. Fill Name: "X", valid Email
3. Click "Request Demo"
**Expected:**
- Error: "Name must be at least 2 characters"

### TC-07: Button disabled during submission
**Trigger:** Check button disabled state while submitting
**Steps:**
1. Fill form validly
2. Click "Request Demo"
3. Check button state immediately
**Expected:**
- Button shows disabled during `form.formState.isSubmitting`

### TC-08: Company null handling in mailto body
**Trigger:** Submit without company
**Steps:**
1. Fill only Name and Email
2. Submit
**Expected:**
- Mailto body does NOT include "Company: " line (null filtered out)
- Body contains name, email, and default message

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — form uses `mailto:` link, no API calls | — |

## Edge Cases

### EC-01: Company with special characters
**Setup:** Enter company name with "&" or quotes
**Expected:** `encodeURIComponent` encodes properly; no broken mailto URL

### EC-02: Very long message
**Setup:** Enter 2000 character message
**Expected:** Form submits; mailto URL generated (may hit URL length limits in some OS clients)

## Known Gaps
- Cannot automate mailto: redirect testing in headless browsers
- No server-side handling of demo requests; relies on user's local email client
