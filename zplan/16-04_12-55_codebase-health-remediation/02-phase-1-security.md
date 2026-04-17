# Phase 1: Security Fixes

**Goal:** Close all exploitable API endpoints and fix race conditions that can corrupt data.

**User journeys delivered:** Journey 1 (credit point exploit blocked)

**Dependencies:** Phase 0 (service deduplication) — permission service must be canonical before modifying it.

---

## Tasks

### Task 1.1: Remove `creditPoints` from `customerProfiles.upsert` input

**Severity:** CRITICAL
**File:** `packages/api/src/routers/customer-profiles.ts:50`

**What to change:**
1. Remove `creditPoints: z.number().int().nonneg().optional()` from the upsert Zod input schema
2. Create a new admin-only procedure `adjustCreditPoints`:

```typescript
adjustCreditPoints: protectedProcedure
  .input(z.object({
    organizationId: z.string().uuid(),
    userId: z.string(),
    creditPoints: z.number().int().nonneg(),
  }))
  .handler(async ({ context, input }) => {
    requirePermission(context, "customer_management:update");
    // update customerProfiles set creditPoints = input.creditPoints
  })
```

**Test:** Call `customerProfiles.upsert` with `creditPoints: 99999` as a non-admin user — field should be silently ignored.

### Task 1.2: Fix spoofable `createdBy` / `cancelledBy` in salesOrders

**Severity:** HIGH
**File:** `packages/api/src/routers/sales-orders.ts:103`

**What to change:**
1. Remove `createdBy: z.string().min(1)` from the `create` Zod input
2. Remove `cancelledBy: z.string().optional()` from the `cancel` Zod input
3. In the handler, set from context:

```typescript
.handler(async ({ context, input }) => {
  await createSalesOrder(context.tenantDb, {
    ...input,
    createdBy: context.member.userId,  // server-set, not client-provided
  });
})
```

4. Same pattern for `cancelledBy` in the cancel handler

**Files to modify:**
- `packages/api/src/routers/sales-orders.ts`
- `packages/services/src/sales-order.service.ts` — verify `CreateSalesOrderParams` type matches

### Task 1.3: Fix sequence number race conditions (5 service files)

**Severity:** CRITICAL
**Files:**
- `packages/services/src/sales-order.service.ts:28-42`
- `packages/services/src/purchase-orders.service.ts:12-26`
- `packages/services/src/invoice.service.ts:32-46`
- `packages/services/src/stock-requests.service.ts:26-39`
- `packages/services/src/transfer-orders.service.ts:28-42`

**What to change:**

Create a shared utility in `packages/services/src/sequence.service.ts`:

```typescript
import { sql, type SQL } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export async function generateSequenceNumber(
  db: NeonDatabase<any>,
  table: any,
  numberColumn: any,
  prefix: string,
  padLength = 6,
  maxRetries = 3,
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const [result] = await db
      .select({ maxNum: sql<string | null>`MAX(${numberColumn})` })
      .from(table)
      .where(sql`${numberColumn} LIKE ${prefix + "%"}`);

    const lastNum = result?.maxNum
      ? parseInt(result.maxNum.replace(prefix, ""), 10)
      : 0;
    const next = `${prefix}${String(lastNum + 1).padStart(padLength, "0")}`;
    return next;
  }
  throw new Error(`Failed to generate sequence number after ${maxRetries} retries`);
}
```

Then update each of the 5 service files to use `generateSequenceNumber()` instead of inline COUNT queries.

**Safety net:** The existing unique constraints on sequence number columns (`salesOrderNumber`, `purchaseOrderNumber`, etc.) will cause an insert failure on collision. The caller should catch and retry or surface a user-friendly error.

**Export:** Add to `packages/services/src/index.ts`

### Task 1.4: Verify and test

- Unit test for `generateSequenceNumber` with mocked MAX values
- Manual test: verify credit points can't be set via API
- Manual test: verify salesOrders.create uses session user, not input

---

## Acceptance Criteria

- [ ] `creditPoints` NOT in `customerProfiles.upsert` Zod input
- [ ] New `adjustCreditPoints` admin-only procedure exists
- [ ] `createdBy` and `cancelledBy` NOT in `salesOrders` Zod inputs
- [ ] All 5 sequence generators use shared `generateSequenceNumber` utility
- [ ] `bun check-types` passes
- [ ] `cd apps/server && bun test` passes
