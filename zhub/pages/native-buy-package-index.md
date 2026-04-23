# Buy Package Multi-Step Flow — Documentation Index

**Complete flow:** Avantej native app package purchase journey  
**Total screens:** 8  
**Last updated:** 2026-04-23

---

## Flow Overview

```
Setup (1/7) 
  ↓ (category, service, package)
Schedule (2/7)
  ↓ (preferred times for private / fixed for classes)
Info (3/7)
  ↓ (remark)
Plan (4/7)
  ↓ (payment plan type: full/half/quarterly) — or auto-skip if only full
Review (4/7) — re-numbered, shows summary
  ↓ (read-only summary)
Sign (5/7)
  ↓ (e-signature, terms agreement, document viewing)
Terms (modal/sub-screen, part of Sign)
  ↓ (view PDF or HTML terms)
Pay (6/7)
  ↓ (create packageInstance, save preferred times)
Done (7/7)
  ↓ (completion screen)
```

---

## Screen Documentation Files

| Screen | File | Route | Purpose |
|--------|------|-------|---------|
| Setup | `native-buy-package-setup.md` | `(app)/dashboard/buy-package/setup` | Select category, service, package via cascading dropdowns |
| Schedule | `native-buy-package-schedule.md` | `(app)/dashboard/buy-package/schedule` | Preferred times (private) or fixed schedule notice (classes) |
| Info | `native-buy-package-info.md` | `(app)/dashboard/buy-package/info` | Optional remarks text field |
| Plan | `native-buy-package-plan.md` | `(app)/dashboard/buy-package/plan` | Select payment plan (full/half/quarterly) or auto-skip |
| Review | `native-buy-package-review.md` | `(app)/dashboard/buy-package/review` | Read-only summary of all selections |
| Sign | `native-buy-package-sign.md` | `(app)/dashboard/buy-package/sign` | E-signature capture, terms agreement, document links |
| Terms | `native-buy-package-terms.md` | `(app)/dashboard/buy-package/terms` | PDF/HTML document viewer (sub-screen of Sign) |
| Pay | `native-buy-package-pay.md` | `(app)/dashboard/buy-package/pay` | Order summary, tax calculation, API calls to create purchase |
| Done | `native-buy-package-done.md` | `(app)/dashboard/buy-package/done` | Completion screen (pre-existing docs) |

---

## Key Data Structures

**PurchaseFlowState** (context-managed):
- Step 1 (Setup): categoryId, categoryName, serviceId, serviceName, serviceType, packageId, packageName, creditsTotal, price, validityDays, availablePaymentPlans, installmentIntervalDays
- Step 2 (Schedule): preferredTimes (array of {day, time})
- Step 3 (Info): remark
- Step 4 (Plan): paymentPlanType, availablePaymentPlans, installmentIntervalDays
- Step 5 (Sign): signature (data URI), termsAgreed, termsAgreedAt
- Step 6 (Pay): paymentMethod, packageInstanceId

**API endpoints called:**
- Setup: `orpc.serviceCategories.list`, `orpc.services.list` (×2)
- Pay: `orpc.taxRates.getDefault`, `client.packageInstances.create`, `client.preferredTimes.upsert`
- Terms: asset loading, no API calls

---

## Cross-Cutting Concerns

### State Management
- **PurchaseFlowContext:** React Context (provider-based, in-memory state, no persistence)
- **TanStack Query:** caches service categories and services
- **Local state:** UI state (form inputs, picker state, modal visibility)

### Navigation
- **Entry point:** Dashboard or parent screens push to `./setup`
- **Exit point:** Pay screen navigates to `./done` on success
- **Back navigation:** All screens support back via header icon or hardware back button
- **Tab bar:** Hidden during entire flow via `useFocusEffect` + `setOptions` (setup.tsx initiates, pattern shared)

### Data Persistence
- **During flow:** All data in PurchaseFlowContext (in-memory, lost on app close)
- **After payment:** Package instance created in DB (packageInstances table)
- **Preferred times:** Saved separately in preferredTimes table (if provided)

### Platform Differences
- **Schedule screen:** iOS uses native DateTimePicker; Android uses custom scroll picker
- **Terms screen:** iOS/Android open system PDF viewer; web uses WebView with Google Docs or base64 embed
- **Signature:** react-native-signature-canvas (works on all platforms but requires modal + orientation lock)

### Error Handling
- Setup/Schedule/Info/Plan/Review: No explicit error boundaries; API failures will crash screen
- Pay: Error caught and displayed via Alert
- Terms: PDF load failures fallback to HTML text

### Validation
- Setup: All three selections required before Continue visible
- Schedule: At least 1 preferred time required (if private) or always enabled (if classes)
- Info: No validation (optional field)
- Plan: Auto-skip if only one option; continue always enabled if >0 plans
- Review: No validation (read-only)
- Sign: Both signature and agreement required before Continue visible
- Pay: No validation (direct to API)

---

## Known Issues & Quirks

1. **Step counter inconsistency:** Some screens show 7 steps, others show 8; setup.tsx uses totalSteps = 7 (line 109) but step counter at 1/8. Plan screen shows 4/8 but should be 4/7. Pay shows 7/8 but should be 6/7.

2. **Preferred times day/time validation:** No deduplication enforced in UI; can add same day/time twice if not careful (checked in code but no visual feedback). No timezone support; times are naive.

3. **Package filtering logic:** Service type "both" is compatible with both "private" and "semi_private" packages; filtering at line 140 checks `s.type === serviceType || s.type === "both"`.

4. **Android time picker:** Custom scroll picker (lines 58–314 in schedule.tsx) is complex and untested; uses ScrollView snap behavior which may vary on different devices.

5. **Signature data URI size:** Signature stored as base64 PNG data URI; can be large (100KB+ for detailed signatures); may impact API payload limits.

6. **Preferred times saving non-critical:** If upsert fails at pay screen (line 102), error is silently swallowed; no user notification.

7. **Tax rate in basis points:** Fetched as basis points (e.g., 1000 = 10%); ensure backend returns correct unit. Tax rate query not error-handled; missing rate defaults to 0%.

8. **Document tracking (Sign screen):** `viewedDocs` state is local-only; resets on unmount. No persistence if user leaves and re-enters.

9. **Tab bar visibility:** Hidden via `useFocusEffect` and `setOptions({ tabBarStyle: { display: "none" } })`; recovery depends on navigation state tree structure (fragile).

10. **No test coverage:** All screens lack unit/integration tests; complex flows like Android time picker, signature modal, and multi-step form validation are untested.

---

## Recommendations for Enhancement

1. Consolidate step counter to consistent 7 steps across all screens.
2. Add error boundaries at screen level to catch API failures gracefully.
3. Persist preferred times to context immediately (not just at pay step).
4. Add max-length validation to remark field.
5. Test Android time picker on various devices; consider alternative time picker library.
6. Validate payment plan options at setup step to avoid invalid states downstream.
7. Add comprehensive unit/integration test suite for multi-step flow.
8. Consider persisting PurchaseFlowState to AsyncStorage for recovery on app crash.
9. Log or alert on non-critical failures (e.g., preferred times upsert).
10. Support timezone selection in Schedule screen for preferred times.
11. Add "edit" buttons in Review screen to allow returning to specific steps.
12. Implement Stripe integration for Pay screen (currently disabled).
