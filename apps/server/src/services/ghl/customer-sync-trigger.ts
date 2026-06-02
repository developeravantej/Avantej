/**
 * Best-effort customer sync trigger — fires syncCustomerToGhl AFTER the
 * Avantej write commits. Never throws. Resolves dependencies (member
 * lookup, user lookup, controlPanelDb access) here so router handlers
 * stay focused on input validation + the primary write.
 */

import type { Context as HonoContext } from "hono";
import { and, eq } from "drizzle-orm";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { members } from "@avantej-core/db/schema/tenant/members";
import { decrypt } from "@avantej-core/db";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { getControlPanelDb } from "@/lib/db";
import {
	syncCustomerToGhl,
	type SyncCustomerOperation,
	type SyncCustomerResult,
} from "./sync-customer";
import type { AvantejCustomerProfile } from "./payload-builders";

export interface FireCustomerSyncArgs {
	honoContext: HonoContext;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	userId: string;
	customerProfile: AvantejCustomerProfile;
	operation: SyncCustomerOperation;
}

export async function fireCustomerSync(
	args: FireCustomerSyncArgs,
): Promise<
	| SyncCustomerResult
	| { status: "skipped"; reason: "no-member" | "no-user" }
	| { status: "error"; error: string }
> {
	const {
		honoContext,
		tenantDb,
		organizationId,
		userId,
		customerProfile,
		operation,
	} = args;

	const controlPanelDb = getControlPanelDb(honoContext);

	// Resolve the user's client-role member to derive branchNodeId
	const member = await tenantDb.query.members.findFirst({
		where: and(eq(members.userId, userId), eq(members.role, "client")),
	});
	if (!member) return { status: "skipped", reason: "no-member" };

	// Use select().from() pattern as established in gohighlevel.service.ts
	const [userRecord] = await controlPanelDb
		.select()
		.from(userTable)
		.where(eq(userTable.id, userId))
		.limit(1);

	if (!userRecord) return { status: "skipped", reason: "no-user" };

	try {
		return await syncCustomerToGhl({
			controlPanelDb,
			tenantDb,
			organizationId,
			branchNodeId: member.hierarchyScopeId,
			customerProfile,
			user: {
				id: userRecord.id,
				email: userRecord.email,
				firstName: userRecord.firstName,
				lastName: userRecord.lastName,
				name: userRecord.name,
			},
			memberStatus: member.status === "active" ? "active" : "inactive",
			operation,
			decryptApiKey: decrypt,
		});
	} catch (error) {
		// syncCustomerToGhl already swallows GHL failures via failure mode B.
		// This catch only triggers on programmer error — log + skip.
		console.error("[ghl] fireCustomerSync unexpected throw", error);
		return {
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
