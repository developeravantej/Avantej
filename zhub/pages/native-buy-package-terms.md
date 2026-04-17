# Buy Package – Terms & Conditions

**Route:** `/dashboard/buy-package/terms`
**File:** `apps/native/app/(app)/dashboard/buy-package/terms.tsx:1`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 5b/6) — prev: `sign` (opened from sign screen), next: returns to `sign` via `router.back()`
**Last updated:** 2026-04-16

---

## 1. What It Does

**Purpose (user perspective):** Displays a legal document (Terms & Conditions, Satisfaction Guarantee, or PAR-Q) that the customer can read before agreeing in the sign step.

**Produces:** A scrollable full-screen document viewer. On Android/iOS with local PDFs enabled, it opens the PDF in the system viewer and immediately calls `router.back()`. On web or when local PDF fails, it renders a WebView with a base64-encoded PDF or falls back to hardcoded scrollable text.

**On success:** PDF opens in system viewer (native) or renders in WebView (web). After reading, user presses back to return to the sign step.

**On failure / error states:**
- Loading spinner shown while the PDF asset is downloading.
- If native PDF open fails, shows an Alert with platform-specific guidance and falls back to `localPdfError = true`.
- If `localPdfError` is true and no remote URL is set, falls through to the hardcoded scrollable text (4 sections: Terms of Service, Cancellation, Health Waiver, Privacy Policy).

---

## 2. How It Works

**Execution flow:**
```
TermsScreen
  → useLocalSearchParams<{ pdfUrl?, document? }>()
  → useEffect on documentId
    → Asset.fromModule(documentConfig.asset).downloadAsync()
    → Android: FileSystem.getContentUriAsync → IntentLauncher.startActivityAsync → router.back()
    → iOS: Linking.openURL → router.back()
    → Web: FileSystem.readAsStringAsync (base64) → setPdfViewSource({ html })
  → useFocusEffect: hides tab bar via parent navigator setOptions
```

**Inputs:**
- `params.document` — one of `"agreement"`, `"satisfaction"`, `"parq"` (defaults to `"agreement"`)
- `params.pdfUrl` — optional remote URL override (not used by default, `TERMS_PDF_URL = ""`)

**State management:**
- `pdfViewSource` — `{ uri }` or `{ html }` fed to `<WebView>`
- `localPdfError` — boolean; triggers fallback text render

**Outputs:**
- Native: opens system PDF viewer, then navigates back
- Web: `<WebView>` with base64 PDF embed
- Fallback: `<ScrollView>` with hardcoded terms text

**Side effects:**
- Hides the tab bar for the duration of the screen via `useFocusEffect` + parent navigator traversal.

---

## 3. What Depends On It

**Calls these API endpoints:** None — fully offline/local document screen.

**Uses these components:**
- `Container` — `apps/native/components/container.tsx` — root safe-area wrapper
- `WebView` — `react-native-webview` — PDF rendering on web
- `expo-asset` — PDF asset resolution
- `expo-file-system/legacy` — base64 read + content URI conversion
- `expo-intent-launcher` — Android PDF intent

**Navigation: who navigates here:**
- `apps/native/app/(app)/dashboard/buy-package/sign.tsx` — when user taps "View Terms" link, pushes `./terms` with `{ document: "agreement" | "satisfaction" | "parq" }`

**Navigation: where it goes:**
- `router.back()` — always; triggered after PDF opens on native, or user presses the back arrow

---

## 4. Data Shapes

**DB tables touched:** None.

**Key types:**
```typescript
// Local document registry
DOCUMENT_ASSETS: Record<string, { asset: number; name: string } | undefined>
// Keys: "agreement" | "satisfaction" | "parq"
```

**PDF asset files (must exist at build time):**
- `apps/native/assets/documents/agreement.pdf`
- `apps/native/assets/documents/satisfaction-guarantee.pdf`
- `apps/native/assets/documents/parq.pdf`

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Android `IntentLauncher.startActivityAsync` failure path
- iOS `Linking.canOpenURL` returning false
- Web base64 encoding of large PDFs
- Tab bar show/hide state leak if screen unmounts mid-load

---

## 6. Notes

- `USE_LOCAL_PDF = true` is hardcoded; there is no runtime toggle. Flip to `false` only to use the remote `TERMS_PDF_URL` fallback.
- On native, the screen immediately calls `router.back()` after opening the system viewer — the "loading" spinner is only visible for the brief asset download time.
- The tab bar hiding uses a fragile parent-navigator traversal (up to depth 5) rather than a layout-level option. This pattern is repeated in several screens.
- The fallback hardcoded text is dated "January 2025" — it must be manually kept in sync with the actual PDF documents.
- `remotePdfUrl` is proxied through Google Docs Viewer (`docs.google.com/viewer`) when set, which may fail for large files or in restricted networks.
