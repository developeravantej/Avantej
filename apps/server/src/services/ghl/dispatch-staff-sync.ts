/**
 * Server-side adapter that wires the dependency-injected
 * `dispatchStaffSync` / `dispatchProfileSync` from `@avantej-core/services`
 * with the real GHL HTTP client, decryption, and tenant DB factory.
 *
 * Routers should import from this module — never from the services package
 * directly — so that `apps/server`-specific concerns stay out of the shared
 * services layer.
 */

import { Pool } from "@neondatabase/serverless";
import { decrypt } from "@avantej-core/db";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	dispatchProfileSync as dispatchProfileSyncCore,
	dispatchStaffSync as dispatchStaffSyncCore,
	type StaffSyncOperation,
	type StaffSyncResult,
} from "@avantej-core/services";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { ghlFetch } from "./http-client";
import { syncStaffToGhl } from "./sync-staff";
import type { GhlUser } from "./types";

const putGhlUser = async (args: {
	apiKey: string;
	ghlUserId: string;
	payload: { locationIds: string[] };
}): Promise<{ id: string }> => {
	return ghlFetch<GhlUser>({
		method: "PUT",
		path: `/users/${args.ghlUserId}`,
		apiKey: args.apiKey,
		body: args.payload,
	});
};

const openTenantDb = async (
	connectionString: string,
): Promise<NeonDatabase<typeof tenantSchema>> => {
	const pool = new Pool({ connectionString });
	return drizzle({ client: pool, schema: tenantSchema });
};

export interface ServerDispatchStaffSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	memberId: string;
	operation: StaffSyncOperation;
	env: { GHL_AGENCY_ID: string };
}

export const dispatchStaffSync = (
	args: ServerDispatchStaffSyncArgs,
): Promise<StaffSyncResult> =>
	dispatchStaffSyncCore({
		...args,
		syncStaffToGhl,
		decryptApiKey: decrypt,
		putGhlUser,
	});

export interface ServerDispatchProfileSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	userId: string;
	env: { GHL_AGENCY_ID: string };
}

export const dispatchProfileSync = (
	args: ServerDispatchProfileSyncArgs,
): Promise<StaffSyncResult[]> =>
	dispatchProfileSyncCore({
		...args,
		openTenantDb,
		dispatchStaffSync: dispatchStaffSyncCore,
		decryptConnectionString: decrypt,
		decryptApiKey: decrypt,
		syncStaffToGhl,
		putGhlUser,
	});
