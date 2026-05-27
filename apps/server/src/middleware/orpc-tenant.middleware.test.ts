/**
 * orpc-tenant.middleware tests
 *
 * Scope: this test covers the cross-tenant safety branch added during the
 * quality-remediation sprint (zplan/05-27_02-01_quality-remediation). The
 * full middleware has many code paths (body parsing, invitation bypass,
 * suspended/cancelled gating, member resolution) — this file focuses on
 * the org-not-found branch that previously fell through to a misleading
 * 500 from assertTenantContext downstream.
 *
 * Scenarios (3):
 *  1. Request body contains organizationId for a non-existent org → 403
 *     "Forbidden: organization not accessible"; getTenantDb is NEVER called
 *     (no neon-branch lookup against the wrong tenant)
 *  2. Org exists and is active → middleware does NOT short-circuit;
 *     getTenantDb IS called to set up the tenant context
 *  3. Org exists but is suspended → 403 "Tenant is suspended" (preserves
 *     pre-existing Plan E E.3 / ADR-0024 behaviour)
 *
 * Why not cover every branch — the existing pipeline.integration.test.ts
 * exercises the broader middleware composition. This file is a focused
 * regression net for the cross-tenant 500 → 403 fix.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockOrgFindFirst = mock(async () => null as unknown);
const mockGetSession = mock(async () => null as unknown);
const mockGetTenantDb = mock(async () => ({
  query: {
    members: { findFirst: mock(async () => null) },
  },
}));

const mockControlPanelDb = {
  query: {
    organizations: { findFirst: mockOrgFindFirst },
  },
};

mock.module("../lib/db", () => ({
  getControlPanelDb: (_c?: unknown) => mockControlPanelDb,
  getTenantDb: mockGetTenantDb,
}));

mock.module("../lib/better-auth", () => ({
  getBetterAuth: (_c?: unknown) => ({
    api: { getSession: mockGetSession },
  }),
}));

// NOTE: bun:test's `mock.module` is process-global — the FIRST factory
// registered for a module wins for the whole test run. Because
// payments.test.ts and customer-profiles.test.ts also mock
// @avantej-core/services, this factory must be a superset of everything
// any sprint test file consumes from this module. See
// customer-profiles.test.ts for the canonical superset list.
class _SharedPermissionDeniedError extends Error {
  resource: string;
  action: string;
  role: string;
  constructor(resource: string, action: string, role: string) {
    super(`Permission denied: ${resource}:${action} for role ${role}`);
    this.name = "PermissionDeniedError";
    this.resource = resource;
    this.action = action;
    this.role = role;
  }
}

mock.module("@avantej-core/services", () => ({
  getDescendantNodeIds: mock(async () => [] as string[]),
  // From customer-profiles.test.ts
  requirePermission: mock(async () => undefined),
  upsertCustomerProfile: mock(async () => undefined),
  createMember: mock(async () => undefined),
  // From payments.test.ts (consumed by packages/api/src/guards.ts)
  createPackageInstance: mock(async () => ({
    id: "pkg_inst_abc",
    serviceId: "svc-1",
    status: "pending",
  })),
  assertBranchAccessible: (branchId: string, accessibleNodeIds: string[]) => {
    if (!accessibleNodeIds.includes(branchId)) {
      throw new _SharedPermissionDeniedError("branch", "access", "staff");
    }
  },
  isBranchAccessDeniedError: (err: unknown) =>
    err instanceof _SharedPermissionDeniedError,
  PermissionDeniedError: _SharedPermissionDeniedError,
}));

// Import SUT after mocks
const { orpcTenantMiddleware } = await import("./orpc-tenant.middleware");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const VALID_SESSION = {
  user: { id: USER_ID, email: "u@example.com" },
  session: { id: "sess_1", token: "tok_abc", userId: USER_ID },
};

// Build a minimal Hono app that mounts only the SUT and a terminal handler
// that returns the resolved organizationId + whether tenantDb was set.
function makeApp() {
  const app = new Hono();
  app.use("*", orpcTenantMiddleware);
  app.post("/rpc/payments/getPaymentStatus", (c) =>
    c.json({
      reachedHandler: true,
      organizationId: c.get("organizationId"),
      hasTenantDb: !!c.get("tenantDb"),
    }),
  );
  return app;
}

function makeJsonRequest(orgId: string): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { organizationId: orgId } }),
  };
}

beforeEach(() => {
  mockOrgFindFirst.mockReset();
  mockGetSession.mockReset();
  mockGetTenantDb.mockReset();
  mockGetTenantDb.mockImplementation(async () => ({
    query: { members: { findFirst: mock(async () => null) } },
  }));
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("orpcTenantMiddleware — cross-tenant safety", () => {
  it("returns 403 when organizationId does not resolve to any org; getTenantDb is never called", async () => {
    mockOrgFindFirst.mockImplementationOnce(async () => undefined);
    mockGetSession.mockImplementationOnce(async () => VALID_SESSION);

    const app = makeApp();
    const res = await app.request(
      "/rpc/payments/getPaymentStatus",
      makeJsonRequest(ORG_ID),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string; reachedHandler?: boolean };
    expect(body.error).toBe("Forbidden: organization not accessible");
    // Critical security assertion: no neon-branch lookup on the wrong tenant
    expect(mockGetTenantDb.mock.calls.length).toBe(0);
    // Terminal handler must not be reached
    expect(body.reachedHandler).toBeUndefined();
  });

  it("does NOT short-circuit when org exists and is active; getTenantDb is called", async () => {
    mockOrgFindFirst.mockImplementationOnce(async () => ({
      id: ORG_ID,
      paymentStatus: "active",
    }));
    mockGetSession.mockImplementationOnce(async () => VALID_SESSION);

    const app = makeApp();
    const res = await app.request(
      "/rpc/payments/getPaymentStatus",
      makeJsonRequest(ORG_ID),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reachedHandler?: boolean;
      organizationId?: string;
      hasTenantDb?: boolean;
    };
    expect(body.reachedHandler).toBe(true);
    expect(body.organizationId).toBe(ORG_ID);
    expect(body.hasTenantDb).toBe(true);
    expect(mockGetTenantDb.mock.calls.length).toBe(1);
  });

  it("returns 403 when org is suspended (preserves Plan E E.3 / ADR-0024)", async () => {
    mockOrgFindFirst.mockImplementationOnce(async () => ({
      id: ORG_ID,
      paymentStatus: "suspended",
    }));

    const app = makeApp();
    const res = await app.request(
      "/rpc/payments/getPaymentStatus",
      makeJsonRequest(ORG_ID),
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error?: string;
      paymentStatus?: string;
    };
    expect(body.error).toBe("Tenant is suspended");
    expect(body.paymentStatus).toBe("suspended");
    expect(mockGetTenantDb.mock.calls.length).toBe(0);
  });
});
