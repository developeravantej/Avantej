/**
 * Tenant Admin Service
 *
 * Business logic for tenant-admin impersonation.
 * Guards all preconditions before allowing a tenant admin to impersonate a staff member.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { members } from "@avantej-core/db/schema/tenant/members";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { ORPCError } from "@orpc/server";

type TenantDb = NeonDatabase<typeof tenantSchema>;
type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

/**
 * Checks all preconditions for a tenant admin to impersonate a staff member.
 *
 * Enforces:
 * - Caller is not already impersonating (no nested impersonation)
 * - Caller member has role === 'admin' in the current tenant DB
 * - Target member exists in the SAME tenant DB (cross-tenant blocked automatically)
 * - Target member has role === 'staff' (tenant admin → tenant admin blocked)
 * - Target user is NOT in platform_admins (blocked via control-panel lookup)
 *
 * Throws ORPCError('FORBIDDEN') on any violation, ORPCError('NOT_FOUND') if
 * target member does not exist.
 *
 * @returns { caller, target } — validated member rows for use in the router handler
 */
export async function assertTenantAdminCanImpersonate(
	tenantDb: TenantDb,
	controlPanelDb: ControlPanelDb,
	callerMemberId: string,
	targetMemberId: string,
	currentSessionImpersonatedBy: string | null | undefined,
): Promise<{
	caller: typeof members.$inferSelect;
	target: typeof members.$inferSelect;
}> {
	// Prevent nested impersonation
	if (currentSessionImpersonatedBy) {
		throw new ORPCError("FORBIDDEN", {
			message:
				"Cannot impersonate while already impersonating. Stop the current impersonation first.",
		});
	}

	// Caller must be a tenant admin
	const caller = await tenantDb.query.members.findFirst({
		where: eq(members.id, callerMemberId),
	});

	if (!caller) {
		throw new ORPCError("FORBIDDEN", {
			message: "Caller member record not found in this organization.",
		});
	}

	if (caller.role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Tenant admin role required to impersonate a staff member.",
		});
	}

	// Target must exist in the SAME tenant DB (prevents cross-tenant by design —
	// tenantDb is already scoped to the caller's org by orpcTenantMiddleware)
	const target = await tenantDb.query.members.findFirst({
		where: eq(members.id, targetMemberId),
	});

	if (!target) {
		throw new ORPCError("NOT_FOUND", {
			message: "Target member not found in this organization.",
		});
	}

	// Target must be staff — prevents tenant-admin → tenant-admin escalation
	if (target.role !== "staff") {
		throw new ORPCError("FORBIDDEN", {
			message:
				"Can only impersonate staff members (not other admins or trainers).",
		});
	}

	// Target must not be a platform admin — cross-privilege escalation guard
	const targetPlatformAdmin =
		await controlPanelDb.query.platformAdmins.findFirst({
			where: eq(platformAdmins.userId, target.userId),
		});

	if (targetPlatformAdmin) {
		throw new ORPCError("FORBIDDEN", {
			message: "Cannot impersonate platform admins.",
		});
	}

	return { caller, target };
}
