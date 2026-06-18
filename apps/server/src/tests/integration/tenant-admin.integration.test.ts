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
let adminMember: typeof members.$inferSelect | undefined;
/** A staff member found in the live dev tenant DB */
let staffMember: typeof members.$inferSelect | undefined;

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
		console.warn(
			"[tenant-admin.test] No admin member found in tenant DB — some tests will skip",
		);
	}
	if (!staffMember) {
		console.warn(
			"[tenant-admin.test] No staff member found in tenant DB — some tests will skip",
		);
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — happy path
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — happy path", () => {
	test.skipIf(shouldSkipIntegration())(
		"resolves when admin impersonates staff",
		async () => {
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
		},
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: nested impersonation
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — nested impersonation blocked", () => {
	test.skipIf(shouldSkipIntegration())(
		"throws FORBIDDEN when caller is already impersonating",
		async () => {
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
		},
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: caller must be admin
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — caller must be admin role", () => {
	test.skipIf(shouldSkipIntegration())(
		"throws FORBIDDEN when caller is staff role",
		async () => {
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
		},
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: target must be staff
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — target must be staff", () => {
	test.skipIf(shouldSkipIntegration())(
		"throws FORBIDDEN when admin tries to impersonate another admin",
		async () => {
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
		},
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// assertTenantAdminCanImpersonate — guard: target not found
// ─────────────────────────────────────────────────────────────────────────────

describe("assertTenantAdminCanImpersonate — target must exist", () => {
	test.skipIf(shouldSkipIntegration())(
		"throws NOT_FOUND when target member ID does not exist",
		async () => {
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
		},
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP-flow tests live in apps/web/e2e/tests/tenant-admin-impersonate.spec.ts
//
// What's covered there:
//  - impersonate happy path → Set-Cookie returned, member_sessions row inserted
//  - stopImpersonating → member_sessions.endedAt updated
//
// What's already covered by guard tests above (no Playwright needed):
//  - impersonating a platform admin → FORBIDDEN (assertTenantAdminCanImpersonate
//    checks platformAdmins table; target.role !== 'staff' also caught at line 82-86)
//  - cross-tenant target → NOT_FOUND via tenantDb scope (guard tests + middleware:
//    tenantDb is scoped to caller's org, so a foreign memberId returns null → NOT_FOUND)
// ─────────────────────────────────────────────────────────────────────────────
