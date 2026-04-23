# Terms Screen

**Route:** `(app)/dashboard/buy-package/terms`
**File:** `apps/native/app/(app)/dashboard/buy-package/terms.tsx`
**Platform:** native
**Auth required:** authenticated
**Flow:** buy-package (step 5/7 — sign step) — prev: sign, next: sign
**Last updated:** 2026-04-23

---

## 1. What It Does

**Purpose (user perspective):** Display terms, conditions, and legal documents (PDF or HTML fallback).

**Produces:**
- Native platforms (iOS/Android): Open system PDF viewer; auto-navigate back after open attempt.
- Web: Display PDF in WebView (via Google Docs Viewer or embedded base64 HTML).
- If no PDF: fallback to in-screen HTML text (terms section).

**On success:** Document viewed; back button returns to sign screen.

**On failure / error states:**
- PDF load error: show alert, set `localPdfError` flag, render fallback HTML text.
- System PDF viewer unavailable: alert user to install PDF app.

---

## 2. How It Works

**Execution flow:**
1. Extract document ID and PDF URL from route params (defaults to "agreement").
2. If USE_LOCAL_PDF: load bundled PDF asset asynchronously.
3. On native: open in system viewer → immediate back navigation.
4. On web: convert to base64 data URI, render in WebView.
5. If error: fallback to bundled HTML terms text.

**Inputs:**
- Route params: `document` (ID: agreement/satisfaction/parq), `pdfUrl` (remote URL).
- Navigation context: current navigation object.

**State management:**
- Local state: `pdfViewSource` (URI or HTML), `localPdfError` (boolean).
- Asset loading via expo-asset (cached after first fetch).

**Outputs:**
- Renders WebView, ActivityIndicator, or ScrollView (fallback HTML).
- Side effect: tab bar hidden (useFocusEffect pattern, lines 141–185).

**Side effects:**
- Tab bar hidden via `setOptions`.
- File system operations: Asset.downloadAsync(), FileSystem.getContentUriAsync() (Android), base64 encoding (web).

---

## 3. What Depends On It

**Calls these API endpoints:** None.

**Uses these components:**
- `WebView` from react-native-webview — PDF display.
- `Container` — wrapper.

**Uses these hooks:**
- `useFocusEffect` — hide tab bar.
- `useState` — PDF source and error state.
- `useEffect` — async PDF asset loading.
- `useNavigation` — access to tabs navigator.

**Uses external libraries:**
- expo-asset — bundle PDF loading.
- expo-file-system — file operations and base64 encoding.
- expo-intent-launcher — Android system PDF viewer launch.
- react-native-webview — PDF rendering.

**Navigation: who navigates here:** `./sign` screen (via router.push with params).

**Navigation: where it goes:** Back to `./sign` (router.back()).

---

## 4. Data Shapes

**DB tables touched:** None (documents bundled as assets).

**Key types / Zod schemas:**
- `params`: `{ pdfUrl?: string; document?: string }`.
- `DOCUMENT_ASSETS`: map of document ID to `{ asset: number; name: string }`.

---

## 5. Tests

**Test files:** None found.

**Not tested (risk areas):**
- Asset resolution in Metro bundler for require() statements.
- Platform-specific file URI handling (Android content:// vs file://).
- Large PDF rendering performance in WebView.
- Cancellation token behavior in cleanup function.
- Tab bar recovery on abnormal unmount.
- Base64 encoding of large PDFs on web (memory impact).

---

## 6. Notes

- USE_LOCAL_PDF flag (line 24) can be toggled to use remote URLs; TERMS_PDF_URL empty, so local fallback used.
- DOCUMENT_ASSETS requires() statement dependencies must be bundled; verify Metro includes assets/documents/*.pdf.
- On native platforms, router.back() is called immediately after opening PDF; user sees loader briefly then returns to sign screen.
- Web platform loads PDF via Google Docs Viewer if remote URL; prone to slow load and third-party dependency.
- Fallback HTML (lines 280–446) hardcodes terms text; should be templated or localized.
- Tab bar hiding uses depth-first search for tabs navigator; fragile if navigation structure changes.
