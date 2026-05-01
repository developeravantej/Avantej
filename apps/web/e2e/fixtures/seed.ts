/**
 * E2E Seed / Teardown
 *
 * Sets up per-run isolated test data:
 *  - A fresh branch hierarchy node (unique name via Date.now() suffix)
 *  - A fresh client user (via Better-Auth signUp) as a member of that branch
 *
 * Admin credentials are the existing dev tenant credentials from CLAUDE.md:
 *   franchisee@gmail.com / password123
 * These already have admin role + full permissions including user_management:update.
 *
 * Tear-down removes rows in FK-safe order (contact_links → member → user → branch).
 * Each table deletion is wrapped in try/catch so partial seeds don't block cleanup.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDescendantNodeIds } from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { getControlPanelDb, getTenantDb } from "./db";
import { signUpUser } from "./auth";

// Dev admin credentials — from CLAUDE.md test credentials.
// These already have admin role + user_management:update in the dev tenant.
export const DEV_ADMIN_EMAIL = "franchisee@gmail.com";
export const DEV_ADMIN_PASSWORD = "password123";

export interface E2ETestFixture {
	/** Dev org UUID (looked up from control panel) */
	organizationId: string;
	/** Existing not-connected branch reused for this test run */
	branchNodeId: string;
	branchName: string;
	/** True if seed created the branch (rare); false if reused existing */
	branchCreated: boolean;
	/** Fresh client user created for this run */
	clientUserId: string;
	clientEmail: string;
	clientPassword: string;
	/** Member row ID for the client user */
	clientMemberId: string;
}

export async function seedE2EFixture(): Promise<E2ETestFixture> {
	const cp = getControlPanelDb();
	const t = await getTenantDb();
	const suffix = Date.now();

	// ── 1. Resolve dev organization UUID ───────────────────────────────────
	// The dev tenant is the first org in the control panel DB.
	const org = await cp.query.organizations.findFirst();
	if (!org) {
		throw new Error(
			"No organization found in control panel DB. Run seed-rbac first.",
		);
	}

	// ── 2. Find an existing branch the dev admin can access ───────────────
	// Inserting a fresh branch fails because the dev admin's accessibleNodeIds
	// is computed from member.hierarchyScopeId at request time and a brand-new
	// branch under root may sit outside the admin's scope. Easier path: reuse
	// an existing branch whose ghl_branch_links row we'll create + clean up.
	// We deliberately AVOID branches that already have an active ghl_branch_link
	// (so the test always exercises the "Connect" flow, not "Disconnect first").
	const adminUser = await cp.query.user.findFirst({
		where: eq(userTable.email, DEV_ADMIN_EMAIL),
	});
	if (!adminUser) {
		throw new Error(`Dev admin user ${DEV_ADMIN_EMAIL} not found in control panel`);
	}
	const adminMember = await t.query.members.findFirst({
		where: eq(members.userId, adminUser.id),
	});
	if (!adminMember) {
		throw new Error(`Dev admin has no member record in tenant DB`);
	}
	const accessibleIds = await getDescendantNodeIds(t, adminMember.hierarchyScopeId);
	const branches = await t.query.hierarchyNodes.findMany({
		where: and(
			eq(hierarchyNodes.type, "branch"),
			inArray(hierarchyNodes.id, accessibleIds),
		),
	});
	if (branches.length === 0) {
		throw new Error(
			"No branches in dev tenant. Seed at least one branch via the admin UI before running E2E.",
		);
	}
	const existingLinks = await cp.query.ghlBranchLinks.findMany({
		where: eq(ghlBranchLinks.organizationId, org.id),
	});
	const connectedBranchIds = new Set(
		existingLinks.filter((l) => l.isActive).map((l) => l.tenantBranchId),
	);
	const branch = branches.find((b) => !connectedBranchIds.has(b.id));
	if (!branch) {
		throw new Error(
			`All ${branches.length} branches already have active GHL connections. Disconnect one before re-running E2E.`,
		);
	}
	const branchName = branch.name;
	const branchCreated = false;

	// ── 4. Create fresh client user via Better-Auth ────────────────────────
	const clientUser = await signUpUser(suffix, "client");

	// ── 5. Insert member row for client (role=client, scoped to branch) ────
	const [clientMember] = await t
		.insert(members)
		.values({
			userId: clientUser.userId,
			role: "client",
			hierarchyScopeId: branch.id,
			status: "active",
		})
		.returning();
	if (!clientMember) throw new Error("Failed to insert client member row");

	return {
		organizationId: org.id,
		branchNodeId: branch.id,
		branchName,
		branchCreated,
		clientUserId: clientUser.userId,
		clientEmail: clientUser.email,
		clientPassword: clientUser.password,
		clientMemberId: clientMember.id,
	};
}

export async function teardownE2EFixture(fixture: E2ETestFixture): Promise<void> {
	const cp = getControlPanelDb();
	const t = await getTenantDb();

	// Delete in FK-safe order: leaves before parents

	// 1. GHL contact links (references customer_profiles + branch)
	try {
		await t
			.delete(ghlContactLinks)
			.where(eq(ghlContactLinks.branchNodeId, fixture.branchNodeId));
	} catch (e) {
		console.warn("[teardown] ghlContactLinks:", e);
	}

	// 2. Customer profile for the client user
	try {
		await t
			.delete(customerProfiles)
			.where(eq(customerProfiles.userId, fixture.clientUserId));
	} catch (e) {
		console.warn("[teardown] customerProfiles:", e);
	}

	// 3. Client member record
	try {
		await t.delete(members).where(eq(members.id, fixture.clientMemberId));
	} catch (e) {
		console.warn("[teardown] members:", e);
	}

	// 4. GHL branch link written by checkpoint 1
	try {
		await cp
			.delete(ghlBranchLinks)
			.where(
				and(
					eq(ghlBranchLinks.organizationId, fixture.organizationId),
					eq(ghlBranchLinks.tenantBranchId, fixture.branchNodeId),
				),
			);
	} catch (e) {
		console.warn("[teardown] ghlBranchLinks:", e);
	}

	// 5. Branch hierarchy node — only delete if WE created it
	if (fixture.branchCreated) {
		try {
			await t
				.delete(hierarchyNodes)
				.where(eq(hierarchyNodes.id, fixture.branchNodeId));
		} catch (e) {
			console.warn("[teardown] hierarchyNodes:", e);
		}
	}

	// 6. Client user in control panel (auth table)
	try {
		await cp.delete(userTable).where(eq(userTable.id, fixture.clientUserId));
	} catch (e) {
		console.warn("[teardown] user:", e);
	}
}
