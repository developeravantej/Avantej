# Sign Screen

**Route:** `(app)/dashboard/buy-package/sign`
**File:** `apps/native/app/(app)/dashboard/buy-package/sign.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 5/7) — prev: review, next: pay
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Review and electronically sign terms documents; confirm agreement before payment.

**Produces:**
- Document links (3 required: agreement, satisfaction guarantee, par-q).
- Signature canvas (tap to open landscape modal for signing).
- Agreement checkbox (enabled only after viewing all docs).
- Continue button (enabled only when signed and terms agreed).

**On success:** Signature, agreement flag, and timestamp saved to state; navigates to pay screen.

**On failure / error states:**
- Not all documents viewed: alert on checkbox tap, prevent agreement toggle.
- No signature: Continue button hidden.
- No agreement: Continue button hidden.

---

## 2. How It Works

**Execution flow:**
1. Mount: Track viewed docs state; load signature and agreement from context.
2. User taps document link → open terms screen (params: document ID) → mark doc as viewed.
3. User taps signature area → open landscape modal with SignatureCanvas.
4. In modal: user signs on canvas → tap Confirm → close modal, store signature data URI.
5. User taps agreement checkbox → if all docs viewed, toggle agreement state.
6. Continue button (visible only if signature && agreedToTerms) → save to context, push to pay.

**Inputs:**
- Navigation params: none.
- Context state: signature, termsAgreed (initial values from context).
- Local state: signature (string, data URI), agreedToTerms (boolean), viewedDocs (map), showSignatureModal.

**State management:**
- PurchaseFlow context: stores signature, termsAgreed, termsAgreedAt (ISO timestamp set on continue).
- Local state: signature URI, agreement flag, viewed docs tracking.

**Outputs:**
- On continue: `update({ signature, termsAgreed: true, termsAgreedAt: new Date().toISOString() })`.
- Navigates to `./pay`.

**Side effects:**
- Screen orientation locked to LANDSCAPE when modal open (ScreenOrientation API).
- Signature data URI stored (image); can be large.

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `Container` — wrapper.
- `SignatureCanvas` from react-native-signature-canvas — drawing canvas for signature.
- `Modal` — fullscreen landscape signature capture.

**Uses these hooks:**
- `usePurchaseFlow` — read/write signature, agreement, timestamp.
- `useRef` — ref to SignatureCanvas for clear/confirm actions.
- `useState` — signature, agreement, modal visibility, viewed docs.
- `useEffect` — cleanup for screen orientation on unmount.

**Uses external libraries:**
- expo-screen-orientation — lock/unlock landscape orientation.
- react-native-signature-canvas — signature capture UI.

**Navigation: who navigates here:** `./review` on continue.

**Navigation: where it goes:** `./pay` on continue.

---

## 4. Data Shapes

**DB tables touched:** None (UI only; saved at payment step).

**Key types / Zod schemas:**
- `signature`: string (data URI format, e.g., `data:image/png;base64,...`).
- `termsAgreed`: boolean.
- `termsAgreedAt`: ISO 8601 timestamp string.
- `viewedDocs`: Record<string, boolean> (document ID → viewed flag).

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- SignatureCanvas data URI format and size (large blobs, memory impact).
- Landscape orientation lock on iPad (multi-window scenarios).
- Modal dismissal via system back button (Android).
- Signature re-sign flow (clearing and re-signing).
- Very quick tap/drag on canvas (minimal signature detection).
- Accessibility of modal and signature canvas.

---

## 6. Notes

- Signature stored as data URI (base64 PNG); consider file size limit and storage implications.
- Agreement checkbox enforces viewing all three documents before toggle; may be over-protective if users want to skip docs.
- Screen orientation controlled via expo-screen-orientation; ensure cleanup in useEffect (lines 83–87).
- SignatureCanvas uses custom webStyle (lines 488–509) to hide default buttons/footer.
- Modal rendered inline (lines 417–542); large component tree increases complexity.
- Re-sign flow (lines 395–407) clears signature and reopens modal; consider UX flow.
- Document tracking (viewedDocs) local-only; not persisted; resets on unmount.
