# Phase 3: Frontend Updates (Web + Native)

**Goal:** Rewire frontend forms, update package pages to use services, update native app package flow.

**Dependencies:** Phase 2 complete (new router exists, `packageInstances` accepts `serviceId`).

**CRITICAL: Phase 2 + 3 must deploy together.** Do not deploy Phase 3 frontend without Phase 2 backend, or vice versa.

---

## Task 3.1: Rewire service category data-table import

**File (MODIFY):** `apps/web/src/components/tables/service-category/view/data-table.tsx`

Change:

```typescript
// BEFORE
import { ServiceCategoryCreateEditDialog } from "@/components/forms/service-category-create-edit-dialog";

// AFTER
import { ServiceFormDialog } from "@/components/forms/service-category-form";
```

Update the JSX that renders the dialog to use `ServiceFormDialog` props instead of `ServiceCategoryCreateEditDialog` props. The `ServiceFormDialog` expects:

```typescript
interface ServiceFormDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: ServiceFormData, serviceId?: number) => Promise<void>;
    initialData?: ServiceFormData & { id: number };
    mode?: 'create' | 'edit';
}
```

Map from the data-table's current state to these props.

**Acceptance criteria:**
- "Add Service Category" button opens the full form (17 fields: name, duration, max attendees, booking rules, commission config, staff weightage)
- Edit also opens the full form with pre-populated data
- No TypeScript errors

---

## Task 3.2: Fix service category form submit handler

**File (MODIFY):** `apps/web/src/components/forms/service-category-form.tsx`

The current submit handler (lines 412-476) is wrong — it creates a **service** and writes to per-service config tables. Rewrite it to:

### Step 1: Create or update a service category (not a service)

```typescript
// BEFORE (wrong)
const serviceResult = await client.services.create({...});

// AFTER (correct)
if (mode === 'edit' && initialData?.id) {
    await client.serviceCategories.update({
        organizationId,
        id: String(initialData.id),
        name: formData.name,
        description: null,
        displayOrder: 0,
        isActive: true,
    });
    categoryId = String(initialData.id);
} else {
    const categoryResult = await client.serviceCategories.create({
        organizationId,
        name: formData.name,
        description: null,
        displayOrder: 0,
        isActive: true,
    });
    categoryId = (categoryResult as any).id;
}
```

### Step 2: Upsert category config (not per-service config)

```typescript
// BEFORE (wrong)
await client.serviceCommissionConfig.upsert({...});
await client.serviceRules.upsert({...});

// AFTER (correct)
await client.serviceCategoryConfig.upsert({
    organizationId,
    categoryId,

    // Defaults
    defaultDuration: formData.duration,
    defaultMaxAttendees: formData.maxAttendees ?? 1,

    // Commission
    incentiveType: formData.incentive.type,
    isConditional: formData.incentive.isConditional,
    maxStaff: formData.incentive.staffWeightage.length,
    staffPoolPercentage: formData.incentive.staffPoolPercentage ?? 100,
    staffWeightage: formData.incentive.staffWeightage.map(sw => ({
        position: sw.position,
        percentage: sw.percentage,
        title: sw.title,
    })),
    paymentStructures: formData.incentive.paymentStructure,
    threshold: formData.incentive.isConditional
        ? formData.incentive.paymentStructure.conditional?.threshold ?? null
        : null,

    // Booking rules
    requireAdvanceBooking: formData.rules?.requireAdvanceBooking ?? false,
    minAdvanceHours: formData.rules?.requireAdvanceBooking
        ? formData.rules.minAdvanceHours ?? null
        : null,

    // Cancellation rules
    enableCancellationWindow: formData.rules?.enableCancellationWindow ?? false,
    cancellationCutoffHours: formData.rules?.enableCancellationWindow
        ? formData.rules.cancellationCutoffHours ?? null
        : null,
});
```

### Step 3: Update query invalidation

```typescript
// BEFORE
qc.invalidateQueries({ queryKey: orpc.services.list.key() });

// AFTER
qc.invalidateQueries({ queryKey: orpc.serviceCategories.list.key() });
```

**Acceptance criteria:**
- Submitting the form creates a `service_categories` row + `service_category_config` row
- Does NOT create a `services` row
- Does NOT write to `service_commission_config` or `service_rules`
- Toast shows success

---

## Task 3.3: Rewire service data-table import

**File (MODIFY):** `apps/web/src/components/tables/service/view/data-table.tsx`

Change:

```typescript
// BEFORE
import { ServiceCreateEditDialog } from "@/components/forms/service-create-edit-dialog";

// AFTER
import { ServiceFormDialog } from "@/components/forms/service-form";
```

Update the JSX to use `ServiceFormDialog` props.

**Acceptance criteria:**
- "Add Service" button opens the full form (14 fields including expirable, sessions, tax, time-preset config)
- Edit also opens full form with pre-populated data
- No TypeScript errors

---

## Task 3.4: Update packages/view.tsx to use services

**File (MODIFY):** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/view.tsx`

This page currently calls:
- `client.packages.list()`
- `client.packages.create()`
- `client.packages.update()`
- `client.packages.archive()`

Option A — **Redirect to services page**: Replace with a redirect or merge into the services view.

Option B — **Keep as a filtered services view**: Change all API calls to use the `services` router with a filter for services that have `sessionCount > 0` (i.e., package-type services):

```typescript
// BEFORE
client.packages.list({ organizationId, isArchived: isArchivedFilter })

// AFTER
client.services.list({ organizationId, isActive: !isArchivedFilter })
// Then filter client-side: .filter(s => s.sessionCount && s.sessionCount > 0)
```

For create/update, map the package form fields to service fields:

```typescript
// BEFORE
client.packages.create({
    organizationId,
    name, sessionCount, pricePerSession, maxClientsPerSession,
    appointmentType, expiryDays, branchId, ...
})

// AFTER
client.services.create({
    organizationId,
    name,
    sessionCount,
    price: pricePerSession,
    maxAttendees: maxClientsPerSession,
    type: appointmentType === "both" ? "private" : appointmentType,
    expiryDays,
    expirable: !!expiryDays || !!expiryDate,
    branchId,
    duration: 3600,  // default 1 hour, configurable
    durationUnitType: "minutes",
    isActive: true,
    schedulingType: "appointment",
    // ... other required fields
})
```

**Acceptance criteria:**
- Package list page shows services with session counts
- Create/edit package creates/updates a service with package fields
- Archive toggles `isActive` on the service

---

## Task 3.5: Update packages/instances/view.tsx

**File (MODIFY):** `apps/web/src/routes/_authenticated/dashboard/_layout/packages/instances/view.tsx`

Change:
- `client.packages.list()` → `client.services.list()` (for the package-name lookup dropdown)
- `client.packageInstances.create({ packageId: ... })` → `client.packageInstances.create({ serviceId: ... })`
- Any display of `packageId` → `serviceId`

**Acceptance criteria:**
- Instance creation uses `serviceId`
- Instance list still shows correct data
- Package name lookup uses services

---

## Task 3.6: Update cancelled-sales/view.tsx

**File (MODIFY):** `apps/web/src/routes/_authenticated/dashboard/_layout/cancelled-sales/view.tsx`

The router in Phase 2 (Task 2.6) already maps the response to the same shape, so this page may work without changes. However, verify and update types if needed:

```typescript
// If the page directly types against cancelledSales, update to use the mapped shape
type CancelledSaleApiItem = Awaited<ReturnType<typeof client.cancelledSales.list>>[number];
```

**Acceptance criteria:**
- Cancelled sales page loads and displays data
- Data comes from `sales_orders` (via the rewritten router)

---

## Task 3.7: Update native app package flow

**Owner: One developer for all native files to avoid conflicts.**

### File: `apps/native/app/(app)/dashboard/buy-package/setup.tsx`

```typescript
// BEFORE
orpc.packages.list.queryOptions({ input: { organizationId, ... } })

// AFTER
orpc.services.list.queryOptions({ input: { organizationId, isActive: true } })
// Filter client-side for services with sessionCount > 0
```

Map display fields:
- `pkg.sessionCount` → `service.sessionCount`
- `pkg.pricePerSession` → `service.price`
- `pkg.maxClientsPerSession` → `service.maxAttendees`
- `pkg.expiryDays` → `service.expiryDays`

### File: `apps/native/contexts/purchase-flow-context.tsx`

Rename `packageId` to `serviceId` in the state interface and default state:

```typescript
// BEFORE
packageId: string | null;
// ...
packageId: null,

// AFTER
serviceId: string | null;
// ...
serviceId: null,
```

Update all references in `setup.tsx` and `pay.tsx` that read/write `state.packageId`.

### File: `apps/native/app/(app)/dashboard/buy-package/pay.tsx`

```typescript
// BEFORE
client.packageInstances.create({ packageId: selectedPackage.id, ... })

// AFTER
client.packageInstances.create({ serviceId: selectedService.id, ... })
```

### File: `apps/native/app/(app)/dashboard/book-workout/book-workout.tsx`

Update `packageInstances.listForClient` result handling — the response shape is unchanged, but any reference to `packageId` in display logic should use `serviceId`.

### File: `apps/native/app/(app)/dashboard/packages/index.tsx`

Same as book-workout — update field references from `packageId` to `serviceId`.

### File: `apps/native/app/(app)/dashboard/index.tsx`

Update `packageInstances.getActiveForClient` field references.

**Acceptance criteria:**
- Native app package browse, purchase, and dashboard all work
- No references to `client.packages.*` remain
- All `packageId` display references updated to `serviceId`

---

## Task 3.8: Update test files

**File (MODIFY):** `apps/web/src/__tests__/routes/packages.test.tsx`

Update mock calls from `client.packages.list` to `client.services.list`. Update assertions for the new field names.

**File (MODIFY):** `apps/server/scripts/test-write-endpoints.ts`

Remove references to `serviceRules` and `serviceCommissionConfig` endpoints.

**File (MODIFY):** `apps/server/scripts/inspect-and-cleanup-test-data.ts`

Remove references to the dropped tables.

**Acceptance criteria:**
- `bun test` passes in both `apps/web` and `apps/server`
- No references to dropped routers in test/script files

---

## Phase 3 Completion Checklist

- [ ] Service category data-table uses real `ServiceFormDialog` (17 fields)
- [ ] Service category form submit creates category + config (not service + per-service config)
- [ ] Service data-table uses real `ServiceFormDialog` (14 fields)
- [ ] Packages page uses `services` router
- [ ] Package instances page uses `serviceId`
- [ ] Cancelled sales page works with rewritten router
- [ ] Native app package flow uses `services` router + `serviceId`
- [ ] All tests pass
- [ ] `bun check-types` passes across all apps
- [ ] No remaining references to `client.packages.*`, `client.serviceRules.*`, `client.serviceCommissionConfig.*`
