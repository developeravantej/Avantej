# Test Plan: Contact Page

**Route:** `/contact`
**Auth required:** no
**Last round:** 1

## Preconditions
- No authentication needed
- App running at localhost:3001
- Browser must allow `window.location.href` change (mailto: links)

## Test Cases

### TC-01: Page loads — happy path
**Trigger:** Navigate to `/contact`
**Steps:**
1. Open browser to `http://localhost:3001/contact`
2. Wait for full render
**Expected:**
- Hero section "Contact Us"
- Left column: General Inquiries, Technical Support, Headquarters info
- Right column: "Send Us a Message" form
- Social media buttons (Facebook, Twitter, Instagram, YouTube)
- No console errors

### TC-02: Contact form — valid submission
**Trigger:** Fill and submit the contact form
**Steps:**
1. Navigate to `/contact`
2. Fill "Name" with "Test User"
3. Fill "Email" with "test@example.com"
4. Fill "Subject" with "Test Inquiry"
5. Fill "Message" with "This is a test message for the contact form."
6. Click "Send Message"
**Expected:**
- No validation errors shown
- Toast notification: "Opening your email client..."
- Browser attempts to open mailto: link with encoded subject and body

### TC-03: Form validation — empty submission
**Trigger:** Submit with all fields empty
**Steps:**
1. Navigate to `/contact`
2. Click "Send Message" without filling anything
**Expected:**
- Validation error: "Name must be at least 2 characters" on Name field
- Validation error: "Please enter a valid email" on Email field
- Validation error: "Subject is required" on Subject field
- Validation error: "Message must be at least 10 characters" on Message field
- Form not submitted

### TC-04: Form validation — invalid email
**Trigger:** Enter invalid email
**Steps:**
1. Navigate to `/contact`
2. Fill Name, Subject, Message with valid data
3. Enter "notanemail" in Email field
4. Click "Send Message"
**Expected:**
- Validation error: "Please enter a valid email" on Email field

### TC-05: Form validation — short name
**Trigger:** Enter 1-character name
**Steps:**
1. Navigate to `/contact`
2. Enter "A" in Name field, fill other fields validly
3. Click "Send Message"
**Expected:**
- Validation error: "Name must be at least 2 characters"

### TC-06: Form validation — short message
**Trigger:** Enter fewer than 10 chars in message
**Steps:**
1. Navigate to `/contact`
2. Enter valid name/email/subject, enter "Short" (5 chars) in message
3. Click "Send Message"
**Expected:**
- Validation error: "Message must be at least 10 characters"

### TC-07: Social buttons — "coming soon" toast
**Trigger:** Click any social media button
**Steps:**
1. Navigate to `/contact`
2. Click the Facebook icon button
**Expected:**
- Toast notification: "Social links coming soon"
- No navigation away from page
- Same for Twitter, Instagram, YouTube buttons

### TC-08: Contact info displayed correctly
**Trigger:** Check contact details
**Steps:**
1. Navigate to `/contact`
2. Verify text content in left column
**Expected:**
- General Inquiries: info@avantej.com, (800) 123-4567
- Technical Support: support@avantej.com, (800) 765-4321
- Headquarters: 123 Business Plaza, Suite 500, San Francisco, CA 94107

### TC-09: Send Message button disabled during submission
**Trigger:** Submit form and check button state
**Steps:**
1. Navigate to `/contact`
2. Fill all fields validly
3. Click "Send Message" and immediately check button state
**Expected:**
- Button reflects `disabled` state while `form.formState.isSubmitting` is true

## API Coverage

| Procedure | Tested via |
|-----------|------------|
| None — form uses `mailto:` link, no API calls | — |

## Edge Cases

### EC-01: Mailto blocked by browser
**Setup:** Browser has mailto handler blocked or not configured
**Expected:** Toast still shows; page doesn't crash even if mailto redirect fails silently

### EC-02: Very long message
**Setup:** Enter 1000+ character message
**Expected:** Form submits; mailto URL is generated (may be truncated by OS mailto handler)

### EC-03: Special characters in fields
**Setup:** Enter name with apostrophe, email with + sign, message with & and quotes
**Expected:** `encodeURIComponent` properly encodes; mailto URL opens without breaking

## Known Gaps
- Cannot automate mailto: redirect testing in headless browsers
- Social link functionality not yet implemented (placeholder buttons)
