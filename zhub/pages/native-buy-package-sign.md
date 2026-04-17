# Buy Package — Sign

**Route:** `(app)/dashboard/buy-package/sign`
**File:** `apps/native/app/(app)/dashboard/buy-package/sign.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 5/7) — prev: review, next: pay
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** The user must (1) open and view all three terms documents, (2) check the agreement checkbox, and (3) provide a handwritten e-signature before proceeding to payment.
**Produces:** Three tappable document links (Company–Client Agreement, 100% Satisfaction Guarantee, Par-Q & You), an agreement checkbox, and a signature pad area that opens in a full-screen landscape modal.
**On success:** Both signature and agreedToTerms truthy → Continue ("Proceed to Payment") button appears → context written → navigates to `./pay`.
**On failure / error states:** Tapping the checkbox before viewing all three docs triggers an Alert dialog. Continue button is conditionally hidden until both conditions met.

---

## 2. How It Works

**Execution flow:**
```
SignScreen
  → user taps each TERMS_DOCUMENTS link → router.push("./terms", { document: id }) → setViewedDocs
  → user taps agreement checkbox → handleAgreementPress → checks allTermsViewed → toggles agreedToTerms
  → user taps signature area → handleOpenSignatureModal:
      → ScreenOrientation.lockAsync(LANDSCAPE)
      → setShowSignatureModal(true)
  → SignatureCanvas (react-native-signature-canvas) captures drawing
  → "Confirm Signature" → modalSignatureRef.readSignature() → onOK → setSignature(data)
      → ScreenOrientation.unlockAsync()
  → handleContinue → update({ signature, termsAgreed: true, termsAgreedAt: ISO string })
      → router.push("./pay")
```

**Inputs:** `state.signature`, `state.termsAgreed` (pre-fill on re-entry)
**State management:** Local `signature: string`, `agreedToTerms: boolean`, `showSignatureModal: boolean`, `viewedDocs: Record<string, boolean>`; writes to context on continue
**Outputs:** Terms list, checkbox, signature preview/pad, full-screen modal, Continue button (conditional)
**Side effects:** Screen orientation lock/unlock via `expo-screen-orientation`

---

## 3. What Depends On It

**Calls these API endpoints:** None

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root layout wrapper
- `SignatureCanvas` — `react-native-signature-canvas` — WebView-based signature capture
- `Modal` from react-native — full-screen overlay for landscape signing

**Context:** Reads `signature`, `termsAgreed`. Writes: `signature`, `termsAgreed`, `termsAgreedAt`

**Navigation:**
- `./terms` (with `{ document: "agreement" | "satisfaction" | "parq" }`) — on document link tap
- `./pay` — on "Proceed to Payment" tap

---

## 4. Data Shapes

**DB tables touched:**
| Table | Operation | Key columns used |
|-------|-----------|-----------------|
| (none) | — | — |

**Context fields used:**
| Field | Type | Purpose |
|-------|------|---------|
| signature | string \| null | Pre-fills signature area on re-entry; written on continue (base64 data URI) |
| termsAgreed | boolean | Pre-fills checkbox; written on continue |
| termsAgreedAt | string \| null | ISO timestamp set at time of continue tap |

---

## 5. Tests

**Test files:** None found

---

## 6. Notes

- `viewedDocs` is local state only — it is reset if the user navigates away and returns. The user must re-open each document every session for the checkbox to become tappable.
- The `terms` route is a separate screen (`./terms`) that accepts a `document` param to show the relevant legal text.
- Signature is stored as a base64 PNG data URI (from `react-native-signature-canvas`'s `onOK` callback).
- The cleanup `useEffect` calls `ScreenOrientation.unlockAsync()` on unmount to guarantee portrait is restored if the modal is dismissed abnormally.
- The "Re-sign" button clears the signature and immediately re-opens the landscape modal.
- `expo-screen-orientation` lock only works on physical devices; simulators may ignore orientation lock.
