# Phase 2: Backend Consolidation

**Goal:** Create the new `serviceCategoryConfig` router, update `packageInstances` and `cancelledSales` routers to use new columns, update service layer.

**Dependencies:** Phase 1 complete (new columns exist in DB, data migrated).

**Safety:** Old routers (`packages`, `serviceRules`, `serviceCommissionConfig`) are kept alive during this phase. They will be removed in Phase 4 after frontend is updated.

---

## Task 2.1: Create `serviceCategoryConfig` API router

**File (CREATE):** `packages/api/src/routers/service-category-config.ts`

```typescript
/**
 * Service Category Config Router
 *
 * Upserts booking rules and commission config on service_category_config.
 * This is the single source of truth for category-level operational rules.
 */

import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";

export const serviceCategoryConfigRouter = {
    upsert: protectedProcedure
        .input(
            z.object({
                organizationId: z.string().uuid(),
                categoryId: z.string().uuid(),

                // Default values
                defaultDuration: z.number().int().nullable().optional(),
                defaultMaxAttendees: z.number().int().nullable().optional(),

                // Commission/incentive
                incentiveType: z.enum(["fixed", "variable"]).nullable().optional(),
                isConditional: z.boolean().optional(),
                maxStaff: z.number().int().min(1).optional(),
                staffPoolPercentage: z.number().int().min(0).max(100).optional(),
                staffWeightage: z.array(
                    z.object({
                        position: z.number().int(),
                        percentage: z.number(),
                        title: z.string().optional(),
                    })
                ).nullable().optional(),
                paymentStructures: z.record(z.string(), z.unknown()).nullable().optional(),
                threshold: z.number().int().nullable().optional(),

                // Booking rules
                requireAdvanceBooking: z.boolean().optional(),
                minAdvanceHours: z.number().int().nullable().optional(),

                // Cancellation rules
                enableCancellationWindow: z.boolean().optional(),
                cancellationCutoffHours: z.number().int().nullable().optional(),
            })
        )
        .handler(async ({ input, context }) => {
            if (!context.tenantDb) {
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Tenant database not available.",
                });
            }
            if (!context.member) {
                throw new ORPCError("FORBIDDEN", {
                    message: "User is not a member of this organization",
                });
            }

            // Permission check
            let hasPermission = false;
            for (const action of ["create", "update"] as const) {
                try {
                    await requirePermission(
                        context.tenantDb,
                        context.member,
                        "service_management",
                        action
                    );
                    hasPermission = true;
                    break;
                } catch { /* try next */ }
            }
            if (!hasPermission) {
                throw new ORPCError("FORBIDDEN", {
                    message: "Permission denied: requires service_management create or update",
                });
            }

            const values = {
                categoryId: input.categoryId,
                defaultDuration: input.defaultDuration ?? null,
                defaultMaxAttendees: input.defaultMaxAttendees ?? null,
                incentiveType: input.incentiveType ?? null,
                isConditional: input.isConditional ?? false,
                maxStaff: input.maxStaff ?? 1,
                staffPoolPercentage: input.staffPoolPercentage ?? 100,
                staffWeightage: input.staffWeightage ?? null,
                paymentStructures: input.paymentStructures ?? null,
                threshold: input.threshold ?? null,
                requireAdvanceBooking: input.requireAdvanceBooking ?? false,
                minAdvanceHours: input.minAdvanceHours ?? null,
                enableCancellationWindow: input.enableCancellationWindow ?? false,
                cancellationCutoffHours: input.cancellationCutoffHours ?? null,
                updatedAt: new Date(),
            };

            const [result] = await context.tenantDb
                .insert(serviceCategoryConfig)
                .values(values)
                .onConflictDoUpdate({
                    target: serviceCategoryConfig.categoryId,
                    set: { ...values },
                })
                .returning();

            return result;
        }),

    getByCategoryId: protectedProcedure
        .input(z.object({
            organizationId: z.string().uuid(),
            categoryId: z.string().uuid(),
        }))
        .handler(async ({ input, context }) => {
            if (!context.tenantDb) {
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Tenant database not available.",
                });
            }

            const { eq } = await import("drizzle-orm");
            return context.tenantDb.query.serviceCategoryConfig.findFirst({
                where: eq(serviceCategoryConfig.categoryId, input.categoryId),
            }) ?? null;
        }),
};
```

**Acceptance criteria:**
- Router compiles
- `POST /rpc/serviceCategoryConfig/upsert` creates/updates rows in `service_category_config`
- `POST /rpc/serviceCategoryConfig/getByCategoryId` returns the config

---

## Task 2.2: Register new router in index

**File (MODIFY):** `packages/api/src/routers/index.ts`

Add import:

```typescript
import { serviceCategoryConfigRouter } from "./service-category-config";
```

Add to `baseRouter`:

```typescript
serviceCategoryConfig: serviceCategoryConfigRouter,
```

**Do NOT remove the old routers yet.** They stay until Phase 4.

**Acceptance criteria:**
- `bun check-types` passes
- New router accessible via oRPC client

---

## Task 2.3: Update `packageInstances` router to support `serviceId`

**File (MODIFY):** `packages/api/src/routers/package-instances.ts`

In all input schemas that accept `packageId`, add `serviceId` as an alternative:

```typescript
// Accept either packageId (legacy) or serviceId (new)
packageId: z.string().uuid().optional(),
serviceId: z.string().uuid().optional(),
```

In handlers, resolve to the correct column:

```typescript
const targetServiceId = input.serviceId ?? input.packageId;
// Write to both columns during transition
```

For the `create` procedure specifically, populate both `packageId` and `serviceId` on the inserted row (the `packageId` can be null for new instances that only use `serviceId`).

**Acceptance criteria:**
- Existing calls with `packageId` still work
- New calls with `serviceId` also work
- Both columns populated on new instances

---

## Task 2.4: Update `packageInstances` service layer

**File (MODIFY):** `packages/services/src/package-instance.service.ts`

Update `CreatePackageInstanceParams`:

```typescript
export type CreatePackageInstanceParams = {
    packageId?: string;  // legacy, optional
    serviceId?: string;  // new, preferred
    // ... rest unchanged
    crossUsageEnabled?: boolean;
    autoGenerateInvoice?: boolean;
};
```

Update `createPackageInstance` to write to both columns:

```typescript
packageId: params.packageId ?? null,
serviceId: params.serviceId ?? params.packageId ?? null,
crossUsageEnabled: params.crossUsageEnabled ?? false,
autoGenerateInvoice: params.autoGenerateInvoice ?? false,
```

**Acceptance criteria:**
- Type-checks pass
- Existing callers with `packageId` unaffected
- New callers can use `serviceId`

---

## Task 2.5: Update `cancelSalesOrder` in service layer

**File (MODIFY):** `packages/services/src/sales-order.service.ts`

Rewrite `cancelSalesOrder` to write cancellation data to `sales_orders` directly instead of inserting into `cancelled_sales`:

```typescript
export async function cancelSalesOrder(
    tenantDb: NeonDatabase<typeof tenantSchema>,
    id: string,
    params: { cancelledBy: string; reason?: string; refundAmount: number }
): Promise<typeof salesOrders.$inferSelect> {
    const existing = await getSalesOrderById(tenantDb, id);
    if (!existing) {
        throw new Error("Sales order not found");
    }

    const now = new Date();
    const cancellationNumber = await generateCancellationNumber(tenantDb, now);

    const [updatedOrder] = await tenantDb
        .update(salesOrders)
        .set({
            status: "cancelled",
            cancellationNumber,
            cancellationDate: now,
            cancellationReason: params.reason ?? null,
            cancelledBy: params.cancelledBy,
            updatedAt: now,
        })
        .where(eq(salesOrders.id, id))
        .returning();

    if (!updatedOrder) {
        throw new Error("Failed to cancel sales order");
    }

    return updatedOrder;
}
```

**Note:** Also update `generateCancellationNumber` to query `sales_orders.cancellationNumber` instead of `cancelled_sales.cancellationNumber`.

Remove the `cancelledSales` import from this file.

**Return type change:** Previously returned `{ salesOrder, cancelledSale }`. Now returns just `salesOrder` (which contains all cancellation data).

**Callers that destructure `cancelledSale` and MUST be updated in this task:**

1. **`packages/api/src/routers/cancelled-sales.ts`** — the router handler that calls `cancelSalesOrder()` and returns the result. Update to use the flat `salesOrder` response.

2. **`apps/server/src/tests/unit/services/sales-order.test.ts`** — lines 272 and 278 destructure `result.cancelledSale`. Update assertions to check cancellation fields on `result` directly (or `result.salesOrder` depending on wrapper).

**Acceptance criteria:**
- Cancelling a sales order populates `cancellationNumber`, `cancellationDate`, `cancellationReason`, `cancelledBy` on the `sales_orders` row
- No inserts into `cancelled_sales`
- `generateCancellationNumber` queries `sales_orders` table
- All callers updated for new return type
- `sales-order.test.ts` passes with updated assertions

---

## Task 2.6: Update `cancelledSales` router to query `sales_orders`

**File (MODIFY):** `packages/api/src/routers/cancelled-sales.ts`

Rewrite the `list` procedure to query `sales_orders WHERE status = 'cancelled'` instead of the `cancelled_sales` table. Map the response to match the existing shape so the frontend doesn't break:

```typescript
// Map sales_orders fields to the expected cancelled-sales shape
return rows.map(row => ({
    id: row.id,
    cancellationNumber: row.cancellationNumber,
    salesOrderId: row.id,
    cancellationDate: row.cancellationDate,
    cancelledAmount: row.totalAmount,
    cancellationReason: row.cancellationReason,
    cancelledBy: row.cancelledBy,
    customerId: row.customerId,
    customerName: row.customerName,
    createdAt: row.createdAt,
}));
```

Similarly update the `getById` procedure.

**Acceptance criteria:**
- `client.cancelledSales.list()` returns same shape as before
- Data sourced from `sales_orders` not `cancelled_sales`
- Frontend cancelled-sales page works without changes (initially)

---

## Phase 2 Completion Checklist

- [ ] `serviceCategoryConfig` router created and registered
- [ ] `packageInstances` router accepts both `packageId` and `serviceId`
- [ ] `package-instance.service.ts` writes to both columns
- [ ] `cancelSalesOrder` writes to `sales_orders` directly
- [ ] `cancelledSales` router queries `sales_orders`
- [ ] `bun check-types` passes
- [ ] `bun test` passes (update unit tests as needed)
- [ ] Old routers (`packages`, `serviceRules`, `serviceCommissionConfig`) still present and functional
