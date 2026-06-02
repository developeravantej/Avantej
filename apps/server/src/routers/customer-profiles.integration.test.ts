/**
 * customer-profiles router — DB-real integration tests.
 *
 * Exercises the 4 refactored procedures against the real Neon test tenant +
 * control-panel databases:
 *   addEmailAndDispatchMagicLink (line 456)
 *   resendMagicLink              (line 572)
 *   createUnclaimed              (line 668)
 *   sendClaimLink                (line 845)
 *
 * Skipped when SKIP_INTEGRATION_TESTS=true or TENANT_DATABASE_URL is missing.
 *
 * Run: cd apps/server && bun test src/routers/customer-profiles.integration.test.ts
 *
 * ── Driver choice: HTTP vs WebSocket pool ────────────────────────────────────
 * The Neon WebSocket Pool + Drizzle relational API hangs in Bun's async
 * runtime when a relational query runs inside an oRPC handler after the pool
 * was previously used for writes. The root cause is a microtask-boundary issue
 * where the lazy query plan compilation stalls.
 *
 * Fix: the suite-level controlPanelDb uses the Neon HTTP (fetch-based) driver
 * via drizzle-orm/neon-http. HTTP driver is stateless — no connection pool,
 * no cross-call query plan cache — so there is no carry-over state between
 * tests. The WebSocket pool (via createTenantDb from integration-setup) is
 * still used for the tenant DB where the hang was not observed.
 */

import { afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { user } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import {
	TEST_BRANCH_NODE_ID,
	TEST_ORG_ID,
	createTenantDb,
	loadDevVars,
	makeIntegrationAdminContext,
	shouldSkipIntegration,
} from "../tests/helpers/integration-setup";

/**
 * Create a control-panel DB client using the Neon HTTP (fetch-based) driver.
 *
 * The HTTP driver is stateless — no WebSocket connection pool, no cross-call
 * query plan cache. This avoids the Bun/Drizzle/Neon hang that occurs when a
 * WebSocket Pool is used for writes and then a relational query runs inside an
 * oRPC handler's async context (different microtask boundary).
 */
function createTestControlPanelDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is not set in .dev.vars");
	const sql = neon(url);
	return drizzleHttp({ client: sql, schema: controlPanelSchema });
}

// Timeout for each test — remote Neon round-trips need headroom beyond the 5 s default.
const T = 30_000;

// ─── Module mocks (must precede SUT import) ───────────────────────────────────
// We mock only:
//   1. better-auth — avoid real email dispatch; signInMagicLink resolves successfully
//   2. @avantej-core/services — superset factory covering payments.test.ts cross-file pollution
//   3. gohighlevel.service — avoid loading DB layer via ghl sync chain
//   4. ghl/customer-sync-trigger — best-effort, never throws anyway

const mockSignInMagicLink = mock(async () => ({}));
const mockAuth = {
	api: { signInMagicLink: mockSignInMagicLink },
};

mock.module("../lib/better-auth", () => ({
	getBetterAuth: (_c?: unknown) => mockAuth,
}));

// NOTE: bun:test mock.module is process-global — the FIRST registration wins for
// the whole run. This factory must be a SUPERSET of all exports needed by
// every test file that could load in the same process (payments.test.ts,
// customer-profiles.test.ts). Do not remove keys without confirming no other
// file imports them.
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
	requirePermission: mock(async () => undefined),
	upsertCustomerProfile: mock(async () => undefined),
	createMember: mock(async () => undefined),
	createPackageInstance: mock(async () => ({ id: "pkg_inst_abc" })),
	assertBranchAccessible: (branchId: string, accessibleNodeIds: string[]) => {
		if (!accessibleNodeIds.includes(branchId)) {
			throw new _SharedPermissionDeniedError("branch", "access", "staff");
		}
	},
	isBranchAccessDeniedError: (err: unknown) =>
		err instanceof _SharedPermissionDeniedError,
	PermissionDeniedError: _SharedPermissionDeniedError,
	getDescendantNodeIds: mock(async () => [] as string[]),
}));

mock.module("../services/ghl/customer-sync-trigger", () => ({
	fireCustomerSync: mock(async () => ({ status: "skipped" })),
}));

// isPlaceholderEmail: replicate real logic — email ends with @ghl.placeholder
mock.module("../services/gohighlevel.service", () => ({
	isPlaceholderEmail: (email: string | null | undefined) =>
		!!email && email.endsWith("@ghl.placeholder"),
	GhlWebhookError: class GhlWebhookError extends Error {
		status: number;
		constructor(message: string, status = 500) {
			super(message);
			this.status = status;
		}
	},
}));

// ─── SUT import (after all mocks) ─────────────────────────────────────────────

const { serverCustomerProfilesRouter } = await import("./customer-profiles");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Drive an oRPC procedure handler directly, bypassing the HTTP layer.
 */
function callProcedure(
	procedure: unknown,
	input: unknown,
	context: Record<string, unknown>,
) {
	// biome-ignore lint/suspicious/noExplicitAny: test helper
	return (procedure as any)["~orpc"].handler({ input, context });
}

// Sentinel value — all test rows carry this in firstName so cleanup is precise.
const SENTINEL = "INTEGRATION_TEST";

// ─── Shared state ─────────────────────────────────────────────────────────────

let tenantDb: ReturnType<typeof createTenantDb>;
// Suite-level CP DB used ONLY for seeding and cleanup (not passed to procedures).
let controlPanelDb: ReturnType<typeof createTestControlPanelDb>;

/** IDs of user rows created during a test — cleaned up in afterEach. */
const createdUserIds: string[] = [];
/** IDs of customer_profiles rows created during a test. */
const createdProfileIds: string[] = [];
/** userIds of tenant members rows created during a test. */
const createdMemberUserIds: string[] = [];

// ─── Suite setup ─────────────────────────────────────────────────────────────

describe.skipIf(shouldSkipIntegration())(
	"customer-profiles router — DB integration",
	() => {
		beforeAll(async () => {
			loadDevVars();
			tenantDb = createTenantDb();
			controlPanelDb = createTestControlPanelDb();
			// Verify connectivity — also initializes the Drizzle relational schema cache.
			await controlPanelDb.select({ id: user.id }).from(user).limit(0);
		});

		afterEach(async () => {
			// Precise cleanup keyed on sentinel; order matters due to FK chains.

			// 1. Tenant customer_profiles (no FK deps on other test rows)
			if (createdProfileIds.length > 0) {
				await tenantDb
					.delete(customerProfiles)
					.where(inArray(customerProfiles.id, createdProfileIds));
				createdProfileIds.length = 0;
			}

			// 2. Tenant members rows (keyed by userId)
			if (createdMemberUserIds.length > 0) {
				await tenantDb
					.delete(members)
					.where(inArray(members.userId, createdMemberUserIds));
				createdMemberUserIds.length = 0;
			}

			// 3. Control-panel user rows
			if (createdUserIds.length > 0) {
				await controlPanelDb
					.delete(user)
					.where(inArray(user.id, createdUserIds));
				createdUserIds.length = 0;
			}

			// Reset the mock call counts after each test so assertions are isolated.
			mockSignInMagicLink.mockReset();
			mockSignInMagicLink.mockImplementation(async () => ({}));
		});

		// ── Fixture helpers ──────────────────────────────────────────────────────

		/** Seed a control-panel user and register it for cleanup. */
		async function seedCpUser(opts: {
			email: string;
			emailVerified?: boolean;
		}) {
			const id = crypto.randomUUID();
			const now = new Date();
			await controlPanelDb.insert(user).values({
				id,
				name: `${SENTINEL} User`,
				firstName: SENTINEL,
				lastName: "User",
				email: opts.email,
				emailVerified: opts.emailVerified ?? false,
				createdAt: now,
				updatedAt: now,
			});
			createdUserIds.push(id);
			return id;
		}

		/**
		 * Seed a tenant customer_profile row and register it for cleanup.
		 * Does NOT create a members row — use createUnclaimed or seedMember when needed.
		 */
		async function seedProfile(opts: {
			userId: string | null;
			isUnclaimed?: boolean;
			phone?: string;
		}) {
			const [inserted] = await tenantDb
				.insert(customerProfiles)
				.values({
					userId: opts.userId,
					phone: opts.phone ?? null,
					isUnclaimed: opts.isUnclaimed ?? false,
				})
				.returning({ id: customerProfiles.id });
			if (!inserted) throw new Error("seedProfile: insert returned nothing");
			createdProfileIds.push(inserted.id);
			return inserted.id;
		}

		/**
		 * Build the context object expected by procedures.
		 *
		 * Returns both the context AND the CP DB instance so callers can pass
		 * it to primeCtxCpDb() for API consistency. With the HTTP driver there is
		 * no pool state to prime, but the pattern is preserved for readability.
		 */
		function makeContext() {
			const adminCtx = makeIntegrationAdminContext(tenantDb);
			const ctx = {
				...adminCtx,
				honoContext: {
					get: (key: string) =>
						key === "controlPanelDb" ? controlPanelDb : undefined,
					req: { raw: { headers: new Headers() } },
				} as unknown,
			};
			return { ctx, ctxCpDb: controlPanelDb };
		}

		/**
		 * No-op with the HTTP driver — kept for test readability consistency.
		 *
		 * Previously this was needed to warm up a WebSocket Pool's Drizzle query
		 * plan before calling a procedure. The HTTP driver is stateless, so no
		 * priming is needed. The call is harmless.
		 */
		async function primeCtxCpDb(
			cpDb: ReturnType<typeof createTestControlPanelDb>,
		) {
			await cpDb.select({ id: user.id }).from(user).limit(0);
		}

		// ─── addEmailAndDispatchMagicLink ─────────────────────────────────────────

		describe("addEmailAndDispatchMagicLink", () => {
			it(
				"happy path: updates placeholder email, flips emailVerified, dispatches magic-link",
				async () => {
					const userId = await seedCpUser({
						email: `ghl-contact-${Date.now()}@ghl.placeholder`,
						emailVerified: false,
					});
					const profileId = await seedProfile({ userId });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					const realEmail = `integration-test-${Date.now()}@example.com`;

					const result = await callProcedure(
						serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
						{
							organizationId: TEST_ORG_ID,
							customerProfileId: profileId,
							email: realEmail,
						},
						ctx,
					);

					expect(result.success).toBe(true);
					expect(result.email).toBe(realEmail);

					// Assert: DB write — user email updated, emailVerified flipped to true
					const updatedUser = await controlPanelDb.query.user.findFirst({
						where: eq(user.id, userId),
					});
					expect(updatedUser?.email).toBe(realEmail);
					expect(updatedUser?.emailVerified).toBe(true);

					// Assert: magic-link dispatch was called once with the new email
					expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
					// biome-ignore lint/suspicious/noExplicitAny: bun mock call args
					const callArg = (mockSignInMagicLink.mock.calls[0] as any)?.[0];
					expect(callArg?.body?.email).toBe(realEmail);
				},
				T,
			);

			it(
				"rejects when profile does not exist",
				async () => {
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: "00000000-dead-4000-8000-000000000000",
								email: "nobody@example.com",
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "NOT_FOUND" });
				},
				T,
			);

			it(
				"rejects when user already has a real (non-placeholder) email",
				async () => {
					const ts = Date.now();
					const userId = await seedCpUser({
						email: `real-email-${ts}@example.com`,
						emailVerified: true,
					});
					const profileId = await seedProfile({ userId });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
								email: `another-${ts}@example.com`,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "BAD_REQUEST" });
				},
				T,
			);

			it(
				"rejects when target email is already taken by a different user",
				async () => {
					const userId = await seedCpUser({
						email: `ghl-collision-${Date.now()}@ghl.placeholder`,
						emailVerified: false,
					});
					const profileId = await seedProfile({ userId });

					const collisionEmail = `collision-${Date.now()}@example.com`;
					await seedCpUser({ email: collisionEmail });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
								email: collisionEmail,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "CONFLICT" });
				},
				T,
			);

			it(
				"rejects when profile has no userId (dependent profile)",
				async () => {
					const profileId = await seedProfile({ userId: null });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.addEmailAndDispatchMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
								email: `dep-${Date.now()}@example.com`,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "BAD_REQUEST" });
				},
				T,
			);
		});

		// ─── resendMagicLink ──────────────────────────────────────────────────────

		describe("resendMagicLink", () => {
			it(
				"happy path: dispatches magic-link to the user's existing real email",
				async () => {
					const realEmail = `resend-happy-${Date.now()}@example.com`;
					const userId = await seedCpUser({
						email: realEmail,
						emailVerified: true,
					});
					const profileId = await seedProfile({ userId });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					const result = await callProcedure(
						serverCustomerProfilesRouter.resendMagicLink,
						{
							organizationId: TEST_ORG_ID,
							customerProfileId: profileId,
						},
						ctx,
					);

					expect(result.success).toBe(true);
					expect(result.email).toBe(realEmail);
					expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
					// biome-ignore lint/suspicious/noExplicitAny: bun mock call args
					const callArg = (mockSignInMagicLink.mock.calls[0] as any)?.[0];
					expect(callArg?.body?.email).toBe(realEmail);
				},
				T,
			);

			it(
				"rejects when profile not found",
				async () => {
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.resendMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: "00000000-dead-4001-8000-000000000000",
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "NOT_FOUND" });
				},
				T,
			);

			it(
				"rejects when user has placeholder email (staff must use addEmailAndDispatchMagicLink first)",
				async () => {
					const userId = await seedCpUser({
						email: `ghl-resend-guard-${Date.now()}@ghl.placeholder`,
						emailVerified: false,
					});
					const profileId = await seedProfile({ userId });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.resendMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "BAD_REQUEST" });
				},
				T,
			);

			it(
				"rejects when profile is a dependent (no userId)",
				async () => {
					const profileId = await seedProfile({ userId: null });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.resendMagicLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "BAD_REQUEST" });
				},
				T,
			);
		});

		// ─── createUnclaimed ──────────────────────────────────────────────────────

		describe("createUnclaimed", () => {
			it(
				"happy path: creates CP user + tenant member + customer_profile, returns IDs",
				async () => {
					const phone = `+6011${Date.now().toString().slice(-8)}`;
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);

					const result = await callProcedure(
						serverCustomerProfilesRouter.createUnclaimed,
						{
							organizationId: TEST_ORG_ID,
							firstName: SENTINEL,
							lastName: "Unclaimed",
							phone,
							hierarchyScopeId: TEST_BRANCH_NODE_ID,
						},
						ctx,
					);

					expect(typeof result.profileId).toBe("string");
					expect(typeof result.userId).toBe("string");
					expect(typeof result.memberId).toBe("string");

					// Register for cleanup
					createdProfileIds.push(result.profileId);
					createdMemberUserIds.push(result.userId);
					createdUserIds.push(result.userId);

					// Assert: customer_profile row exists and is unclaimed
					const profile = await tenantDb.query.customerProfiles.findFirst({
						where: eq(customerProfiles.id, result.profileId),
					});
					expect(profile).toBeDefined();
					expect(profile?.isUnclaimed).toBe(true);
					expect(profile?.phone).toBe(phone);

					// Assert: tenant members row exists with role=client
					const member = await tenantDb.query.members.findFirst({
						where: eq(members.userId, result.userId),
					});
					expect(member).toBeDefined();
					expect(member?.role).toBe("client");
					expect(member?.hierarchyScopeId).toBe(TEST_BRANCH_NODE_ID);

					// Assert: control-panel user row exists with a placeholder email
					const cpUser = await controlPanelDb.query.user.findFirst({
						where: eq(user.id, result.userId),
					});
					expect(cpUser).toBeDefined();
					expect(cpUser?.email).toContain("avantej.placeholder");
					expect(cpUser?.firstName).toBe(SENTINEL);
				},
				T,
			);

			it(
				"happy path with explicit real email: stores the supplied email directly",
				async () => {
					const phone = `+6012${Date.now().toString().slice(-8)}`;
					const realEmail = `unclaimed-with-email-${Date.now()}@example.com`;
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);

					const result = await callProcedure(
						serverCustomerProfilesRouter.createUnclaimed,
						{
							organizationId: TEST_ORG_ID,
							firstName: SENTINEL,
							lastName: "WithEmail",
							phone,
							hierarchyScopeId: TEST_BRANCH_NODE_ID,
							email: realEmail,
						},
						ctx,
					);

					createdProfileIds.push(result.profileId);
					createdMemberUserIds.push(result.userId);
					createdUserIds.push(result.userId);

					const cpUser = await controlPanelDb.query.user.findFirst({
						where: eq(user.id, result.userId),
					});
					expect(cpUser?.email).toBe(realEmail);
				},
				T,
			);

			it(
				"is idempotent when phone already belongs to an active profile (returns existing profile)",
				async () => {
					const phone = `+6013${Date.now().toString().slice(-8)}`;
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);

					// Create first profile with this phone via the procedure
					const first = await callProcedure(
						serverCustomerProfilesRouter.createUnclaimed,
						{
							organizationId: TEST_ORG_ID,
							firstName: SENTINEL,
							lastName: "PhoneDedup1",
							phone,
							hierarchyScopeId: TEST_BRANCH_NODE_ID,
						},
						ctx,
					);
					createdProfileIds.push(first.profileId);
					createdMemberUserIds.push(first.userId);
					createdUserIds.push(first.userId);

					// Second attempt with same phone returns the EXISTING profile (idempotent,
					// not a CONFLICT error). This is the CU-006 design: double-submit safety.
					const second = await callProcedure(
						serverCustomerProfilesRouter.createUnclaimed,
						{
							organizationId: TEST_ORG_ID,
							firstName: SENTINEL,
							lastName: "PhoneDedup2",
							phone,
							hierarchyScopeId: TEST_BRANCH_NODE_ID,
						},
						ctx,
					);
					// Must return the same profileId — no duplicate created
					expect(second.profileId).toBe(first.profileId);
				},
				T,
			);

			it(
				"rejects when supplied email is already taken by another CP user",
				async () => {
					const existingEmail = `existing-cp-${Date.now()}@example.com`;
					await seedCpUser({ email: existingEmail });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.createUnclaimed,
							{
								organizationId: TEST_ORG_ID,
								firstName: SENTINEL,
								lastName: "EmailConflict",
								phone: `+6014${Date.now().toString().slice(-8)}`,
								hierarchyScopeId: TEST_BRANCH_NODE_ID,
								email: existingEmail,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "CONFLICT" });
				},
				T,
			);
		});

		// ─── sendClaimLink ────────────────────────────────────────────────────────

		describe("sendClaimLink", () => {
			it(
				"happy path: swaps placeholder email, dispatches magic-link, clears isUnclaimed flag",
				async () => {
					// Arrange: create a real unclaimed profile via createUnclaimed
					const phone = `+6015${Date.now().toString().slice(-8)}`;
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);

					const created = await callProcedure(
						serverCustomerProfilesRouter.createUnclaimed,
						{
							organizationId: TEST_ORG_ID,
							firstName: SENTINEL,
							lastName: "ClaimLink",
							phone,
							hierarchyScopeId: TEST_BRANCH_NODE_ID,
						},
						ctx,
					);
					createdProfileIds.push(created.profileId);
					createdMemberUserIds.push(created.userId);
					createdUserIds.push(created.userId);

					const claimEmail = `claim-${Date.now()}@example.com`;

					const result = await callProcedure(
						serverCustomerProfilesRouter.sendClaimLink,
						{
							organizationId: TEST_ORG_ID,
							customerProfileId: created.profileId,
							email: claimEmail,
						},
						ctx,
					);

					expect(result.success).toBe(true);
					expect(result.email).toBe(claimEmail);

					expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
					// biome-ignore lint/suspicious/noExplicitAny: bun mock call args
					const callArg = (mockSignInMagicLink.mock.calls[0] as any)?.[0];
					expect(callArg?.body?.email).toBe(claimEmail);

					// Assert: isUnclaimed cleared in DB
					const profile = await tenantDb.query.customerProfiles.findFirst({
						where: eq(customerProfiles.id, created.profileId),
					});
					expect(profile?.isUnclaimed).toBe(false);

					// Assert: CP user email updated and verified
					const cpUser = await controlPanelDb.query.user.findFirst({
						where: eq(user.id, created.userId),
					});
					expect(cpUser?.email).toBe(claimEmail);
					expect(cpUser?.emailVerified).toBe(true);
				},
				T,
			);

			it(
				"rejects when profile not found",
				async () => {
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.sendClaimLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: "00000000-dead-4002-8000-000000000000",
								email: `claim-noprofile-${Date.now()}@example.com`,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "NOT_FOUND" });
				},
				T,
			);

			it(
				"rejects when profile is already claimed (isUnclaimed=false)",
				async () => {
					const userId = await seedCpUser({
						email: `already-claimed-${Date.now()}@example.com`,
						emailVerified: true,
					});
					const profileId = await seedProfile({ userId, isUnclaimed: false });

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.sendClaimLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
								email: `claim-again-${Date.now()}@example.com`,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "BAD_REQUEST" });
				},
				T,
			);

			it(
				"rejects when the target email is already taken by a different CP user",
				async () => {
					const phone = `+6016${Date.now().toString().slice(-8)}`;
					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);

					const created = await callProcedure(
						serverCustomerProfilesRouter.createUnclaimed,
						{
							organizationId: TEST_ORG_ID,
							firstName: SENTINEL,
							lastName: "ClaimCollision",
							phone,
							hierarchyScopeId: TEST_BRANCH_NODE_ID,
						},
						ctx,
					);
					createdProfileIds.push(created.profileId);
					createdMemberUserIds.push(created.userId);
					createdUserIds.push(created.userId);

					const takenEmail = `taken-claim-${Date.now()}@example.com`;
					await seedCpUser({ email: takenEmail });

					await expect(
						callProcedure(
							serverCustomerProfilesRouter.sendClaimLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: created.profileId,
								email: takenEmail,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "CONFLICT" });
				},
				T,
			);

			it(
				"rejects when profile is a dependent (no userId)",
				async () => {
					const profileId = await seedProfile({
						userId: null,
						isUnclaimed: true,
					});

					const { ctx, ctxCpDb } = makeContext();
					await primeCtxCpDb(ctxCpDb);
					await expect(
						callProcedure(
							serverCustomerProfilesRouter.sendClaimLink,
							{
								organizationId: TEST_ORG_ID,
								customerProfileId: profileId,
								email: `dep-claim-${Date.now()}@example.com`,
							},
							ctx,
						),
					).rejects.toMatchObject({ code: "BAD_REQUEST" });
				},
				T,
			);
		});
	},
);
