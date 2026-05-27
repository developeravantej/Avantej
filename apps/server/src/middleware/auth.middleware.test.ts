/**
 * auth.middleware tests
 *
 * Scenarios (4):
 *  1. Valid session → c.set("user") + c.set("session"), next called, no early response
 *  2. session is null → 401 "Unauthorized", next NOT called
 *  3. session.user is null → 401 "Unauthorized", next NOT called
 *  4. getSession throws → 401 "Unauthorized" + console.error called, next NOT called
 *
 * Mocking strategy: `mock.module("../lib/better-auth", ...)` — relative path is required;
 * `@/lib/better-auth` aliases are unreliable in bun:test's module mock.
 */

import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { makeHonoContext, runMiddleware } from "../tests/helpers/hono-context.factory";

// ─── Mock setup ───────────────────────────────────────────────────────────────

// Default: returns null (no session). Each test overrides via .mockImplementationOnce.
const mockGetSession = mock(async () => null as unknown);

const mockAuth = {
  api: {
    getSession: mockGetSession,
  },
};

mock.module("../lib/better-auth", () => ({
  getBetterAuth: (_c?: unknown) => mockAuth,
}));

// Import SUT after mocking
const { authMiddleware } = await import("./auth.middleware");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_USER = { id: "u1", email: "user@example.com" };
const MOCK_SESSION_RECORD = { id: "sess_1", token: "tok_abc", userId: "u1" };

afterEach(() => {
  mockGetSession.mockReset();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  it("injects user + session and calls next on valid session", async () => {
    mockGetSession.mockImplementationOnce(async () => ({
      user: MOCK_USER,
      session: MOCK_SESSION_RECORD,
    }));

    const c = makeHonoContext();
    const { response, nextCalled } = await runMiddleware(authMiddleware, c);

    expect(nextCalled).toBe(true);
    expect(response).toBeUndefined();
    expect(c.get("user")).toEqual(MOCK_USER);
    expect(c.get("session")).toEqual(MOCK_SESSION_RECORD);
  });

  it("returns 401 when getSession resolves to null", async () => {
    mockGetSession.mockImplementationOnce(async () => null);

    const c = makeHonoContext();
    const { response, nextCalled } = await runMiddleware(authMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 401,
      body: { error: "Unauthorized" },
    });
    expect(c.get("user")).toBeUndefined();
    expect(c.get("session")).toBeUndefined();
  });

  it("returns 401 when session.user is null", async () => {
    mockGetSession.mockImplementationOnce(async () => ({
      user: null,
      session: MOCK_SESSION_RECORD,
    }));

    const c = makeHonoContext();
    const { response, nextCalled } = await runMiddleware(authMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 401,
      body: { error: "Unauthorized" },
    });
    expect(c.get("user")).toBeUndefined();
  });

  it("returns 401 and logs error when getSession throws", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    mockGetSession.mockImplementationOnce(async () => {
      throw new Error("better-auth boom");
    });

    const c = makeHonoContext();
    const { response, nextCalled } = await runMiddleware(authMiddleware, c);

    expect(nextCalled).toBe(false);
    expect(response).toMatchObject({
      __response: true,
      status: 401,
      body: { error: "Unauthorized" },
    });
    expect(consoleSpy).toHaveBeenCalled();
    const firstCallArgs = consoleSpy.mock.calls[0];
    expect(firstCallArgs?.[0]).toBe("Auth middleware error:");

    consoleSpy.mockRestore();
  });
});
