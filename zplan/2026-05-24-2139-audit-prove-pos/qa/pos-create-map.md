# Page QA Map — POS New Sale (`/dashboard/sales/create`)

**Mode:** `--page` white-box, functional/behavioral.
**Route file:** `apps/web/src/routes/_authenticated/dashboard/_layout/sales/create.tsx`
**Component:** `apps/web/src/components/pos/pos-workflow.tsx` (+ step components in `components/pos/`)
**Gate:** `bun check-types --filter web` → **PASS** (cold, 53.9s).

## Data path
`create.tsx` (route guard `sales:create`) → `PosWorkflow` (in-component guard `pos:create`) → step components:
- `customer-step` → `client.pos.searchCustomers`
- `items-step` → `client.services.list`, `client.services.resolvePrice`
- `promo-step` → `client.promotions.validate`
- `payment-step` → `client.installmentPlans.list`, `client.members.list({role:trainer})`
- `trainer-picker-step` → `client.members.list({role:trainer})`
- workflow → `client.taxRates.list/getDefault`, `client.salesOrders.getLatest`, `client.customerDirectory.getById` (prefill), `client.pos.recordSale` (submit)

## Interactive elements
Member/Walk-in toggle · customer search (`pos-member-search-input`) · Add Service (`pos-add-service-button`) / Add Custom (`pos-add-product-button`) · per-row service `Select`, qty stepper (min 1), price input · tax-rate `Select` · trainer-assignment slots · notes textarea · promo code input + Apply · 4 payment cards (Cash/Card/Bank Transfer/Online) · payment reference input · cash-tendered input · installment-plan `Select` (`pos-installment-plan-select`) · preferred-trainer `Select` · step Continue/Back buttons · Charge & Confirm (`pos-complete-sale-button`) · Clear-cart dialog · Print/Email (Email disabled).

## Journeys
- **Golden (member):** select member → add item → (promo) → cash → confirm → `/dashboard/sales/$id`.
- **Golden (walk-in):** Walk-in toggle → add custom item → cash → confirm.
- Edit any completed step via its "Edit"/"Change" affordance (accordion re-opens).

## Data states
- **Loading:** customer search spinner; service price `Loader2`; skeleton rows in customer list.
- **Empty:** "No customers found"; "No services available"; "No instalment plans configured"; "No trainers found".
- **Error:** promo validate error inline; submit error → toast (incl. friendly `non_client_member` copy).
- **Success:** toast "Sale recorded successfully!" + navigate to receipt.

## Input validation / guards (source-derived)
| Guard | Source | Behavior |
|---|---|---|
| Continue→Items needs a customer | `pos-workflow.tsx:840,683` | button disabled until `hasCustomer` |
| Continue→Promotions needs ≥1 item | `pos-workflow.tsx:987,684` | disabled until `hasItems` |
| Cash tendered ≥ total & > 0 | `pos-workflow.tsx:446-449,1118` | Review&Confirm disabled; inline "less than total" error (`payment-step.tsx:234`) |
| Submit readiness | `pos-workflow.tsx:449` | `hasCustomer && hasItems && hasPaymentMethod && cashOk` |
| Promo Apply disabled | `promo-step.tsx:142` | no code / pending / `items.length===0` |
| Service price read-only once resolved | `items-step.tsx:193` | price input disabled for lookup items with refId |
| No branch price | `items-step.tsx:197` | amber "No price configured" + price 0 |

## State transitions / side effects
- Switch member↔walk-in → clears customer + items + promo (`pos-workflow.tsx:463`).
- Select different customer with items present → "Clear cart?" dialog; confirm clears items/promo/trainer/preferred (`:473,497`).
- Cart subtotal change with promo applied → promo removed + toast "Cart changed — promo code removed" (`:453`).
- Cash method → tendered auto-set to total (`payment-step.tsx:108`).
- Service/package item present → installment + preferred-trainer pickers appear (`payment-step.tsx:121`).
- Selecting a service sets the line `type:"package"` (`items-step.tsx:76`) even though the button is "Service".

## Functional issues found (white-box)
1. **`"online"` payment is not a valid method (BUG).** `payment-step.tsx:61` offers "Online (Stripe link)" → `method="online"` via `as any`, but `PaymentMethod` (`types.ts:44`) = `cash|card|manual_transfer|fpx|stripe` and the server enum (`pos.ts:62`) has no `online`. Submitting will fail server validation. The `as any` cast is why `tsc` stays green. → **C-13**
2. **Walk-in can build an invalid package cart (BUG/UX).** Walk-in + "Add Service" + pick a service → line becomes `type:"package"` → submit fails server-side "Walk-in customers cannot purchase packages" (`pos.service.ts:252`). No client-side block. → **C-14**
3. **Permission key mismatch.** Route guard `sales:create` (`create.tsx:9`) vs component `pos:create` (`pos-workflow.tsx:247`). A user with one but not the other gets inconsistent access. → **C-17** (needs a non-admin seeded role; `testable:false`).
4. **Dead friendly-error path.** `non_client_member` toast (`pos-workflow.tsx:615`) is unreachable from this page because `searchPosCustomers` only returns `role:client` (`pos.service.ts:862`). → **C-15** (`testable:false`).
