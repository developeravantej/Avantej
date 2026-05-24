/**
 * Seed-data helpers for Day-3 journey specs.
 *
 * All helpers use the oRPC client (page-cookie auth) instead of direct DB
 * INSERT — matching the decision record (option a, 2026-05-12).
 *
 * Every `seed*` function returns enough data to assert against, and a matching
 * `cleanup*` function that is idempotent (safe to call even if the row was
 * never created or was already cleaned up).
 *
 * Org constant — matches the test tenant used throughout the E2E suite.
 */

import type { Page } from "@playwright/test";
import { orpcCall, OrpcClientError } from "./orpc-client";

export const TEST_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainerInfo {
  memberId: string;
  userId: string;
  name: string;
  hierarchyScopeId: string | null;
}

export interface ClientInfo {
  memberId: string;
  userId: string;
  name: string;
  hierarchyScopeId: string | null;
}

export interface ServiceInfo {
  id: string;
  name: string;
  branchId: string | null;
  sessionCount: number | null;
}

export interface ProductInfo {
  id: string;
  name: string;
  unitPriceCents: number;
}

export interface InstallmentPlanInfo {
  id: string;
  code: string;
  numInstallments: number;
  label: string | null;
}

// ─── Member pickers ───────────────────────────────────────────────────────────

/**
 * Pick the first active trainer in the test tenant.
 * Returns null if no trainer exists (caller should skip).
 */
export async function pickFirstActiveTrainer(page: Page): Promise<TrainerInfo | null> {
  type MemberRow = { id: string; userId: string; role: string; status: string; name: string; hierarchyScopeId?: string | null };
  try {
    const rows = await orpcCall<object, MemberRow[]>(page, "members", "list", {
      organizationId: TEST_ORG_ID,
      role: "trainer",
      status: "active",
    });
    const first = rows[0];
    if (!first) return null;
    return {
      memberId: first.id,
      userId: first.userId,
      name: first.name,
      hierarchyScopeId: first.hierarchyScopeId ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Pick the first active client in the test tenant.
 * Returns null if no client exists.
 */
export async function pickFirstActiveClient(page: Page): Promise<ClientInfo | null> {
  type MemberRow = { id: string; userId: string; role: string; status: string; name: string; hierarchyScopeId?: string | null };
  try {
    const rows = await orpcCall<object, MemberRow[]>(page, "members", "list", {
      organizationId: TEST_ORG_ID,
      role: "client",
      status: "active",
    });
    const first = rows[0];
    if (!first) return null;
    return {
      memberId: first.id,
      userId: first.userId,
      name: first.name,
      hierarchyScopeId: first.hierarchyScopeId ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Service / product pickers ────────────────────────────────────────────────

/**
 * Pick the first active service.
 * - hasSessions: true → only return services with sessionCount > 0
 * - isPackage: true → only return services with expirable=true and expiryDays set
 *   (required for POS sales of type "package" — backend enforces this constraint)
 */
export async function pickFirstService(
  page: Page,
  opts?: { hasSessions?: boolean; isPackage?: boolean },
): Promise<ServiceInfo | null> {
  type ServiceRow = { id: string; name: string; branchId?: string | null; sessionCount?: number | null; isActive?: boolean; expirable?: boolean; expiryDays?: number | null };
  try {
    const rows = await orpcCall<object, ServiceRow[]>(page, "services", "list", {
      organizationId: TEST_ORG_ID,
      isActive: true,
    });
    let filtered = rows;
    if (opts?.hasSessions) {
      filtered = filtered.filter((s) => s.sessionCount != null && s.sessionCount > 0);
    }
    if (opts?.isPackage) {
      filtered = filtered.filter((s) => s.expirable === true && s.expiryDays != null && s.expiryDays > 0);
    }
    const first = filtered[0];
    if (!first) return null;
    return {
      id: first.id,
      name: first.name,
      branchId: first.branchId ?? null,
      sessionCount: first.sessionCount ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Pick the first active product.
 * Returns null if no products are configured (caller should skip test).
 */
export async function pickFirstProduct(page: Page): Promise<ProductInfo | null> {
  type ProductRow = { id: string; name: string; status?: string };
  type PriceRow = { unitPriceCents?: number };
  try {
    const rows = await orpcCall<object, ProductRow[]>(page, "products", "list", {
      organizationId: TEST_ORG_ID,
      status: "active",
    });
    const first = rows[0];
    if (!first) return null;
    // Fetch price via resolveProductPrice; fallback to 1000 (RM 10) if not available
    let unitPriceCents = 1000;
    try {
      const priceResult = await orpcCall<object, PriceRow>(page, "products", "resolvePrice", {
        organizationId: TEST_ORG_ID,
        productId: first.id,
      });
      unitPriceCents = priceResult.unitPriceCents ?? 1000;
    } catch {
      // ignore — use fallback
    }
    return { id: first.id, name: first.name, unitPriceCents };
  } catch {
    return null;
  }
}

/**
 * Pick the first active installment plan with at least 2 installments.
 * Returns null if no such plan exists (caller should skip).
 */
export async function pickFirstInstallmentPlan(page: Page): Promise<InstallmentPlanInfo | null> {
  type PlanRow = { id: string; code: string; numInstallments: number; name?: string | null; label?: string | null; isActive?: boolean };
  try {
    const rows = await orpcCall<object, PlanRow[]>(page, "installmentPlans", "list", {
      organizationId: TEST_ORG_ID,
      activeOnly: true,
    });
    const first = rows.find((p) => p.numInstallments >= 2);
    if (!first) return null;
    return {
      id: first.id,
      code: first.code,
      numInstallments: first.numInstallments,
      label: first.name ?? first.label ?? null,
    };
  } catch {
    return null;
  }
}

// ─── Hierarchy helper ─────────────────────────────────────────────────────────

/**
 * Pick the first accessible branch node ID for the admin.
 * Falls back to a known test ID if the API returns nothing.
 */
export async function pickFirstBranchId(page: Page): Promise<string> {
  const FALLBACK = "aaaaaaaa-0000-4000-8000-000000000001";
  try {
    type NodeRow = { id: string; type?: string; name?: string };
    // listNodes returns { nodes: NodeRow[] }, not NodeRow[]
    const result = await orpcCall<object, { nodes: NodeRow[] }>(page, "hierarchy", "listNodes", {
      organizationId: TEST_ORG_ID,
    });
    const nodes = result?.nodes ?? [];
    // Prefer nodes with type "branch" or "location" (deepest level)
    const branch =
      nodes.find((n) => n.type === "branch" || n.type === "location") ?? nodes[0];
    return branch?.id ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

// ─── Appointment seeding ──────────────────────────────────────────────────────

/**
 * Seed a confirmed appointment for the given trainer + client.
 * Picks a future timeslot (tomorrow 10am + a small offset based on index to avoid collisions).
 *
 * Returns the appointment id.
 */
export async function seedConfirmedAppointment(
  page: Page,
  params: {
    /**
     * Trainer's tenant `members.id` — used for `appointments.trainer_id` FK.
     */
    trainerMemberId: string;
    /**
     * Trainer's control-panel `members.userId` — used for `appointment_staff.staffId`,
     * which is what the commission engine resolves to find the trainer's tier.
     */
    trainerUserId: string;
    clientUserId: string;
    serviceId?: string | null;
    branchId: string;
    offsetMinutes?: number; // shift startTime to avoid slot collisions across tests
  },
): Promise<string> {
  // Use a random future timeslot per test run to avoid the trainer's
  // existing-appointment buffer (15 min) and parallel-test collisions.
  // Bands: 7+ days out, between 06:00 and 21:00, on a 30-minute grid.
  const offset = params.offsetMinutes ?? 0;
  const target = new Date();
  const daysAhead = 7 + Math.floor(Math.random() * 60); // 7-66 days
  target.setDate(target.getDate() + daysAhead);
  const hour = 6 + Math.floor(Math.random() * 15); // 6-20
  const halfHour = Math.random() < 0.5 ? 0 : 30;
  target.setHours(hour, halfHour, 0, 0);
  const startTime = new Date(target.getTime() + offset * 60 * 1000);

  type Created = { id: string };
  const result = await orpcCall<object, Created>(page, "appointments", "create", {
    organizationId: TEST_ORG_ID,
    type: "private",
    startTime: startTime.toISOString(),
    duration: 60,
    branchId: params.branchId,
    serviceId: params.serviceId ?? null,
    status: "confirmed",
    sessionTotal: 1,
    pricePerClient: 0,
    userId: params.clientUserId,
    trainerId: params.trainerMemberId, // appointments.trainer_id FK → members.id
    // staffAssignments.staffId is members.userId so the commission engine can
    // resolve role+tier. Without this, only trainerId is written and the
    // engine logs "commission_skipped_member_not_found".
    staffAssignments: [{ staffId: params.trainerUserId, slotIndex: 0 }],
  });
  return result.id;
}

/**
 * Cancel an appointment via the update procedure.
 */
export async function cancelAppointment(
  page: Page,
  appointmentId: string,
  reason = "E2E test cleanup",
): Promise<void> {
  try {
    await orpcCall(page, "appointments", "update", {
      organizationId: TEST_ORG_ID,
      id: appointmentId,
      status: "cancelled",
      cancellationReason: reason,
    });
  } catch (err) {
    if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
    throw err;
  }
}

/**
 * Complete an appointment.
 */
export async function completeAppointment(page: Page, appointmentId: string): Promise<void> {
  await orpcCall(page, "appointments", "update", {
    organizationId: TEST_ORG_ID,
    id: appointmentId,
    status: "completed",
  });
}

/**
 * Idempotent cleanup — attempt cancel; swallow NOT_FOUND errors.
 */
export async function cleanupAppointment(page: Page, appointmentId: string): Promise<void> {
  try {
    await cancelAppointment(page, appointmentId, "E2E afterEach cleanup");
  } catch {
    // already gone — ignore
  }
}

// ─── Commission split helpers ─────────────────────────────────────────────────

/**
 * Fetch commission splits for a specific appointment via `commissionSplits.getByAppointment`.
 * Returns an empty array if the procedure fails or returns nothing.
 */
export async function getCommissionSplitsForAppointment(
  page: Page,
  appointmentId: string,
): Promise<Array<{ id: string; staffId: string; earnReason: string; status: string; calculatedAmount: number }>> {
  type SplitRow = { id: string; staffId: string; earnReason: string; status: string; calculatedAmount: number };
  try {
    const rows = await orpcCall<object, SplitRow[]>(
      page,
      "commissionSplits",
      "getByAppointment",
      {
        organizationId: TEST_ORG_ID,
        appointmentId,
      },
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

// ─── Package instance seeding ─────────────────────────────────────────────────

/**
 * Seed a package instance assigned to the currently logged-in admin member.
 * Workflow:
 *   1. Create a package instance via packageInstances.create (source: "purchased" → pending)
 *   2. Immediately assign the admin as trainer via packageInstances.assignTrainer → active
 *
 * Returns the package instance id, or null if seeding failed.
 *
 * Preconditions: service with expirable=true + expiryDays must exist.
 */
export async function seedAssignedPackageForAdmin(
  page: Page,
  params: {
    serviceId: string;
    clientUserId: string;
    adminMemberId: string;
    adminUserId: string;
  },
): Promise<string | null> {
  const now = new Date();
  const startsAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  type Created = { id: string; status?: string };
  let instanceId = "";
  try {
    const created = await orpcCall<object, Created>(page, "packageInstances", "create", {
      organizationId: TEST_ORG_ID,
      serviceId: params.serviceId,
      clientId: params.clientUserId,
      source: "purchased",
      creditsTotal: 1,
      startsAt,
      expiresAt,
      totalPrice: 1000,
      paymentStatus: "paid",
      paymentMethod: "cash",
    });
    instanceId = created.id;
  } catch {
    return null;
  }

  // Assign admin as trainer — this transitions status to "active"
  try {
    await orpcCall(page, "packageInstances", "assignTrainer", {
      organizationId: TEST_ORG_ID,
      packageInstanceId: instanceId,
      trainerMemberId: params.adminMemberId,
    });
  } catch {
    // If assignment fails (e.g. approval gate off, package already active), return anyway
    // The listAssignedToMe query needs assignedTrainerId to be set
    return null;
  }

  return instanceId;
}

// ─── Product seeding ──────────────────────────────────────────────────────────

/**
 * Ensure at least one product exists in the test tenant catalog.
 *
 * 1. Calls `products.list` — if a product exists, returns it.
 * 2. If empty, fetches the first UOM (required by products.create), then calls
 *    `products.create` with minimal fields.
 * 3. Returns null if the catalog cannot be populated (caller should skip).
 *
 * The created product is idempotent across runs because `list` is checked first.
 */
export async function ensureFirstProduct(page: Page): Promise<ProductInfo | null> {
  // ── 1. Try listing existing products ────────────────────────────────────────
  type ProductRow = { id: string; name: string; status?: string; price?: number };
  let existingProduct: ProductInfo | null = null;
  try {
    const rows = await orpcCall<object, ProductRow[]>(page, "products", "list", {
      organizationId: TEST_ORG_ID,
      status: "active",
    });
    const first = rows[0];
    if (first) {
      existingProduct = {
        id: first.id,
        name: first.name,
        unitPriceCents: first.price ?? 5000,
      };
    }
  } catch {
    // list failed — attempt create below
  }

  if (existingProduct) return existingProduct;

  // ── 2. Fetch a UOM to satisfy the required uomId field ─────────────────────
  type UomRow = { id: string; name: string };
  let uomId = "";
  try {
    const uoms = await orpcCall<object, UomRow[]>(page, "unitsOfMeasure", "list", {
      organizationId: TEST_ORG_ID,
    });
    uomId = uoms[0]?.id ?? "";
  } catch {
    // no UOMs — cannot create product
    return null;
  }
  if (!uomId) return null;

  // ── 3. Create the product ───────────────────────────────────────────────────
  type Created = { id: string; name?: string };
  try {
    const created = await orpcCall<object, Created>(page, "products", "create", {
      organizationId: TEST_ORG_ID,
      sku: "E2E-PRODUCT-001",
      name: "E2E Test Product",
      uomId,
      price: 5000, // 50.00 MYR in cents
      status: "active",
    });
    return {
      id: created.id,
      name: created.name ?? "E2E Test Product",
      unitPriceCents: 5000,
    };
  } catch {
    return null;
  }
}

// ─── POS sale helper ──────────────────────────────────────────────────────────

/**
 * Record a POS sale via oRPC and return the sales order ID.
 */
export async function recordPosSale(
  page: Page,
  params: {
    customerId: string;
    customerName: string;
    branchId: string;
    items: Array<{
      type: "service" | "package" | "product" | "custom";
      refId?: string;
      description: string;
      quantity: number;
      unitPriceCents: number;
    }>;
    paymentMethod?: "cash" | "card" | "bank_transfer";
    installmentPlanCode?: string;
  },
): Promise<string> {
  type SaleResult = { salesOrderId: string; id?: string };
  const result = await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
    organizationId: TEST_ORG_ID,
    customerType: "member",
    customerId: params.customerId,
    customerName: params.customerName,
    branchId: params.branchId,
    items: params.items,
    paymentMethod: params.paymentMethod ?? "cash",
    installmentPlanCode: params.installmentPlanCode,
  });
  return result.salesOrderId ?? result.id ?? "";
}

// ─── Minimal POS fixture (Plan B smoke gate) ─────────────────────────────────

export interface MinimalPosFixture {
  trainerId: string;
  clientMemberId: string;
  packageServiceId: string;
  installmentPlanId: string;
}

/**
 * Asserts the test tenant has trainer, client, package service, and installment
 * plan data required by POS journey specs. Throws (does not skip) when data is
 * missing — run `cd apps/server && bun run scripts/seed-business-data.ts` first.
 */
export async function seedMinimalPosFixture(
  page: Page,
  orgId: string = TEST_ORG_ID,
): Promise<MinimalPosFixture> {
  const trainer = await pickFirstActiveTrainer(page);
  const client = await pickFirstActiveClient(page);
  const service = await pickFirstService(page, {
    isPackage: true,
    hasSessions: true,
  });
  const plan = await pickFirstInstallmentPlan(page);

  const missing: string[] = [];
  if (!trainer) missing.push("active trainer");
  if (!client) missing.push("active client");
  if (!service) missing.push("package service (expirable + sessions)");
  if (!plan) missing.push("installment plan (≥2 installments)");

  if (missing.length > 0) {
    throw new Error(
      `seedMinimalPosFixture: missing ${missing.join(", ")} for org ${orgId}. ` +
        "Run: cd apps/server && bun run scripts/seed-business-data.ts",
    );
  }

  return {
    trainerId: trainer!.memberId,
    clientMemberId: client!.memberId,
    packageServiceId: service!.id,
    installmentPlanId: plan!.id,
  };
}
