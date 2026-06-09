/**
 * Member Context Helper
 *
 * Shared lookup for resolving a member record + accessible node IDs from a
 * tenant database and a user ID. Used by both orpc-tenant.middleware and
 * createContext so the logic lives in exactly one place.
 */

import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { members } from "@avantej-core/db/schema/tenant/members";
import { getDescendantNodeIds } from "./hierarchy.service";

export type MemberContextResult = {
	member: typeof members.$inferSelect;
	accessibleNodeIds: string[];
};

/**
 * Resolve a member record and accessible hierarchy node IDs for a given user.
 *
 * Returns `null` when no member row is found for the userId (e.g. a new user
 * accepting a public invitation).  Errors from `getDescendantNodeIds` are
 * caught and converted to an empty array — the downstream guards will surface
 * a meaningful error for the caller.
 */
export async function resolveMemberContext(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	userId: string,
): Promise<MemberContextResult | null> {
	const member = await tenantDb.query.members.findFirst({
		where: eq(members.userId, userId),
	});

	if (!member) {
		return null;
	}

	let accessibleNodeIds: string[];
	try {
		accessibleNodeIds = await getDescendantNodeIds(
			tenantDb,
			member.hierarchyScopeId,
		);
	} catch (err) {
		console.error(
			`[resolveMemberContext] Failed to get descendant nodes for hierarchyScopeId ${member.hierarchyScopeId}:`,
			err,
		);
		accessibleNodeIds = [];
	}

	return { member, accessibleNodeIds };
}
