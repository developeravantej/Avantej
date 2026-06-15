# Plan A — SaaS Subscription Billing (Tenant → Avantej)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tenants can subscribe to an Avantej SaaS plan via Stripe Checkout, the server tracks subscription state via webhooks with idempotency, and the application gates write operations on subscription status with a 7-day past-due grace period.

**Architecture:** Stripe Billing on the Avantej platform Stripe account; Stripe Checkout for plan purchase; Customer Portal for self-serve plan management; split webhook endpoints (`/webhooks/stripe/platform`) with a `processed_webhook_events` dedupe table; oRPC `subscriptions` router; `requireActiveSaaSSub` middleware on protected procedures; web `/subscribe` page renders tiers and redirects to Checkout. Trial-first activation per ADR-0003 (org exists without a subscription during trial).

**Tech Stack:** Stripe Node SDK (`stripe@^19`), Stripe.js (`@stripe/stripe-js`), Drizzle ORM, Cloudflare Workers (Hono), oRPC, TanStack Router (web), Bun test runner.

**Scope check:** This plan covers Phase 0 (setup) + Phase 1 (SaaS sub). Phase 2 (Connect), Phase 3 (Customer payment), Phase 6-lite (audit), Phase 7 (hardening + reconciliation) are separate plans.

**ADRs in force:** 0001, 0002, 0003, 0004, 0006, 0009, 0010, 0012.

**Pre-requisites (operator, one-time, ~10 minutes):**
1. Create Avantej Stripe account at https://stripe.com (email + password).
2. Account picker → Switch to sandbox → Create sandbox → name `dev-shared`.
3. Inside `dev-shared`: Settings → Developers → API keys → copy publishable + secret keys.
4. (Phase 1 webhook step) Run `stripe listen` (instructions in Task 10) and copy the printed `whsec_…`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `packages/types/src/tiers.ts` | Single source of truth for tier limits, feature flags, app-fee bps | Create |
| `packages/types/src/index.ts` | Re-export tiers | Modify |
| `packages/db/src/schema/control-panel/subscriptions.ts` | Add `pastDueAt`, `gracePeriodEndsAt`, `applicationFeeBps`, `currency`, `trialEndsAt`, `priceId` | Modify |
| `packages/db/src/schema/control-panel/organizations.ts` | Make `subscriptionId` nullable; add `trialEndsAt`, `chargesEnabled`, `payoutsEnabled`, `detailsSubmitted`, `connectAccountUpdatedAt` | Modify |
| `packages/db/src/schema/control-panel/processed-webhook-events.ts` | Webhook dedupe table | Create |
| `packages/db/src/schema/control-panel/platform-payment-ledger.ts` | Audit ledger mirror (table only in Plan A; writes deferred to Plan D) | Create |
| `packages/db/src/schema/control-panel-schema.ts` | Re-export new tables | Modify |
| `packages/db/drizzle.config.ts` | Confirm migrations dir | Read-only |
| `apps/server/src/lib/stripe.ts` | Add `getStripeClient()` export + dual-secret webhook verification | Modify |
| `apps/server/src/services/saas-subscription.service.ts` | Pure logic: handle subscription lifecycle webhooks | Create |
| `apps/server/src/services/webhook-dedupe.service.ts` | Insert-or-skip into `processed_webhook_events` | Create |
| `apps/server/src/middleware/require-active-saas-sub.middleware.ts` | oRPC middleware enforcing sub state machine | Create |
| `apps/server/src/routes/webhooks.routes.ts` | Split into `/stripe/platform` + `/stripe/connect`, idempotent | Modify |
| `apps/server/src/routers/subscriptions.ts` | oRPC procedures: `createCheckoutSession`, `getStatus`, `billingPortal` | Create |
| `apps/server/src/index.ts` | Wire `subscriptions` router; webhook route is already mounted via `webhookRoutes` | Modify |
| `apps/server/scripts/stripe-seed-saas-products.ts` | Idempotent Products+Prices seed for sandboxes | Create |
| `apps/server/scripts/stripe-listen.sh` | Wrapper script for `stripe listen` w/ event filter | Create |
| `apps/server/Makefile` | `make stripe-listen` target | Create |
| `apps/server/.env.example` | Document required Stripe vars | Modify |
| `apps/web/src/lib/stripe.ts` | Real `loadStripe` instead of stub | Modify |
| `apps/web/src/routes/subscribe.tsx` | Wire to real oRPC `subscriptions.createCheckoutSession` | Modify |
| `apps/web/.env.example` | Document `VITE_STRIPE_PUBLISHABLE_KEY` | Modify |

Three new schema files keep payment-related tables co-located. Service modules are split by concern (subscription lifecycle vs. webhook dedupe) so each is independently testable.

---

## Task 1: Tier configuration module

**Files:**
- Create: `packages/types/src/tiers.ts`
- Modify: `packages/types/src/index.ts`
- Test: `packages/types/src/tiers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/types/src/tiers.test.ts
import { describe, it, expect } from "bun:test";
import { TIER_LIMITS, type Tier, getTierLimits, isFeatureEnabled } from "./tiers";

describe("TIER_LIMITS", () => {
  it("defines three tiers: basic, professional, enterprise", () => {
    expect(Object.keys(TIER_LIMITS).sort()).toEqual([
      "basic",
      "enterprise",
      "professional",
    ]);
  });

  it("enterprise has the lowest application fee bps", () => {
    expect(TIER_LIMITS.enterprise.appFeeBps).toBeLessThan(
      TIER_LIMITS.professional.appFeeBps,
    );
    expect(TIER_LIMITS.professional.appFeeBps).toBeLessThan(
      TIER_LIMITS.basic.appFeeBps,
    );
  });

  it("enterprise unlocks all v2 features", () => {
    expect(TIER_LIMITS.enterprise.features.memberships).toBe(true);
    expect(TIER_LIMITS.enterprise.features.commissionSplits).toBe(true);
    expect(TIER_LIMITS.enterprise.features.ghl).toBe(true);
  });

  it("basic disables tiered features", () => {
    expect(TIER_LIMITS.basic.features.ghl).toBe(false);
    expect(TIER_LIMITS.basic.features.memberships).toBe(false);
  });
});

describe("getTierLimits", () => {
  it("returns limits for a known tier", () => {
    expect(getTierLimits("basic").organizations).toBe(1);
  });

  it("falls back to basic for an unknown tier string", () => {
    expect(getTierLimits("unknown" as Tier).organizations).toBe(
      TIER_LIMITS.basic.organizations,
    );
  });
});

describe("isFeatureEnabled", () => {
  it("returns true when enabled on tier", () => {
    expect(isFeatureEnabled("professional", "memberships")).toBe(true);
  });
  it("returns false when disabled on tier", () => {
    expect(isFeatureEnabled("basic", "memberships")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/types && bun test src/tiers.test.ts`
Expected: FAIL with "Cannot find module './tiers'".

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/types/src/tiers.ts
export const TIER_LIMITS = {
  basic: {
    organizations: 1,
    locations: 1,
    members: 25,
    customers: 100,
    monthlyTxns: 100,
    appFeeBps: 300, // 3%
    features: {
      ghl: false,
      googleCalendar: true,
      commissionSplits: false,
      memberships: false,
      apiAccess: false,
    },
    analyticsLevel: "basic" as const,
    auditLogDays: 30,
  },
  professional: {
    organizations: 5,
    locations: 10,
    members: 100,
    customers: 1000,
    monthlyTxns: 1000,
    appFeeBps: 200, // 2%
    features: {
      ghl: true,
      googleCalendar: true,
      commissionSplits: true,
      memberships: true,
      apiAccess: true,
    },
    analyticsLevel: "advanced" as const,
    auditLogDays: 365,
  },
  enterprise: {
    organizations: Number.MAX_SAFE_INTEGER,
    locations: Number.MAX_SAFE_INTEGER,
    members: Number.MAX_SAFE_INTEGER,
    customers: Number.MAX_SAFE_INTEGER,
    monthlyTxns: Number.MAX_SAFE_INTEGER,
    appFeeBps: 150, // 1.5%
    features: {
      ghl: true,
      googleCalendar: true,
      commissionSplits: true,
      memberships: true,
      apiAccess: true,
    },
    analyticsLevel: "advanced" as const,
    auditLogDays: 365 * 7,
  },
} as const;

export type Tier = keyof typeof TIER_LIMITS;
export type TierLimits = (typeof TIER_LIMITS)[Tier];
export type TierFeature = keyof TierLimits["features"];

export function getTierLimits(tier: string): TierLimits {
  if (tier in TIER_LIMITS) return TIER_LIMITS[tier as Tier];
  return TIER_LIMITS.basic;
}

export function isFeatureEnabled(tier: Tier, feature: TierFeature): boolean {
  return TIER_LIMITS[tier].features[feature];
}
```

- [ ] **Step 4: Re-export from package index**

Read `packages/types/src/index.ts` first; append:

```ts
export * from "./tiers";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/types && bun test src/tiers.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/tiers.ts packages/types/src/tiers.test.ts packages/types/src/index.ts
git commit -m "feat(types): add SaaS tier configuration (limits, features, app-fee)

Per ADR-0010. Single source of truth for tier-based gating and pricing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schema migration — extend `subscriptions` table

**Files:**
- Modify: `packages/db/src/schema/control-panel/subscriptions.ts`
- Create migration: handled by `bun db:generate` (Drizzle Kit) — output in `packages/db/migrations/` (or per existing convention)

- [ ] **Step 1: Read current schema and confirm column names**

Read `packages/db/src/schema/control-panel/subscriptions.ts`. Note existing columns: `id`, `stripeSubscriptionId`, `stripeCustomerId`, `tier`, `organizationCountLimit`, `status`, `createdAt`, `updatedAt`.

- [ ] **Step 2: Modify schema file**

Replace the schema definition with:

```ts
// packages/db/src/schema/control-panel/subscriptions.ts
/**
 * Control Panel Subscriptions Schema
 *
 * Tracks Stripe Billing subscriptions held by Tenants for SaaS access.
 * One subscription belongs to one Tenant (organization) at a time; multi-org
 * tiers permit multiple organizations per subscription via `organizationCountLimit`.
 *
 * State columns are synced from Stripe via webhooks; see ADR-0006, ADR-0009.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePriceId: text("stripe_price_id").notNull(),
    tier: text("tier").notNull(), // basic | professional | enterprise
    organizationCountLimit: integer("organization_count_limit").notNull(),
    applicationFeeBps: integer("application_fee_bps").notNull(), // basis points
    currency: text("currency").notNull().default("usd"),
    status: text("status").notNull(),
    // Past-due tracking (ADR-0009)
    pastDueAt: timestamp("past_due_at"),
    gracePeriodEndsAt: timestamp("grace_period_ends_at"),
    // Trial tracking (ADR-0003)
    trialEndsAt: timestamp("trial_ends_at"),
    // Period tracking from Stripe
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: text("cancel_at_period_end").default("false").notNull(),
    canceledAt: timestamp("canceled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    stripeCustomerIdIdx: index("subscriptions_customer_idx").on(
      table.stripeCustomerId,
    ),
    statusIdx: index("subscriptions_status_idx").on(table.status),
  }),
);
```

- [ ] **Step 3: Generate migration**

Run: `bun db:generate`
Expected output: A new SQL migration file emitted into the migrations dir (e.g. `packages/db/migrations/NNNN_subscriptions_extended.sql`). Open and verify it adds the new columns; if Drizzle Kit generates anything beyond column adds (e.g. column drops), abort and re-inspect.

- [ ] **Step 4: Apply migration locally**

Run: `bun db:push`
Expected: Migration succeeds against the local control-panel DB.

- [ ] **Step 5: Manually verify columns**

Run: `bun db:studio` and confirm the new columns exist on `subscriptions`. Close studio.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/control-panel/subscriptions.ts packages/db/migrations/
git commit -m "feat(db): extend subscriptions table with price/billing/grace columns

Adds stripePriceId, applicationFeeBps, currency, pastDueAt, gracePeriodEndsAt,
trialEndsAt, currentPeriodStart/End, cancelAtPeriodEnd, canceledAt.

Per ADR-0002, ADR-0009.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Schema migration — make `organizations.subscriptionId` nullable + add trial column

**Files:**
- Modify: `packages/db/src/schema/control-panel/organizations.ts`

- [ ] **Step 1: Modify schema file**

Edit `subscriptionId` and add `trialEndsAt`. Find:

```ts
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id, { onDelete: "restrict" }),
```

Replace with:

```ts
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
    onDelete: "set null",
  }), // Nullable: org exists during trial without a sub. ADR-0003.
  trialEndsAt: timestamp("trial_ends_at"),
```

Also add (place after `stripeConnectOnboardingCompletedAt`):

```ts
  chargesEnabled: boolean("charges_enabled").default(false).notNull(),
  payoutsEnabled: boolean("payouts_enabled").default(false).notNull(),
  detailsSubmitted: boolean("details_submitted").default(false).notNull(),
  connectAccountUpdatedAt: timestamp("connect_account_updated_at"),
```

Ensure `boolean` is imported from `drizzle-orm/pg-core`. Add to import line at top:

```ts
import { pgTable, uuid, text, timestamp, index, jsonb, boolean } from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Generate migration**

Run: `bun db:generate`
Expected: A migration that (a) drops the NOT NULL on `subscription_id`, (b) changes ON DELETE to SET NULL, (c) adds `trial_ends_at`, (d) adds the four Connect-state columns.

If Drizzle Kit prompts about data preservation, ensure no existing data is lost (this is dev DB; OK to confirm).

- [ ] **Step 3: Apply migration**

Run: `bun db:push`
Expected: Migration succeeds.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/control-panel/organizations.ts packages/db/migrations/
git commit -m "feat(db): organizations.subscriptionId nullable; add trial + connect state

Per ADR-0003 (trial-first) and ADR-0008 (Connect account state synced from
account.updated webhook).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Schema migration — `processed_webhook_events` dedupe table

**Files:**
- Create: `packages/db/src/schema/control-panel/processed-webhook-events.ts`
- Modify: `packages/db/src/schema/control-panel-schema.ts`

- [ ] **Step 1: Create schema file**

```ts
// packages/db/src/schema/control-panel/processed-webhook-events.ts
/**
 * Control Panel Processed Webhook Events
 *
 * Idempotency dedupe table for Stripe webhooks. See ADR-0006.
 *
 * eventId is the Stripe-issued globally unique event identifier (evt_xxx).
 * processed_at is null while a handler is in flight or after a failure;
 * set on successful handler completion.
 */

import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const processedWebhookEvents = pgTable(
  "processed_webhook_events",
  {
    eventId: text("event_id").primaryKey(), // evt_xxx
    eventType: text("event_type").notNull(),
    source: text("source").notNull(), // 'platform' | 'connect' | 'reconciler'
    stripeAccount: text("stripe_account"), // acct_xxx for connect events
    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    attempts: integer("attempts").default(1).notNull(),
    error: text("error"),
  },
  (table) => ({
    eventTypeIdx: index("processed_webhook_events_type_idx").on(table.eventType),
    sourceIdx: index("processed_webhook_events_source_idx").on(table.source),
    receivedAtIdx: index("processed_webhook_events_received_idx").on(
      table.receivedAt,
    ),
  }),
);
```

- [ ] **Step 2: Re-export from schema barrel**

Read `packages/db/src/schema/control-panel-schema.ts` and add export at the bottom:

```ts
export * from "./control-panel/processed-webhook-events";
```

- [ ] **Step 3: Generate + apply migration**

Run: `bun db:generate && bun db:push`
Expected: Migration creates `processed_webhook_events` table.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/control-panel/processed-webhook-events.ts packages/db/src/schema/control-panel-schema.ts packages/db/migrations/
git commit -m "feat(db): add processed_webhook_events table for idempotency

Per ADR-0006. Primary dedupe key for Stripe webhook handling.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Schema migration — `platform_payment_ledger` audit mirror (table only)

**Files:**
- Create: `packages/db/src/schema/control-panel/platform-payment-ledger.ts`
- Modify: `packages/db/src/schema/control-panel-schema.ts`

The table is created in Plan A but actively written-to in Plan D. Creating now avoids a future migration when Plan D ships.

- [ ] **Step 1: Create schema file**

```ts
// packages/db/src/schema/control-panel/platform-payment-ledger.ts
/**
 * Platform Payment Ledger (control-panel)
 *
 * Cross-tenant audit mirror of payment events. Written by webhook handlers
 * (Plan D Phase 6-lite). Source of truth remains Stripe; this is for in-app
 * admin audit and revenue reporting.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const platformPaymentLedger = pgTable(
  "platform_payment_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"), // null for platform-level events
    eventKind: text("event_kind").notNull(), // 'saas_invoice_paid' | 'pi_succeeded' | 'pi_refunded' | etc
    stripeEventId: text("stripe_event_id").notNull().unique(), // evt_xxx
    stripeObjectId: text("stripe_object_id").notNull(), // pi_xxx, sub_xxx, in_xxx, etc
    stripeAccount: text("stripe_account"), // acct_xxx, null for platform
    amount: integer("amount").notNull(), // minor units
    applicationFee: integer("application_fee").default(0).notNull(), // minor units
    currency: text("currency").notNull().default("usd"),
    occurredAt: timestamp("occurred_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("ledger_org_idx").on(table.organizationId),
    eventKindIdx: index("ledger_event_kind_idx").on(table.eventKind),
    occurredAtIdx: index("ledger_occurred_idx").on(table.occurredAt),
  }),
);
```

- [ ] **Step 2: Re-export**

Append to `packages/db/src/schema/control-panel-schema.ts`:

```ts
export * from "./control-panel/platform-payment-ledger";
```

- [ ] **Step 3: Generate + apply**

Run: `bun db:generate && bun db:push`
Expected: Migration creates `platform_payment_ledger`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/control-panel/platform-payment-ledger.ts packages/db/src/schema/control-panel-schema.ts packages/db/migrations/
git commit -m "feat(db): add platform_payment_ledger for cross-tenant audit mirror

Per ADR-0011. Table only; writes land in Plan D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Refactor `apps/server/src/lib/stripe.ts` — dual-secret webhook verification + client export

**Files:**
- Modify: `apps/server/src/lib/stripe.ts`
- Test: `apps/server/src/lib/stripe.test.ts`
- Modify: `apps/server/.env.example`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/lib/stripe.test.ts
import { describe, it, expect } from "bun:test";
import { verifyWebhookSignature, getStripeClient } from "./stripe";
import Stripe from "stripe";

const FAKE_PLATFORM_SECRET = "whsec_platform_test";
const FAKE_CONNECT_SECRET = "whsec_connect_test";

function signPayload(secret: string, payload: string): string {
  const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-10-29.clover" });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return header;
}

describe("verifyWebhookSignature", () => {
  it("verifies platform webhook with platform secret", () => {
    // Set env (in Workers tests this might need shim)
    (globalThis as any).env = {
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_PLATFORM_WEBHOOK_SECRET: FAKE_PLATFORM_SECRET,
    };
    const payload = JSON.stringify({ id: "evt_test", type: "ping" });
    const sig = signPayload(FAKE_PLATFORM_SECRET, payload);
    const ev = verifyWebhookSignature(payload, sig, "platform");
    expect(ev.id).toBe("evt_test");
  });

  it("rejects platform webhook signed with connect secret", () => {
    (globalThis as any).env = {
      STRIPE_SECRET_KEY: "sk_test_dummy",
      STRIPE_PLATFORM_WEBHOOK_SECRET: FAKE_PLATFORM_SECRET,
    };
    const payload = JSON.stringify({ id: "evt_test", type: "ping" });
    const sig = signPayload(FAKE_CONNECT_SECRET, payload);
    expect(() => verifyWebhookSignature(payload, sig, "platform")).toThrow();
  });
});

describe("getStripeClient", () => {
  it("returns a Stripe instance", () => {
    (globalThis as any).env = { STRIPE_SECRET_KEY: "sk_test_dummy" };
    const client = getStripeClient();
    expect(client).toBeInstanceOf(Stripe);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (function signature mismatch)**

Run: `cd apps/server && bun test src/lib/stripe.test.ts`
Expected: FAIL — either "getStripeClient is not exported" or signature shape error.

- [ ] **Step 3: Implement refactor**

Replace `apps/server/src/lib/stripe.ts`:

```ts
/**
 * Stripe SDK wrapper.
 *
 * Exports:
 * - getStripeClient(): shared Stripe client (lazy-init).
 * - verifyWebhookSignature(body, signature, source): verifies a webhook against
 *   the correct secret. source is 'platform' or 'connect' per ADR-0006.
 *
 * Env vars:
 * - STRIPE_SECRET_KEY                        (Avantej platform secret, sk_test_… in sandbox)
 * - STRIPE_PLATFORM_WEBHOOK_SECRET           (whsec_… for /webhooks/stripe/platform)
 * - STRIPE_CONNECT_WEBHOOK_SECRET            (whsec_… for /webhooks/stripe/connect)
 */

import Stripe from "stripe";
import { env } from "cloudflare:workers";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = (env as any).STRIPE_SECRET_KEY;
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
    stripeClient = new Stripe(secretKey, { apiVersion: "2025-10-29.clover" });
  }
  return stripeClient;
}

export type WebhookSource = "platform" | "connect";

export function verifyWebhookSignature(
  body: string,
  signature: string | null,
  source: WebhookSource,
): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");

  const secret =
    source === "platform"
      ? (env as any).STRIPE_PLATFORM_WEBHOOK_SECRET
      : (env as any).STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error(
      source === "platform"
        ? "STRIPE_PLATFORM_WEBHOOK_SECRET is not set"
        : "STRIPE_CONNECT_WEBHOOK_SECRET is not set",
    );
  }

  const stripe = getStripeClient();
  try {
    return stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
      throw new Error(`Invalid webhook signature: ${error.message}`);
    }
    throw new Error(
      `Webhook signature verification failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `cd apps/server && bun test src/lib/stripe.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Update `.env.example`**

Read `apps/server/.env.example` and append:

```
# Stripe (Avantej platform account, dev-shared sandbox)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PLATFORM_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/stripe.ts apps/server/src/lib/stripe.test.ts apps/server/.env.example
git commit -m "refactor(stripe): split webhook secret by source + export getStripeClient

Per ADR-0006 split endpoints; each has its own signing secret.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Webhook dedupe service

**Files:**
- Create: `apps/server/src/services/webhook-dedupe.service.ts`
- Test: `apps/server/src/services/webhook-dedupe.service.test.ts`

- [ ] **Step 1: Write the failing test (integration — needs control-panel DB)**

```ts
// apps/server/src/services/webhook-dedupe.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { claimWebhookEvent, markEventProcessed, markEventFailed } from "./webhook-dedupe.service";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { eq } from "drizzle-orm";

const TEST_EVENT_ID = "evt_test_dedupe_001";

beforeEach(async () => {
  await controlPanelDb()
    .delete(processedWebhookEvents)
    .where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
});

describe("claimWebhookEvent", () => {
  it("returns 'claimed' on first call", async () => {
    const result = await claimWebhookEvent({
      eventId: TEST_EVENT_ID,
      eventType: "invoice.paid",
      source: "platform",
      stripeAccount: null,
    });
    expect(result.status).toBe("claimed");
  });

  it("returns 'already_processed' on retry after success", async () => {
    await claimWebhookEvent({
      eventId: TEST_EVENT_ID,
      eventType: "invoice.paid",
      source: "platform",
      stripeAccount: null,
    });
    await markEventProcessed(TEST_EVENT_ID);
    const result = await claimWebhookEvent({
      eventId: TEST_EVENT_ID,
      eventType: "invoice.paid",
      source: "platform",
      stripeAccount: null,
    });
    expect(result.status).toBe("already_processed");
  });

  it("returns 'retry' on retry after failure (attempts increments)", async () => {
    await claimWebhookEvent({
      eventId: TEST_EVENT_ID,
      eventType: "invoice.paid",
      source: "platform",
      stripeAccount: null,
    });
    await markEventFailed(TEST_EVENT_ID, "boom");
    const result = await claimWebhookEvent({
      eventId: TEST_EVENT_ID,
      eventType: "invoice.paid",
      source: "platform",
      stripeAccount: null,
    });
    expect(result.status).toBe("retry");
    expect(result.attempts).toBe(2);
  });
});
```

This is an integration test — it hits the control-panel DB. Name accordingly so it isn't run in the unit suite.

Rename file to: `webhook-dedupe.service.integration.test.ts`.

- [ ] **Step 2: Run test — expect FAIL (functions don't exist)**

Run: `cd apps/server && bun test src/services/webhook-dedupe.service.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement service**

```ts
// apps/server/src/services/webhook-dedupe.service.ts
/**
 * Webhook deduplication.
 *
 * Insert-or-skip into processed_webhook_events. On conflict, the existing row
 * is updated to increment attempts; processed_at is read to decide whether to
 * skip downstream handler invocation. See ADR-0006.
 */

import { eq, sql } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";

type Source = "platform" | "connect" | "reconciler";

export type ClaimResult =
  | { status: "claimed"; attempts: number }
  | { status: "already_processed"; attempts: number }
  | { status: "retry"; attempts: number };

export async function claimWebhookEvent(input: {
  eventId: string;
  eventType: string;
  source: Source;
  stripeAccount: string | null;
}): Promise<ClaimResult> {
  const db = controlPanelDb();
  const [row] = await db
    .insert(processedWebhookEvents)
    .values({
      eventId: input.eventId,
      eventType: input.eventType,
      source: input.source,
      stripeAccount: input.stripeAccount,
    })
    .onConflictDoUpdate({
      target: processedWebhookEvents.eventId,
      set: { attempts: sql`${processedWebhookEvents.attempts} + 1` },
    })
    .returning({
      attempts: processedWebhookEvents.attempts,
      processedAt: processedWebhookEvents.processedAt,
    });

  if (!row) throw new Error("Insert returned no row");
  if (row.processedAt) return { status: "already_processed", attempts: row.attempts };
  if (row.attempts > 1) return { status: "retry", attempts: row.attempts };
  return { status: "claimed", attempts: row.attempts };
}

export async function markEventProcessed(eventId: string): Promise<void> {
  await controlPanelDb()
    .update(processedWebhookEvents)
    .set({ processedAt: new Date(), error: null })
    .where(eq(processedWebhookEvents.eventId, eventId));
}

export async function markEventFailed(eventId: string, error: string): Promise<void> {
  await controlPanelDb()
    .update(processedWebhookEvents)
    .set({ error })
    .where(eq(processedWebhookEvents.eventId, eventId));
}
```

Note: `controlPanelDb()` is the existing helper from `@/lib/db`. If it requires a Hono context argument (`getControlPanelDb(c)`), adapt accordingly. Verify by reading `apps/server/src/lib/db.ts` before implementing; if the helper is request-scoped, the service should accept a `db` parameter passed in by the caller.

- [ ] **Step 4: Run test — expect PASS**

Run: `cd apps/server && bun test src/services/webhook-dedupe.service.integration.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/webhook-dedupe.service.ts apps/server/src/services/webhook-dedupe.service.integration.test.ts
git commit -m "feat(server): webhook dedupe service with claim/mark-processed/mark-failed

Per ADR-0006. Primary idempotency layer for all Stripe webhook handlers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: SaaS subscription lifecycle service

**Files:**
- Create: `apps/server/src/services/saas-subscription.service.ts`
- Test: `apps/server/src/services/saas-subscription.service.test.ts`

This service is pure-function input-to-DB-effect; it accepts a `Stripe.Subscription` (or `Stripe.Invoice`) and reconciles the local `subscriptions` row. Used by both webhook handlers and the reconciler (Plan D).

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/services/saas-subscription.service.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import {
  upsertSubscriptionFromStripe,
  markPastDue,
  markActive,
  computeTierFromPriceId,
} from "./saas-subscription.service";
import { controlPanelDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { eq } from "drizzle-orm";

const TEST_SUB_ID = "sub_test_lifecycle_001";

beforeEach(async () => {
  await controlPanelDb()
    .delete(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
});

describe("computeTierFromPriceId", () => {
  it("maps configured price IDs to tier names", () => {
    // We expect env-based mapping: STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_PRICE_ENT.
    (globalThis as any).env = {
      STRIPE_PRICE_BASIC: "price_basic",
      STRIPE_PRICE_PROFESSIONAL: "price_pro",
      STRIPE_PRICE_ENTERPRISE: "price_ent",
    };
    expect(computeTierFromPriceId("price_basic")).toBe("basic");
    expect(computeTierFromPriceId("price_pro")).toBe("professional");
    expect(computeTierFromPriceId("price_ent")).toBe("enterprise");
  });

  it("falls back to basic for unknown price id", () => {
    (globalThis as any).env = {
      STRIPE_PRICE_BASIC: "price_basic",
      STRIPE_PRICE_PROFESSIONAL: "price_pro",
      STRIPE_PRICE_ENTERPRISE: "price_ent",
    };
    expect(computeTierFromPriceId("price_unknown")).toBe("basic");
  });
});

describe("upsertSubscriptionFromStripe", () => {
  it("inserts a new row when the subscription does not exist", async () => {
    (globalThis as any).env = {
      STRIPE_PRICE_PROFESSIONAL: "price_pro",
    };
    const fakeSub = {
      id: TEST_SUB_ID,
      customer: "cus_test",
      status: "active",
      items: { data: [{ price: { id: "price_pro", currency: "usd" } }] },
      current_period_start: 1715000000,
      current_period_end: 1717678400,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
    } as any;
    await upsertSubscriptionFromStripe(fakeSub);
    const [row] = await controlPanelDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
    expect(row.tier).toBe("professional");
    expect(row.applicationFeeBps).toBe(200);
    expect(row.status).toBe("active");
  });

  it("is idempotent (second upsert reuses the row)", async () => {
    (globalThis as any).env = { STRIPE_PRICE_BASIC: "price_basic" };
    const fakeSub = {
      id: TEST_SUB_ID,
      customer: "cus_test",
      status: "active",
      items: { data: [{ price: { id: "price_basic", currency: "usd" } }] },
      current_period_start: 1715000000,
      current_period_end: 1717678400,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
    } as any;
    await upsertSubscriptionFromStripe(fakeSub);
    await upsertSubscriptionFromStripe(fakeSub);
    const rows = await controlPanelDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
    expect(rows.length).toBe(1);
  });
});

describe("markPastDue / markActive", () => {
  it("sets pastDueAt + gracePeriodEndsAt on past_due", async () => {
    (globalThis as any).env = { STRIPE_PRICE_BASIC: "price_basic" };
    const fakeSub = {
      id: TEST_SUB_ID,
      customer: "cus_test",
      status: "active",
      items: { data: [{ price: { id: "price_basic", currency: "usd" } }] },
      current_period_start: 1715000000,
      current_period_end: 1717678400,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
    } as any;
    await upsertSubscriptionFromStripe(fakeSub);
    await markPastDue(TEST_SUB_ID);
    const [row] = await controlPanelDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
    expect(row.status).toBe("past_due");
    expect(row.pastDueAt).not.toBeNull();
    expect(row.gracePeriodEndsAt).not.toBeNull();
    const diff = row.gracePeriodEndsAt!.getTime() - row.pastDueAt!.getTime();
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("clears pastDueAt on markActive", async () => {
    (globalThis as any).env = { STRIPE_PRICE_BASIC: "price_basic" };
    const fakeSub = {
      id: TEST_SUB_ID,
      customer: "cus_test",
      status: "active",
      items: { data: [{ price: { id: "price_basic", currency: "usd" } }] },
      current_period_start: 1715000000,
      current_period_end: 1717678400,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_end: null,
    } as any;
    await upsertSubscriptionFromStripe(fakeSub);
    await markPastDue(TEST_SUB_ID);
    await markActive(TEST_SUB_ID);
    const [row] = await controlPanelDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
    expect(row.status).toBe("active");
    expect(row.pastDueAt).toBeNull();
    expect(row.gracePeriodEndsAt).toBeNull();
  });
});
```

Rename to `saas-subscription.service.integration.test.ts`.

- [ ] **Step 2: Run test — FAIL (module not found)**

Run: `cd apps/server && bun test src/services/saas-subscription.service.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement service**

```ts
// apps/server/src/services/saas-subscription.service.ts
/**
 * SaaS Subscription lifecycle (control-panel side).
 *
 * Reconciles the local `subscriptions` row with Stripe Subscription state.
 * Called from webhook handlers and reconciler (Plan D). Pure of HTTP/Hono;
 * tests run as integration tests against the control-panel DB.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { controlPanelDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export function computeTierFromPriceId(priceId: string): Tier {
  const map: Record<string, Tier> = {
    [(env as any).STRIPE_PRICE_BASIC]: "basic",
    [(env as any).STRIPE_PRICE_PROFESSIONAL]: "professional",
    [(env as any).STRIPE_PRICE_ENTERPRISE]: "enterprise",
  };
  return map[priceId] ?? "basic";
}

function unixToDate(ts: number | null | undefined): Date | null {
  return ts ? new Date(ts * 1000) : null;
}

export async function upsertSubscriptionFromStripe(
  sub: Stripe.Subscription,
): Promise<void> {
  const priceId = sub.items.data[0]?.price.id;
  if (!priceId) throw new Error(`Subscription ${sub.id} has no price item`);
  const tier = computeTierFromPriceId(priceId);
  const limits = TIER_LIMITS[tier];
  const currency = (sub.items.data[0]?.price.currency ?? "usd").toLowerCase();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  await controlPanelDb()
    .insert(subscriptions)
    .values({
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      tier,
      organizationCountLimit: Number.isFinite(limits.organizations)
        ? limits.organizations
        : 2_147_483_647, // cap at int32 max for column type
      applicationFeeBps: limits.appFeeBps,
      currency,
      status: sub.status,
      currentPeriodStart: unixToDate(sub.current_period_start),
      currentPeriodEnd: unixToDate(sub.current_period_end),
      trialEndsAt: unixToDate(sub.trial_end),
      cancelAtPeriodEnd: String(sub.cancel_at_period_end ?? false),
      canceledAt: unixToDate(sub.canceled_at),
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        stripePriceId: priceId,
        tier,
        organizationCountLimit: Number.isFinite(limits.organizations)
          ? limits.organizations
          : 2_147_483_647,
        applicationFeeBps: limits.appFeeBps,
        currency,
        status: sub.status,
        currentPeriodStart: unixToDate(sub.current_period_start),
        currentPeriodEnd: unixToDate(sub.current_period_end),
        trialEndsAt: unixToDate(sub.trial_end),
        cancelAtPeriodEnd: String(sub.cancel_at_period_end ?? false),
        canceledAt: unixToDate(sub.canceled_at),
        updatedAt: new Date(),
      },
    });
}

export async function markPastDue(stripeSubscriptionId: string): Promise<void> {
  const now = new Date();
  await controlPanelDb()
    .update(subscriptions)
    .set({
      status: "past_due",
      pastDueAt: now,
      gracePeriodEndsAt: new Date(now.getTime() + GRACE_PERIOD_MS),
      updatedAt: now,
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

export async function markActive(stripeSubscriptionId: string): Promise<void> {
  await controlPanelDb()
    .update(subscriptions)
    .set({
      status: "active",
      pastDueAt: null,
      gracePeriodEndsAt: null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}
```

- [ ] **Step 4: Run test — PASS**

Run: `cd apps/server && bun test src/services/saas-subscription.service.integration.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/services/saas-subscription.service.ts apps/server/src/services/saas-subscription.service.integration.test.ts
git commit -m "feat(server): SaaS subscription lifecycle service (upsert / past_due / active)

Per ADR-0009 grace-period math and ADR-0002 tier-driven app-fee.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Refactor `webhooks.routes.ts` — split endpoints + idempotent platform handler

**Files:**
- Modify: `apps/server/src/routes/webhooks.routes.ts`
- Test: `apps/server/src/routes/webhooks.routes.integration.test.ts`

The existing single `/stripe` route is renamed to `/stripe/platform`. The `/stripe/connect` route is added now but only logs+acks (full Connect handlers ship in Plan B/C).

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/routes/webhooks.routes.integration.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { webhookRoutes } from "./webhooks.routes";
import { Hono } from "hono";
import Stripe from "stripe";
import { controlPanelDb } from "@/lib/db";
import { processedWebhookEvents } from "@avantej-core/db/schema/control-panel/processed-webhook-events";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { eq } from "drizzle-orm";

const PLATFORM_SECRET = "whsec_platform_test_xxx";
const TEST_EVENT_ID = "evt_test_webhook_route_001";
const TEST_SUB_ID = "sub_test_webhook_route_001";

function signEvent(payload: string, secret: string): string {
  const stripe = new Stripe("sk_test_dummy", { apiVersion: "2025-10-29.clover" });
  return stripe.webhooks.generateTestHeaderString({ payload, secret });
}

beforeEach(async () => {
  await controlPanelDb()
    .delete(processedWebhookEvents)
    .where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
  await controlPanelDb()
    .delete(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
  (globalThis as any).env = {
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_PLATFORM_WEBHOOK_SECRET: PLATFORM_SECRET,
    STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_test_xxx",
    STRIPE_PRICE_PROFESSIONAL: "price_pro",
  };
});

describe("POST /webhooks/stripe/platform", () => {
  it("400 on missing signature", async () => {
    const app = new Hono().route("/webhooks", webhookRoutes);
    const res = await app.request("/webhooks/stripe/platform", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
  });

  it("processes customer.subscription.created and upserts row", async () => {
    const app = new Hono().route("/webhooks", webhookRoutes);
    const payload = JSON.stringify({
      id: TEST_EVENT_ID,
      type: "customer.subscription.created",
      data: {
        object: {
          id: TEST_SUB_ID,
          customer: "cus_test",
          status: "active",
          items: { data: [{ price: { id: "price_pro", currency: "usd" } }] },
          current_period_start: 1715000000,
          current_period_end: 1717678400,
          cancel_at_period_end: false,
          canceled_at: null,
          trial_end: null,
        },
      },
    });
    const sig = signEvent(payload, PLATFORM_SECRET);
    const res = await app.request("/webhooks/stripe/platform", {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: payload,
    });
    expect(res.status).toBe(200);
    const [row] = await controlPanelDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, TEST_SUB_ID));
    expect(row.tier).toBe("professional");
  });

  it("dedupes a duplicate event delivery", async () => {
    const app = new Hono().route("/webhooks", webhookRoutes);
    const payload = JSON.stringify({
      id: TEST_EVENT_ID,
      type: "customer.subscription.created",
      data: {
        object: {
          id: TEST_SUB_ID,
          customer: "cus_test",
          status: "active",
          items: { data: [{ price: { id: "price_pro", currency: "usd" } }] },
          current_period_start: 1715000000,
          current_period_end: 1717678400,
          cancel_at_period_end: false,
          canceled_at: null,
          trial_end: null,
        },
      },
    });
    const sig = signEvent(payload, PLATFORM_SECRET);
    await app.request("/webhooks/stripe/platform", {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: payload,
    });
    await app.request("/webhooks/stripe/platform", {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: payload,
    });
    const rows = await controlPanelDb()
      .select()
      .from(processedWebhookEvents)
      .where(eq(processedWebhookEvents.eventId, TEST_EVENT_ID));
    expect(rows.length).toBe(1);
    expect(rows[0].attempts).toBe(2);
    expect(rows[0].processedAt).not.toBeNull();
  });
});

describe("POST /webhooks/stripe/connect", () => {
  it("acks with 200 and logs but does not process unrecognized events (v1)", async () => {
    const app = new Hono().route("/webhooks", webhookRoutes);
    const payload = JSON.stringify({
      id: "evt_test_connect_001",
      type: "payment_intent.succeeded",
      account: "acct_test",
      data: { object: { id: "pi_test" } },
    });
    const sig = signEvent(payload, "whsec_connect_test_xxx");
    const res = await app.request("/webhooks/stripe/connect", {
      method: "POST",
      headers: { "stripe-signature": sig },
      body: payload,
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test — FAIL**

Run: `cd apps/server && bun test src/routes/webhooks.routes.integration.test.ts`
Expected: FAIL — routes do not match new paths yet.

- [ ] **Step 3: Implement refactored routes**

Open `apps/server/src/routes/webhooks.routes.ts`. Replace the `webhookRoutes.post("/stripe", ...)` block (keeping the existing GHL routes intact) with two new routes:

```ts
import { verifyWebhookSignature } from "@/lib/stripe";
import {
  claimWebhookEvent,
  markEventProcessed,
  markEventFailed,
} from "@/services/webhook-dedupe.service";
import {
  upsertSubscriptionFromStripe,
  markPastDue,
  markActive,
} from "@/services/saas-subscription.service";
import type Stripe from "stripe";

webhookRoutes.post("/stripe/platform", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing Stripe-Signature header" }, 400);
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(body, signature, "platform");
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Invalid signature" },
      400,
    );
  }

  const claim = await claimWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    source: "platform",
    stripeAccount: null,
  });
  if (claim.status === "already_processed") {
    return c.json({ received: true, deduped: true }, 200);
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscriptionFromStripe(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscriptionFromStripe(sub);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const subId =
            typeof inv.subscription === "string"
              ? inv.subscription
              : inv.subscription.id;
          await markPastDue(subId);
        }
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const subId =
            typeof inv.subscription === "string"
              ? inv.subscription
              : inv.subscription.id;
          await markActive(subId);
        }
        break;
      }
      default:
        // No-op for unhandled platform events in v1.
        break;
    }
    await markEventProcessed(event.id);
    return c.json({ received: true }, 200);
  } catch (e) {
    await markEventFailed(event.id, e instanceof Error ? e.message : String(e));
    console.error(`Platform webhook handler failed for ${event.id}:`, e);
    return c.json({ error: "Handler failed" }, 500);
  }
});

webhookRoutes.post("/stripe/connect", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.json({ error: "Missing Stripe-Signature header" }, 400);
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(body, signature, "connect");
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : "Invalid signature" },
      400,
    );
  }

  const claim = await claimWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    source: "connect",
    stripeAccount: event.account ?? null,
  });
  if (claim.status === "already_processed") {
    return c.json({ received: true, deduped: true }, 200);
  }

  // v1: Connect-event handlers ship in Plan B/C. Ack + mark processed so we
  // don't accumulate retries during Plan A.
  console.log(`[connect webhook v1 stub] ${event.type} for ${event.account}`);
  await markEventProcessed(event.id);
  return c.json({ received: true, stub: true }, 200);
});
```

**Important:** Remove the old `webhookRoutes.post("/stripe", ...)` block to avoid duplicate handlers. The existing call to `handleCheckoutCompleted` in payment.service.ts becomes dead-code in Plan A; leave it for Plan C/B which may repurpose it. Update the Stripe Dashboard webhook endpoint URL during deployment to `/webhooks/stripe/platform`.

- [ ] **Step 4: Run test — PASS**

Run: `cd apps/server && bun test src/routes/webhooks.routes.integration.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/webhooks.routes.ts apps/server/src/routes/webhooks.routes.integration.test.ts
git commit -m "feat(server): split webhook endpoints + idempotent platform handler

Routes /webhooks/stripe/platform (Billing events) and /webhooks/stripe/connect
(stub for Plan B/C). Dedupes via processed_webhook_events.

Per ADR-0006.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Stripe Products + Prices seed script

**Files:**
- Create: `apps/server/scripts/stripe-seed-saas-products.ts`
- Modify: `apps/server/package.json` (add script)

- [ ] **Step 1: Implement seed**

```ts
// apps/server/scripts/stripe-seed-saas-products.ts
/**
 * Idempotent seed for SaaS Products + Prices in the Stripe sandbox.
 *
 * Run with the dev-shared sandbox secret in env:
 *   STRIPE_SECRET_KEY=sk_test_... bun run scripts/stripe-seed-saas-products.ts
 *
 * Outputs the resulting price IDs; copy them into your .env.local as
 *   STRIPE_PRICE_BASIC=price_xxx
 *   STRIPE_PRICE_PROFESSIONAL=price_yyy
 *   STRIPE_PRICE_ENTERPRISE=price_zzz
 *
 * Per ADR-0012 sandbox topology and ADR-0002 pricing.
 */

import Stripe from "stripe";

const SEED_VERSION = "avantej-saas-v1";

const tiers = [
  {
    key: "basic",
    name: "Avantej SaaS — Basic",
    description: "Single org, 25 staff, 100 customers/mo, 3% app fee.",
    amount: 4900,
  },
  {
    key: "professional",
    name: "Avantej SaaS — Professional",
    description: "Up to 5 orgs, 1000 customers/mo, GHL + memberships, 2% app fee.",
    amount: 14900,
  },
  {
    key: "enterprise",
    name: "Avantej SaaS — Enterprise",
    description: "Unlimited; lowest fees; dedicated CSM.",
    amount: 49900,
  },
];

async function main() {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) throw new Error("STRIPE_SECRET_KEY env var is required");
  const stripe = new Stripe(sk, { apiVersion: "2025-10-29.clover" });

  for (const tier of tiers) {
    // Find existing product by metadata.seedKey
    const existing = await stripe.products.search({
      query: `metadata['seedKey']:'${tier.key}' AND metadata['seedVersion']:'${SEED_VERSION}'`,
      limit: 1,
    });

    let product: Stripe.Product;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log(`[skip] product ${tier.key} exists: ${product.id}`);
    } else {
      product = await stripe.products.create({
        name: tier.name,
        description: tier.description,
        metadata: { seedKey: tier.key, seedVersion: SEED_VERSION },
      });
      console.log(`[create] product ${tier.key}: ${product.id}`);
    }

    // Find existing recurring price for this product+amount
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 10,
    });
    const matchingPrice = prices.data.find(
      (p) =>
        p.unit_amount === tier.amount &&
        p.recurring?.interval === "month" &&
        p.currency === "usd",
    );

    let price: Stripe.Price;
    if (matchingPrice) {
      price = matchingPrice;
      console.log(`  [skip] price ${tier.key}: ${price.id}`);
    } else {
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: tier.amount,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { seedKey: tier.key, seedVersion: SEED_VERSION },
      });
      console.log(`  [create] price ${tier.key}: ${price.id}`);
    }

    console.log(
      `STRIPE_PRICE_${tier.key.toUpperCase()}=${price.id}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

Edit `apps/server/package.json`, add to `scripts`:

```json
"stripe:seed": "bun run scripts/stripe-seed-saas-products.ts"
```

- [ ] **Step 3: Manually verify seed**

This is operator-only since it hits the live sandbox. Operator runs:

```bash
cd apps/server
STRIPE_SECRET_KEY=sk_test_... bun stripe:seed
```

Expected: three lines `STRIPE_PRICE_BASIC=price_...`, `STRIPE_PRICE_PROFESSIONAL=price_...`, `STRIPE_PRICE_ENTERPRISE=price_...`. Re-running shows `[skip]` for everything (idempotent).

Operator pastes the three lines into `apps/server/.env.local`.

- [ ] **Step 4: Commit**

```bash
git add apps/server/scripts/stripe-seed-saas-products.ts apps/server/package.json
git commit -m "feat(server): add idempotent Stripe Products+Prices seed for SaaS tiers

Per ADR-0002. Run via 'bun stripe:seed' in apps/server.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Stripe CLI listen wrapper + Makefile

**Files:**
- Create: `apps/server/scripts/stripe-listen.sh`
- Create: `apps/server/Makefile`

- [ ] **Step 1: Create listen script**

```bash
#!/usr/bin/env bash
# apps/server/scripts/stripe-listen.sh
# Forwards Stripe events to local server. Two modes:
#   ./stripe-listen.sh platform   -> /webhooks/stripe/platform
#   ./stripe-listen.sh connect    -> /webhooks/stripe/connect
# Prints whsec_… on first run; copy into .env.local accordingly.

set -euo pipefail

MODE="${1:-platform}"
PORT="${PORT:-3000}"

case "$MODE" in
  platform)
    exec stripe listen \
      --forward-to "localhost:${PORT}/webhooks/stripe/platform" \
      --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,checkout.session.completed
    ;;
  connect)
    exec stripe listen \
      --forward-connect-to "localhost:${PORT}/webhooks/stripe/connect" \
      --events payment_intent.succeeded,payment_intent.payment_failed,charge.refunded,charge.dispute.created,account.updated,payout.paid,payout.failed
    ;;
  *)
    echo "usage: $0 platform|connect" >&2
    exit 1
    ;;
esac
```

Make executable:

```bash
chmod +x apps/server/scripts/stripe-listen.sh
```

- [ ] **Step 2: Create Makefile**

```makefile
# apps/server/Makefile

.PHONY: stripe-listen-platform stripe-listen-connect stripe-seed

stripe-listen-platform:
	./scripts/stripe-listen.sh platform

stripe-listen-connect:
	./scripts/stripe-listen.sh connect

stripe-seed:
	bun run scripts/stripe-seed-saas-products.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/scripts/stripe-listen.sh apps/server/Makefile
git commit -m "feat(server): stripe listen wrappers + Makefile targets

Two terminals during dev:
  make -C apps/server stripe-listen-platform
  make -C apps/server stripe-listen-connect

Per ADR-0012.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: `subscriptions` oRPC router

**Files:**
- Create: `apps/server/src/routers/subscriptions.ts`
- Modify: `apps/server/src/index.ts` (mount router)
- Test: `apps/server/src/routers/subscriptions.integration.test.ts`

The router exposes three procedures: create a Checkout Session, get the current sub status, open the Billing Portal.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/routers/subscriptions.integration.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { subscriptionsRouter } from "./subscriptions";

// We mock the Stripe client to avoid hitting the real API in unit-ish tests.
const mockCreateCheckoutSession = mock(async (params: any) => ({
  id: "cs_test_123",
  url: "https://checkout.stripe.com/c/cs_test_123",
}));
const mockBillingPortalCreate = mock(async (params: any) => ({
  url: "https://billing.stripe.com/p/session_xyz",
}));
const mockCustomersCreate = mock(async (params: any) => ({
  id: "cus_test_999",
}));

mock.module("@/lib/stripe", () => ({
  getStripeClient: () => ({
    checkout: { sessions: { create: mockCreateCheckoutSession } },
    billingPortal: { sessions: { create: mockBillingPortalCreate } },
    customers: { create: mockCustomersCreate },
  }),
}));

describe("subscriptions.createCheckoutSession", () => {
  beforeEach(() => {
    (globalThis as any).env = {
      STRIPE_PRICE_PROFESSIONAL: "price_pro_test",
      WEB_APP_URL: "http://localhost:3001",
    };
    mockCreateCheckoutSession.mockClear();
    mockCustomersCreate.mockClear();
  });

  it("creates a checkout session for a chosen tier", async () => {
    const fakeContext = {
      session: { user: { id: "user_test", email: "tenant@example.com" } },
      organizationId: "org_test",
    };
    const handler = subscriptionsRouter.createCheckoutSession.handler as any;
    const result = await handler({ context: fakeContext, input: { tier: "professional" } });
    expect(result.checkoutUrl).toContain("checkout.stripe.com");
    expect(mockCreateCheckoutSession).toHaveBeenCalledTimes(1);
    const callArgs = (mockCreateCheckoutSession as any).mock.calls[0][0];
    expect(callArgs.mode).toBe("subscription");
    expect(callArgs.line_items[0].price).toBe("price_pro_test");
  });
});
```

(Test exercises only the router shape and Stripe call. Status fetch + portal tests follow same pattern; for brevity Plan A's test focus is on the Checkout creation path. Add a second integration test for `getStatus` in Step 1b.)

- [ ] **Step 1b: Second test for getStatus**

Append to the same test file:

```ts
import { controlPanelDb } from "@/lib/db";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { eq } from "drizzle-orm";

describe("subscriptions.getStatus", () => {
  const TEST_ORG_ID = "00000000-0000-0000-0000-0000000000aa";
  const TEST_SUB_DB_ID = "00000000-0000-0000-0000-0000000000bb";
  beforeEach(async () => {
    await controlPanelDb().delete(subscriptions).where(eq(subscriptions.id, TEST_SUB_DB_ID));
    await controlPanelDb().delete(organizations).where(eq(organizations.id, TEST_ORG_ID));
  });

  it("returns trialing if org has trialEndsAt in the future and no sub", async () => {
    await controlPanelDb().insert(organizations).values({
      id: TEST_ORG_ID,
      name: "Trial Tenant",
      slug: "trial-tenant-test",
      neonProjectId: "stub-neon-id-1",
      connectionString: "stub",
      paymentStatus: "active",
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    } as any);

    const fakeContext = {
      session: { user: { id: "user_test" } },
      organizationId: TEST_ORG_ID,
    };
    const handler = subscriptionsRouter.getStatus.handler as any;
    const result = await handler({ context: fakeContext, input: {} });
    expect(result.status).toBe("trialing");
    expect(result.tier).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — FAIL**

Run: `cd apps/server && bun test src/routers/subscriptions.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement router**

```ts
// apps/server/src/routers/subscriptions.ts
/**
 * SaaS Subscription oRPC Router.
 *
 * Procedures:
 *   - createCheckoutSession: returns a Stripe Checkout URL for the chosen tier.
 *   - getStatus: returns the tenant's current sub state (or 'trialing' / 'none').
 *   - billingPortal: returns a Stripe Customer Portal URL for self-serve mgmt.
 *
 * All procedures require an authenticated session and an organizationId in context.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { env } from "cloudflare:workers";
import { getStripeClient } from "@/lib/stripe";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

const TIER_TO_PRICE_ENV: Record<string, string> = {
  basic: "STRIPE_PRICE_BASIC",
  professional: "STRIPE_PRICE_PROFESSIONAL",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

export const subscriptionsRouter = {
  createCheckoutSession: protectedProcedure
    .input(z.object({ tier: z.enum(["basic", "professional", "enterprise"]) }))
    .handler(async ({ context, input }) => {
      const orgId = (context as any).organizationId;
      if (!orgId) throw new ORPCError("BAD_REQUEST", { message: "No organization context" });

      const priceEnv = TIER_TO_PRICE_ENV[input.tier];
      const priceId = (env as any)[priceEnv];
      if (!priceId)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: `${priceEnv} not configured`,
        });

      const stripe = getStripeClient();
      const [org] = await controlPanelDb()
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!org) throw new ORPCError("NOT_FOUND", { message: "Organization not found" });

      // Find or create the Stripe Customer on the platform account for this org's billing.
      let customerId: string | undefined;
      if (org.subscriptionId) {
        const [existing] = await controlPanelDb()
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, org.subscriptionId))
          .limit(1);
        customerId = existing?.stripeCustomerId;
      }
      if (!customerId) {
        const newCustomer = await stripe.customers.create({
          email: (context as any).session?.user?.email ?? undefined,
          metadata: { organizationId: orgId },
        });
        customerId = newCustomer.id;
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${(env as any).WEB_APP_URL}/subscribe?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${(env as any).WEB_APP_URL}/subscribe?canceled=1`,
        subscription_data: { metadata: { organizationId: orgId } },
        metadata: { organizationId: orgId },
      });

      return { checkoutUrl: session.url ?? "", sessionId: session.id };
    }),

  getStatus: protectedProcedure
    .input(z.object({}))
    .handler(async ({ context }) => {
      const orgId = (context as any).organizationId;
      if (!orgId) throw new ORPCError("BAD_REQUEST", { message: "No organization context" });

      const [org] = await controlPanelDb()
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!org) throw new ORPCError("NOT_FOUND", { message: "Organization not found" });

      if (org.subscriptionId) {
        const [sub] = await controlPanelDb()
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.id, org.subscriptionId))
          .limit(1);
        if (sub)
          return {
            status: sub.status,
            tier: sub.tier,
            currentPeriodEnd: sub.currentPeriodEnd,
            pastDueAt: sub.pastDueAt,
            gracePeriodEndsAt: sub.gracePeriodEndsAt,
            trialEndsAt: sub.trialEndsAt,
          };
      }

      // No sub yet — derive from trial state.
      if (org.trialEndsAt && org.trialEndsAt > new Date()) {
        return {
          status: "trialing" as const,
          tier: null,
          currentPeriodEnd: null,
          pastDueAt: null,
          gracePeriodEndsAt: null,
          trialEndsAt: org.trialEndsAt,
        };
      }
      return {
        status: "none" as const,
        tier: null,
        currentPeriodEnd: null,
        pastDueAt: null,
        gracePeriodEndsAt: null,
        trialEndsAt: org.trialEndsAt,
      };
    }),

  billingPortal: protectedProcedure
    .input(z.object({}))
    .handler(async ({ context }) => {
      const orgId = (context as any).organizationId;
      if (!orgId) throw new ORPCError("BAD_REQUEST", { message: "No organization context" });

      const [org] = await controlPanelDb()
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!org?.subscriptionId)
        throw new ORPCError("PRECONDITION_FAILED", { message: "No active subscription" });

      const [sub] = await controlPanelDb()
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, org.subscriptionId))
        .limit(1);
      if (!sub)
        throw new ORPCError("NOT_FOUND", { message: "Subscription record missing" });

      const stripe = getStripeClient();
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${(env as any).WEB_APP_URL}/dashboard/billing`,
      });
      return { portalUrl: portal.url };
    }),
};
```

- [ ] **Step 4: Mount router in server entry**

Read `apps/server/src/index.ts`. Add to imports:

```ts
import { subscriptionsRouter } from "@/routers/subscriptions";
```

In the `appRouter` declaration, add the key:

```ts
const appRouter = {
  ...baseRouter,
  // ...existing keys...
  subscriptions: subscriptionsRouter,
};
```

- [ ] **Step 5: Run tests — PASS**

Run: `cd apps/server && bun test src/routers/subscriptions.integration.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routers/subscriptions.ts apps/server/src/routers/subscriptions.integration.test.ts apps/server/src/index.ts
git commit -m "feat(server): subscriptions oRPC router (checkout, status, portal)

createCheckoutSession returns a Stripe-hosted Checkout URL keyed by tier.
getStatus derives trialing/active/past_due/none from org + subscription tables.
billingPortal returns a Customer Portal URL for self-serve management.

Per ADR-0002, ADR-0003.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: `requireActiveSaaSSub` middleware

**Files:**
- Create: `apps/server/src/middleware/require-active-saas-sub.middleware.ts`
- Test: `apps/server/src/middleware/require-active-saas-sub.middleware.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/middleware/require-active-saas-sub.middleware.test.ts
import { describe, it, expect } from "bun:test";
import { evaluateAccess } from "./require-active-saas-sub.middleware";

describe("evaluateAccess", () => {
  const now = new Date("2026-05-13T12:00:00Z");

  it("allows when status is active", () => {
    expect(evaluateAccess({ status: "active" } as any, now)).toEqual({
      decision: "allow",
    });
  });

  it("allows when status is trialing and trialEndsAt in future", () => {
    expect(
      evaluateAccess(
        { status: "trialing", trialEndsAt: new Date("2026-05-20T12:00:00Z") } as any,
        now,
      ),
    ).toEqual({ decision: "allow" });
  });

  it("allows but flags banner when status past_due within grace", () => {
    expect(
      evaluateAccess(
        {
          status: "past_due",
          pastDueAt: new Date("2026-05-12T00:00:00Z"),
          gracePeriodEndsAt: new Date("2026-05-19T00:00:00Z"),
        } as any,
        now,
      ),
    ).toEqual({ decision: "allow", banner: "past_due_in_grace" });
  });

  it("read-only when past_due past grace", () => {
    expect(
      evaluateAccess(
        {
          status: "past_due",
          pastDueAt: new Date("2026-05-01T00:00:00Z"),
          gracePeriodEndsAt: new Date("2026-05-08T00:00:00Z"),
        } as any,
        now,
      ),
    ).toEqual({ decision: "read_only", reason: "past_due_past_grace" });
  });

  it("read-only when status canceled or unpaid", () => {
    expect(evaluateAccess({ status: "canceled" } as any, now)).toEqual({
      decision: "read_only",
      reason: "canceled",
    });
    expect(evaluateAccess({ status: "unpaid" } as any, now)).toEqual({
      decision: "read_only",
      reason: "unpaid",
    });
  });

  it("blocks when no subscription and trial expired", () => {
    expect(
      evaluateAccess(
        null,
        now,
        new Date("2026-05-01T00:00:00Z"), // trial ended 12 days ago
      ),
    ).toEqual({ decision: "block", reason: "trial_expired_no_sub" });
  });

  it("allows when no subscription but trial still active", () => {
    expect(
      evaluateAccess(
        null,
        now,
        new Date("2026-05-20T00:00:00Z"),
      ),
    ).toEqual({ decision: "allow", banner: "trialing" });
  });
});
```

- [ ] **Step 2: Run test — FAIL**

Run: `cd apps/server && bun test src/middleware/require-active-saas-sub.middleware.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement middleware**

```ts
// apps/server/src/middleware/require-active-saas-sub.middleware.ts
/**
 * oRPC middleware that enforces the SaaS subscription state machine.
 * Per ADR-0003 (trial-first) and ADR-0009 (past-due / grace).
 *
 * Decisions:
 *   allow      — full access (active, trialing, past_due in grace, trial within window)
 *   read_only  — block writes; allow gets (past_due past grace, canceled, unpaid)
 *   block      — block all (trial expired and no sub)
 *
 * The middleware classification is HTTP-method aware: GET / list-ish procs
 * pass on read_only; mutation procs reject with code SAAS_PAST_DUE_READONLY
 * or SAAS_BLOCKED.
 */

import { ORPCError, type Middleware } from "@orpc/server";
import { eq } from "drizzle-orm";
import { controlPanelDb } from "@/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";

export type AccessDecision =
  | { decision: "allow"; banner?: "trialing" | "past_due_in_grace" }
  | { decision: "read_only"; reason: string }
  | { decision: "block"; reason: string };

type SubLike = {
  status: string;
  pastDueAt: Date | null;
  gracePeriodEndsAt: Date | null;
  trialEndsAt: Date | null;
} | null;

export function evaluateAccess(
  sub: SubLike,
  now: Date,
  orgTrialEndsAt?: Date | null,
): AccessDecision {
  if (sub) {
    if (sub.status === "active") return { decision: "allow" };
    if (sub.status === "trialing") {
      if (!sub.trialEndsAt || sub.trialEndsAt > now)
        return { decision: "allow", banner: "trialing" };
      return { decision: "block", reason: "trial_expired_no_sub" };
    }
    if (sub.status === "past_due") {
      if (sub.gracePeriodEndsAt && sub.gracePeriodEndsAt > now)
        return { decision: "allow", banner: "past_due_in_grace" };
      return { decision: "read_only", reason: "past_due_past_grace" };
    }
    if (sub.status === "canceled") return { decision: "read_only", reason: "canceled" };
    if (sub.status === "unpaid") return { decision: "read_only", reason: "unpaid" };
    if (sub.status === "incomplete_expired")
      return { decision: "read_only", reason: "incomplete_expired" };
    if (sub.status === "incomplete")
      return { decision: "block", reason: "incomplete" };
    return { decision: "read_only", reason: sub.status };
  }

  // No subscription → derive from org trial.
  if (orgTrialEndsAt && orgTrialEndsAt > now)
    return { decision: "allow", banner: "trialing" };
  return { decision: "block", reason: "trial_expired_no_sub" };
}

export const requireActiveSaaSSub: Middleware<any, any, any> = async ({
  context,
  next,
}) => {
  const orgId = (context as any).organizationId;
  if (!orgId) throw new ORPCError("BAD_REQUEST", { message: "No organization context" });

  const [org] = await controlPanelDb()
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new ORPCError("NOT_FOUND", { message: "Organization not found" });

  let sub: SubLike = null;
  if (org.subscriptionId) {
    const [row] = await controlPanelDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, org.subscriptionId))
      .limit(1);
    sub = row ?? null;
  }

  const decision = evaluateAccess(sub, new Date(), org.trialEndsAt);
  if (decision.decision === "block")
    throw new ORPCError("SAAS_BLOCKED" as any, {
      message: `Access blocked: ${decision.reason}`,
    });
  if (decision.decision === "read_only") {
    // Mutating procedures must opt-in via procedure metadata. For Plan A we
    // gate on a `__write` flag set by caller code (or by a future tag system).
    // Simplest v1: rely on procedure naming convention — any procedure name
    // starting with one of these prefixes is treated as a write:
    const path = (context as any).path ?? "";
    const writePrefixes = ["create", "update", "delete", "upsert", "set", "add", "remove"];
    const isWrite = writePrefixes.some((p) =>
      path.split(".").pop()?.toLowerCase().startsWith(p),
    );
    if (isWrite)
      throw new ORPCError("SAAS_PAST_DUE_READONLY" as any, {
        message: `Read-only mode: ${decision.reason}`,
      });
  }

  (context as any).saasBanner = decision.decision === "allow" ? decision.banner : undefined;
  return next({ context });
};
```

- [ ] **Step 4: Run test — PASS**

Run: `cd apps/server && bun test src/middleware/require-active-saas-sub.middleware.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/middleware/require-active-saas-sub.middleware.ts apps/server/src/middleware/require-active-saas-sub.middleware.test.ts
git commit -m "feat(server): requireActiveSaaSSub middleware + pure access evaluator

Per ADR-0003 (trial gates) + ADR-0009 (past_due 7-day grace, read-only beyond).
evaluateAccess() is pure for testing; middleware wires it to oRPC context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Web `/subscribe` page — wire to real oRPC + Stripe.js

**Files:**
- Modify: `apps/web/src/lib/stripe.ts`
- Modify: `apps/web/src/routes/subscribe.tsx`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/package.json` (add `@stripe/stripe-js`)

- [ ] **Step 1: Add Stripe.js dependency**

In `apps/web`:

```bash
cd apps/web && bun add @stripe/stripe-js
```

- [ ] **Step 2: Replace stub `lib/stripe.ts`**

```ts
// apps/web/src/lib/stripe.ts
import { loadStripe, type Stripe } from "@stripe/stripe-js";

const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;

const getStripe = (): Promise<Stripe | null> => {
  if (!stripePromise) {
    if (!stripePublishableKey) {
      console.error("VITE_STRIPE_PUBLISHABLE_KEY is not set");
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(stripePublishableKey);
  }
  return stripePromise;
};

export default getStripe;
```

- [ ] **Step 3: Update `.env.example`**

Append to `apps/web/.env.example`:

```
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

- [ ] **Step 4: Update `subscribe.tsx` to use oRPC procedure**

Read the existing file; locate the plan-purchase click handler. Replace the prior mock with a call to `client.subscriptions.createCheckoutSession({ tier })` and redirect to the returned `checkoutUrl`. Concretely, find the plan card's click/submit handler and wire it as below (paste this into the relevant action handler):

```ts
// inside the existing SubscribePage component, replace the mutation that
// previously returned a fake session with:
const checkoutMutation = useMutation({
  mutationFn: async ({ tier }: { tier: "basic" | "professional" | "enterprise" }) => {
    const res = await apiClient.subscriptions.createCheckoutSession({ tier });
    return res;
  },
  onSuccess: (data) => {
    if (data?.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
    } else {
      toast.error("Failed to start checkout");
    }
  },
  onError: (err: any) => {
    toast.error(err?.message ?? "Checkout failed");
  },
});

// Replace the per-plan button onClick with:
//   onClick={() => checkoutMutation.mutate({ tier: plan.metadata.tier as any })}
// where plan.metadata.tier is "basic" | "professional" | "enterprise".
```

Also: on `session_id` query param (return-from-Checkout success), call `apiClient.subscriptions.getStatus({})` and route to `/dashboard` once status is `active` (with up to ~5s polling — webhook may not have landed). On `canceled=1`, show the toast "Checkout canceled."

- [ ] **Step 5: Manual smoke test (operator)**

Operator runs in three terminals:

```bash
# T1
cd apps/server && bun dev

# T2 — webhook forwarder
cd apps/server && make stripe-listen-platform
# copy whsec_… into apps/server/.env.local under STRIPE_PLATFORM_WEBHOOK_SECRET

# T3
cd apps/web && bun dev
```

Browser flow:
1. Visit `http://localhost:3001/subscribe`.
2. Click a plan. Expect redirect to Stripe-hosted Checkout.
3. Pay with test card `4242 4242 4242 4242`, any future expiry, any CVC.
4. Stripe redirects back to `/subscribe?session_id=cs_…`.
5. After ~2 seconds, check that the `subscriptions` row in control-panel DB has `status='active'`, `tier='professional'`, `applicationFeeBps=200`, `currency='usd'`.

Expected:
- Webhook listener (T2) prints `--> customer.subscription.created … 200 OK`.
- Webhook listener (T2) prints `--> invoice.paid … 200 OK`.
- DB row exists with expected fields.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/stripe.ts apps/web/src/routes/subscribe.tsx apps/web/.env.example apps/web/package.json apps/web/bun.lock
git commit -m "feat(web): wire /subscribe to subscriptions.createCheckoutSession

Real Stripe.js, real oRPC Checkout creation, redirect to Stripe-hosted Checkout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: End-to-end happy-path verification + Plan A summary

**Files:**
- No code; this is a verification step before declaring Plan A done.

- [ ] **Step 1: Run full server test suite**

Run: `cd apps/server && bun test`
Expected: All Plan-A tests green; pre-existing tests unchanged.

- [ ] **Step 2: Run integration suite explicitly**

Run: `cd apps/server && bun test:integration`
Expected: Tasks 7, 8, 9, 12 integration tests pass against a clean control-panel DB.

- [ ] **Step 3: Manual smoke test of full happy path**

Operator repeats Task 14 Step 5. Verify:

- New tenant org (existing test tenant or freshly seeded one) has `subscriptionId = null` and `trialEndsAt` ~14 days out before checkout.
- After checkout + webhook, `organizations.subscriptionId` remains null in Plan A (org-to-sub linking is a separate concern; current `payment.service.ts` did that linkage but it has been bypassed by the new webhook handler). **Plan A does not link a `subscription` row to an `organization`** — that linkage is handled by a separate procedure in a future plan that calls during Checkout creation by including `client_reference_id = organizationId` in the Checkout Session, and reading it back in `customer.subscription.created`. **Add that linking now.**

Open `apps/server/src/routers/subscriptions.ts` `createCheckoutSession.handler`. Find the `stripe.checkout.sessions.create({...})` call and add `client_reference_id: orgId` as a top-level field. Then in `apps/server/src/services/saas-subscription.service.ts` `upsertSubscriptionFromStripe`, after the `INSERT…ON CONFLICT…RETURNING` add the linking write:

```ts
// At the end of upsertSubscriptionFromStripe, link the org if metadata says so:
const orgIdFromMeta =
  sub.metadata?.organizationId ?? null;
if (orgIdFromMeta) {
  const [localSub] = await controlPanelDb()
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id))
    .limit(1);
  if (localSub) {
    await controlPanelDb()
      .update(organizations)
      .set({ subscriptionId: localSub.id, updatedAt: new Date() })
      .where(eq(organizations.id, orgIdFromMeta));
  }
}
```

Add import:

```ts
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
```

Re-run Task 9 + Task 12 tests to ensure they still pass.

- [ ] **Step 4: Manual verification of past_due**

Trigger a synthetic past_due:

```bash
stripe trigger invoice.payment_failed
```

Expected: A test invoice is created and the failure event arrives at `/webhooks/stripe/platform`. Verify `subscriptions.status='past_due'`, `pastDueAt` set, `gracePeriodEndsAt` = pastDueAt + 7 days.

Then:

```bash
stripe trigger invoice.paid
```

Expected: `subscriptions.status='active'`, `pastDueAt` and `gracePeriodEndsAt` cleared.

- [ ] **Step 5: Commit linking fix**

```bash
git add apps/server/src/services/saas-subscription.service.ts apps/server/src/routers/subscriptions.ts
git commit -m "feat(server): link Stripe Subscription back to organization via metadata

client_reference_id + subscription.metadata.organizationId is what
webhook handler uses to set organizations.subscriptionId.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Write Plan A completion note**

Create `docs/superpowers/plans/2026-05-13-plan-a-saas-subscription-billing.notes.md` summarizing what shipped, what tests cover, and any known gaps to fix in Plan B/C/D.

Content:

```markdown
# Plan A — Completion Notes

Shipped:
- Tier config (packages/types/src/tiers.ts) with limits, features, app-fee bps.
- Schema: subscriptions extended, organizations.subscriptionId nullable + trialEndsAt,
  processed_webhook_events, platform_payment_ledger (table only).
- apps/server/src/lib/stripe.ts split webhook secrets, exported getStripeClient.
- Services: webhook-dedupe, saas-subscription lifecycle.
- Webhook routes split: /webhooks/stripe/platform (handlers) + /webhooks/stripe/connect (stub).
- subscriptions oRPC router: createCheckoutSession, getStatus, billingPortal.
- requireActiveSaaSSub middleware with pure evaluateAccess() helper.
- Stripe Products+Prices seed script, Stripe CLI Makefile.
- Web /subscribe wired to real Stripe.js + oRPC.

Tests:
- Unit: tiers.test.ts, stripe.test.ts, require-active-saas-sub.middleware.test.ts.
- Integration: webhook-dedupe.service, saas-subscription.service, webhooks.routes, subscriptions router.

Not in Plan A (handled later):
- Plan B: Connect onboarding, account.updated handler, embedded onboarding component.
- Plan C: Customer payment (PaymentIntent + PaymentSheet), Connect direct-charge webhook handler.
- Plan D: platform_payment_ledger writes; nightly reconciler; (optional) custom Avantej dunning emails; tier-feature middleware (requireTierFeature) for ghl/commissionSplits/memberships.
```

- [ ] **Step 7: Commit notes**

```bash
git add docs/superpowers/plans/2026-05-13-plan-a-saas-subscription-billing.notes.md
git commit -m "docs(plan): add Plan A completion notes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (after writing)

**Spec coverage:**
- ADR-0001 — N/A in Plan A (Direct charges on Connect is Plan C scope).
- ADR-0002 — ✅ tier app-fee bps wired into `subscriptions.applicationFeeBps`.
- ADR-0003 — ✅ trial-first via nullable `subscriptionId` + `trialEndsAt`; `requireActiveSaaSSub`.
- ADR-0004 — ✅ Plan A is the v1 Phase 0+1 cut.
- ADR-0006 — ✅ split endpoints, dedupe table, idempotency tests.
- ADR-0009 — ✅ 7-day grace math in `markPastDue`, evaluator, tests.
- ADR-0010 — ✅ `TIER_LIMITS` source of truth.
- ADR-0012 — ✅ seed script, Makefile, single-currency USD in defaults.

**Placeholder scan:**
- No `TBD`, `TODO`, or unspecified handlers.
- Every test step shows actual code.
- Every commit step shows actual command.

**Type consistency:**
- `Tier` type from `packages/types` consistent across `getTierLimits`, `computeTierFromPriceId`, router.
- `WebhookSource` type used in `verifyWebhookSignature` matches webhook route call sites.
- `AccessDecision` shape stable across `evaluateAccess` and middleware.

**Known minor risks** (acknowledged, not blocking):
- `controlPanelDb()` shape — verify Task 7 step 3 against actual `apps/server/src/lib/db.ts` API; switch to request-scoped if needed.
- oRPC procedure name detection for read-only mode (Task 13) is prefix-based; a tag/metadata system is cleaner and lands in Plan D hardening.
- `cancelAtPeriodEnd` stored as `text` for compatibility with the existing schema convention; Plan D can normalize to `boolean` if desired.
