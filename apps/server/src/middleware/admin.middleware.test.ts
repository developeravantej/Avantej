/**
 * admin.middleware tests
 *
 * adminMiddleware scenarios (6):
 *  1. No user in ctx → 401
 *  2. findFirst returns undefined (no admin row) → 403 "Forbidden: Admin access required"
 *  3. role "support" → ctx populated, next called
 *  4. role "billing" → ctx populated, next called
 *  5. role "super_admin" → ctx populated, next called
 *  6. findFirst throws → 500 "Failed to validate admin access"
 *
 * superAdminMiddleware scenarios (5):
 *  1. No user → 401
 *  2. No admin row → 403 "Forbidden: Super admin access required"
 *  3. Role "support" → 403 "Forbidden: Super admin access required"
 *  4. Role "billing" → 403 "Forbidden: Super admin access required"
 *  5. Role "super_admin" → ctx populated, next called
 */

import { describe, it, expect, mock, afterEach } from "bun:test";
import { makeHonoContext, runMiddleware } from "../tests/helpers/hono-context.factory";

// ─── Mock setup ───────────────────────────────────────────────────────────────

const mockAdminFindFirst = mock(async () => null as unknown);

const mockControlPanelDb = {
  query: {
    platformAdmins: {
      findFirst: mockAdminFindFirst,
    },
  },
};

mock.module("../lib/db", () => ({
  getControlPanelDb: (_c?: unknown) => mockControlPanelDb,
  getTenantDb: mock(async () => ({ __mockTenantDb: true })),
}));

// Import SUT after mocking
const { adminMiddleware, superAdminMiddleware } = await import("./admin.middleware");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_USER = { id: "u1", email: "admin@example.com" };

function makeAdminRecord(role: string) {
  return { userId: "u1", role, createdAt: new Date() };
}

// ─── adminMiddleware tests ───────────────────────────────────────────────────

describe("adminMiddleware", () => {
  afterEach(() => {
    mockAdminFindFirst.mockReset();
  });

  it("1. no user in ctx → 401 Unauthorized", async () => {
    const c = makeHonoContext({ controlPanelDb: mockControlPanelDb });
    // No user pre-populated
    const { response, nextCalled } = await runMiddleware(adminMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  it("2. no admin row → 403 'Forbidden: Admin access required'", async () => {
    mockAdminFindFirst.mockImplementation(async () => undefined);

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(adminMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 403,
      body: { error: "Forbidden: Admin access required" },
    });
  });

  it("3. role 'support' → adminRecord + adminRole set in ctx, next called", async () => {
    const adminRecord = makeAdminRecord("support");
    mockAdminFindFirst.mockImplementation(async () => adminRecord);

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(adminMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    expect(c.get("adminRecord")).toEqual(adminRecord);
    expect(c.get("adminRole")).toBe("support");
  });

  it("4. role 'billing' → adminRecord + adminRole set in ctx, next called", async () => {
    const adminRecord = makeAdminRecord("billing");
    mockAdminFindFirst.mockImplementation(async () => adminRecord);

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(adminMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    expect(c.get("adminRecord")).toEqual(adminRecord);
    expect(c.get("adminRole")).toBe("billing");
  });

  it("5. role 'super_admin' → adminRecord + adminRole set in ctx, next called", async () => {
    const adminRecord = makeAdminRecord("super_admin");
    mockAdminFindFirst.mockImplementation(async () => adminRecord);

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(adminMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    expect(c.get("adminRecord")).toEqual(adminRecord);
    expect(c.get("adminRole")).toBe("super_admin");
  });

  it("6. findFirst throws → 500 'Failed to validate admin access'", async () => {
    const originalConsoleError = console.error;
    const capturedErrors: unknown[][] = [];
    console.error = mock((...args: unknown[]) => capturedErrors.push(args));

    mockAdminFindFirst.mockImplementation(async () => {
      throw new Error("DB connection failed");
    });

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(adminMiddleware, c);

    console.error = originalConsoleError;

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 500,
      body: { error: "Failed to validate admin access" },
    });
  });
});

// ─── superAdminMiddleware tests ──────────────────────────────────────────────

describe("superAdminMiddleware", () => {
  afterEach(() => {
    mockAdminFindFirst.mockReset();
  });

  it("1. no user in ctx → 401 Unauthorized", async () => {
    const c = makeHonoContext({ controlPanelDb: mockControlPanelDb });
    const { response, nextCalled } = await runMiddleware(superAdminMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 401,
      body: { error: "Unauthorized" },
    });
  });

  it("2. no admin row → 403 'Forbidden: Super admin access required'", async () => {
    mockAdminFindFirst.mockImplementation(async () => undefined);

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(superAdminMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 403,
      body: { error: "Forbidden: Super admin access required" },
    });
  });

  it("3. role 'support' → 403 'Forbidden: Super admin access required'", async () => {
    mockAdminFindFirst.mockImplementation(async () => makeAdminRecord("support"));

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(superAdminMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 403,
      body: { error: "Forbidden: Super admin access required" },
    });
  });

  it("4. role 'billing' → 403 'Forbidden: Super admin access required'", async () => {
    mockAdminFindFirst.mockImplementation(async () => makeAdminRecord("billing"));

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(superAdminMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 403,
      body: { error: "Forbidden: Super admin access required" },
    });
  });

  it("5. role 'super_admin' → adminRecord + adminRole set in ctx, next called", async () => {
    const adminRecord = makeAdminRecord("super_admin");
    mockAdminFindFirst.mockImplementation(async () => adminRecord);

    const c = makeHonoContext({
      user: MOCK_USER,
      controlPanelDb: mockControlPanelDb,
    });
    const { response, nextCalled } = await runMiddleware(superAdminMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    expect(c.get("adminRecord")).toEqual(adminRecord);
    expect(c.get("adminRole")).toBe("super_admin");
  });
});
