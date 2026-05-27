/**
 * tenant.middleware tests
 *
 * Covers 10 scenarios for tenantMiddleware:
 *  1. No user in ctx → 401
 *  2. org ID from URL param "organizationId" → ctx populated
 *  3. org ID from URL param "id" → ctx populated
 *  4. org ID from header X-Organization-Id → ctx populated
 *  5. org ID from session user.organizationId → ctx populated
 *  6. no org ID anywhere → 400 "No active organization"
 *  7. org not found in DB (findFirst returns undefined) → 404
 *  8. paymentStatus "suspended" on non-admin path → 403
 *  9. paymentStatus "suspended" on /platformAdmin path → bypass, ctx populated
 * 10. paymentStatus "cancelled" on non-admin path → 403
 */

import { describe, it, expect, mock, afterEach } from "bun:test";
import { makeHonoContext, runMiddleware } from "../tests/helpers/hono-context.factory";

// ─── Mock setup ───────────────────────────────────────────────────────────────

// org returned by findFirst by default
const mockOrg = {
  id: "org-1",
  name: "Test Org",
  paymentStatus: "active",
  connectionString: "postgresql://dummy",
};

const mockFindFirst = mock(async () => mockOrg as typeof mockOrg | undefined);
const mockGetTenantDb = mock(async (_orgId: string, _c?: unknown) => ({
  __mockTenantDb: true,
}));

// Mock the controlPanelDb shape — getControlPanelDb(c) reads c.get("controlPanelDb")
// so we inject this mock object via makeHonoContext({ controlPanelDb: ... })
const mockControlPanelDb = {
  query: {
    organizations: {
      findFirst: mockFindFirst,
    },
  },
};

// Mock @/lib/db so tenant middleware's getControlPanelDb + getTenantDb are intercepted.
// getControlPanelDb(c) checks c.get("controlPanelDb") first — we inject via context.
// getTenantDb is async and needs full mocking.
mock.module("../lib/db", () => ({
  getControlPanelDb: (_c?: unknown) => {
    // When called with a context, the real impl checks c.get("controlPanelDb").
    // We simulate that here by returning the mock directly (the context stub will
    // have it pre-populated via makeHonoContext({ controlPanelDb: mockControlPanelDb })).
    return mockControlPanelDb;
  },
  getTenantDb: mockGetTenantDb,
}));

// Import SUT after mocking
const { tenantMiddleware } = await import("./tenant.middleware");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_USER = { id: "u1", email: "user@example.com" };

/** Assert that the three tenant context values are all set */
function assertTenantContextPopulated(c: ReturnType<typeof makeHonoContext>) {
  expect(c.get("organization")).toBeDefined();
  expect(c.get("organizationId")).toBe("org-1");
  expect(c.get("tenantDb")).toBeDefined();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("tenantMiddleware", () => {
  afterEach(() => {
    mockFindFirst.mockReset();
    mockGetTenantDb.mockReset();
    // Restore default: active org
    mockFindFirst.mockImplementation(async () => ({ ...mockOrg, paymentStatus: "active" }));
    mockGetTenantDb.mockImplementation(async () => ({ __mockTenantDb: true }));
  });

  // Set initial implementations
  mockFindFirst.mockImplementation(async () => ({ ...mockOrg, paymentStatus: "active" }));
  mockGetTenantDb.mockImplementation(async () => ({ __mockTenantDb: true }));

  it("1. no user in ctx → 401 Unauthorized", async () => {
    const c = makeHonoContext({ controlPanelDb: mockControlPanelDb });
    // No user set — c.get("user") returns undefined
    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  it("2. org ID from URL param 'organizationId' → ctx populated, next called", async () => {
    const c = makeHonoContext({
      user: MOCK_USER,
      params: { organizationId: "org-1" },
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    assertTenantContextPopulated(c);
  });

  it("3. org ID from URL param 'id' → ctx populated, next called", async () => {
    const c = makeHonoContext({
      user: MOCK_USER,
      params: { id: "org-1" },
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    assertTenantContextPopulated(c);
  });

  it("4. org ID from header X-Organization-Id → ctx populated, next called", async () => {
    const c = makeHonoContext({
      user: MOCK_USER,
      headers: { "X-Organization-Id": "org-1" },
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    assertTenantContextPopulated(c);
  });

  it("5. org ID from session user.organizationId → ctx populated, next called", async () => {
    const c = makeHonoContext({
      user: { id: "u1", organizationId: "org-1" },
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    assertTenantContextPopulated(c);
  });

  it("6. no org ID anywhere → 400 'No active organization'", async () => {
    const c = makeHonoContext({
      user: MOCK_USER, // no organizationId on user, no param, no header
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 400,
      body: { error: "No active organization" },
    });
  });

  it("7. org not found in DB → 404 'Organization not found'", async () => {
    mockFindFirst.mockImplementation(async () => undefined);

    const c = makeHonoContext({
      user: MOCK_USER,
      params: { organizationId: "org-ghost" },
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 404,
      body: { error: "Organization not found" },
    });
  });

  it("8. paymentStatus 'suspended' on non-admin path → 403 with paymentStatus", async () => {
    mockFindFirst.mockImplementation(async () => ({
      ...mockOrg,
      paymentStatus: "suspended",
    }));

    const c = makeHonoContext({
      user: MOCK_USER,
      params: { organizationId: "org-1" },
      path: "/rpc/services/list",
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 403,
      body: { error: "Tenant is suspended", paymentStatus: "suspended" },
    });
  });

  it("9. paymentStatus 'suspended' on /platformAdmin path → bypass, ctx populated, next called", async () => {
    mockFindFirst.mockImplementation(async () => ({
      ...mockOrg,
      paymentStatus: "suspended",
    }));

    const c = makeHonoContext({
      user: MOCK_USER,
      params: { organizationId: "org-1" },
      path: "/rpc/platformAdmin/resumeTenant",
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    expect(c.get("organization")).toBeDefined();
    expect(c.get("organizationId")).toBe("org-1");
    expect(c.get("tenantDb")).toBeDefined();
  });

  it("10. paymentStatus 'cancelled' on non-admin path → 403 with paymentStatus", async () => {
    mockFindFirst.mockImplementation(async () => ({
      ...mockOrg,
      paymentStatus: "cancelled",
    }));

    const c = makeHonoContext({
      user: MOCK_USER,
      params: { organizationId: "org-1" },
      path: "/rpc/commissions/list",
      controlPanelDb: mockControlPanelDb,
    });

    const { response, nextCalled } = await runMiddleware(tenantMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 403,
      body: { error: "Tenant is cancelled", paymentStatus: "cancelled" },
    });
  });
});
