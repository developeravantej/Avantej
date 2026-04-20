/**
 * Integration tests for tenant-admin impersonation service.
 *
 * These tests verify the precondition guard logic in assertTenantAdminCanImpersonate.
 * They require a live tenant DB connection (TENANT_DATABASE_URL in .dev.vars).
 *
 * Full cookie-swap round-trip testing requires a browser session (Chrome E2E, Phase 7).
 * Tests that require Better-Auth are skipped here and documented as TODOs.
 *
 * @see zplan/04-19_16-40_impersonation/plan/plan.md §5 Phase 6 Task 6.8
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import {
	loadDevVars,
	createTenantDb,
	createControlPanelDb,
	shouldSkipIntegration,
} from "../helpers/integration-setup";
import { assertTenantAdminCanImpersonate } from "@avantej-core/services/tenant-admin.service";
import { members } from "@avantej-core/db/schema/tenant/members";

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

let tenantDb: ReturnType<typeof createTenantDb>;
let controlPanelDb: ReturnType<typeof createControlPanelDb>;

/** A tenant admin member found in the live dev tenant DB */
let adminMember: (typeof members.$inferSelect) | undefined;
/** A staff member found in the live dev tenant DB */
let staffMember: (typeof members.$inferSelect) | undefined;

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
	controlPanelDb = createControlPanelDb();

	// Find an admin member in the test tenant
	adminMember = await tenantDb.query.members.findFirst({
		where: eq(members.role, "admin"),
	});

	// Find a staff member in the test tenant
	staffMember = await tenantDb.query.members.findFirst({
		where: eq(members.role, "staff"),
	});

	if (!adminMember) {
		console.warn("[tenant-admin.test] No admin member found in tenant DB — some tests will skip");
	}
	if (!staffMember) {
		console.warn("[tenant-admin.test] No staff member found in tenant DB — some tests will skip");
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — happy path", () => {
	test.skipIf(shouldSkipIntegration())("resolves when admin impersonates staff", async () => {
		if (!adminMember || !staffMember) {
			console.warn("Skipping: admin or staff member not found");
			return;
		}

		const result = await assertTenantAdminCanImpersonate(
			tenantDb,
			controlPanelDb,
			adminMember.id,
			staffMember.id,
			null, // not currently impersonating
		);

		expect(result.caller.id).toBe(adminMember.id);
		expect(result.caller.role).toBe("admin");
		expect(result.target.id).toBe(staffMember.id);
		expect(result.target.role).toBe("staff");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: nested impersonation
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — nested impersonation blocked", () => {
	test.skipIf(shouldSkipIntegration())("throws FORBIDDEN when caller is already impersonating", async () => {
		if (!adminMember || !staffMember) {
			console.warn("Skipping: admin or staff member not found");
			return;
		}

		await expect(
			assertTenantAdminCanImpersonate(
				tenantDb,
				controlPanelDb,
				adminMember.id,
				staffMember.id,
				"some-existing-admin-user-id", // non-null = already impersonating
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: caller must be admin
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — caller must be admin role", () => {
	test.skipIf(shouldSkipIntegration())("throws FORBIDDEN when caller is staff role", async () => {
		if (!staffMember || !adminMember) {
			console.warn("Skipping: staff or admin member not found");
			return;
		}

		// Staff trying to impersonate admin
		await expect(
			assertTenantAdminCanImpersonate(
				tenantDb,
				controlPanelDb,
				staffMember.id, // caller is staff — must be rejected
				adminMember.id,
				null,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: target must be staff
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — target must be staff", () => {
	test.skipIf(shouldSkipIntegration())("throws FORBIDDEN when admin tries to impersonate another admin", async () => {
		if (!adminMember) {
			console.warn("Skipping: admin member not found");
			return;
		}

		// Find a second admin if available, otherwise use the same admin (self)
		const secondAdmin = await tenantDb.query.members.findFirst({
			where: eq(members.role, "admin"),
		});

		if (!secondAdmin) {
			console.warn("Skipping: no second admin found");
			return;
		}

		await expect(
			assertTenantAdminCanImpersonate(
				tenantDb,
				controlPanelDb,
				adminMember.id,
				secondAdmin.id, // target is also admin — must be rejected
				null,
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: target not found
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — target must exist", () => {
	test.skipIf(shouldSkipIntegration())("throws NOT_FOUND when target member ID does not exist", async () => {
		if (!adminMember) {
			console.warn("Skipping: admin member not found");
			return;
		}

		const nonExistentId = "00000000-0000-0000-0000-000000000001";

		await expect(
			assertTenantAdminCanImpersonate(
				tenantDb,
				controlPanelDb,
				adminMember.id,
				nonExistentId,
				null,
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// TODOs — require Better-Auth session (deferred to Chrome E2E, Phase 7)
// ─────────────────────────────────────────────────────────────────────────────

describe("tenantAdmin.impersonateMember — full session flow (TODO: Chrome E2E)", () => {
	test.skip("tenant admin impersonates staff → cookie swapped, member_sessions row created", () => {
		// TODO: Test via Chrome E2E in Phase 7.
		// Requires: active Better-Auth session cookie for franchisee@gmail.com (admin role)
		// Steps:
		//   1. POST /rpc/tenantAdmin/impersonateMember { targetMemberId, organizationId }
		//   2. Assert response has Set-Cookie header
		//   3. Assert member_sessions row exists with endedAt = null
		//   4. POST /rpc/tenantAdmin/stopImpersonating (with new cookie)
		//   5. Assert member_sessions row has endedAt != null
	});

	test.skip("tenant admin impersonating platform admin → 403", () => {
		// TODO: Test via Chrome E2E in Phase 7.
		// Requires: a staff member whose userId is also in platform_admins
	});

	test.skip("cross-tenant impersonation blocked by tenantDb scope", () => {
		// TODO: tenantDb is scoped to caller's org by orpcTenantMiddleware.
		// A targetMemberId from another org simply won't be found → NOT_FOUND (403).
	});

	test.skip("stopImpersonating → member_sessions.endedAt updated", () => {
		// TODO: Chrome E2E Phase 7.
	});
});
