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
import { reconcilePrimaryStaffOptions } from "./staff-option-sync";
import { syncStaffToGhl } from "./sync-staff";
import type { GhlUser } from "./types";

const putGhlUser = async (args: {
	apiKey: string;
	ghlUserId: string;
	payload: {
		locationIds: string[];
		customFields?: Array<{ id: string; value: string }>;
	};
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
): Promise<{
	db: NeonDatabase<typeof tenantSchema>;
	close: () => Promise<void>;
}> => {
	const pool = new Pool({ connectionString });
	const db = drizzle({ client: pool, schema: tenantSchema });
	return { db, close: () => pool.end() };
};

export interface ServerDispatchStaffSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	memberId: string;
	operation: StaffSyncOperation;
	env: { GHL_AGENCY_ID: string };
}

export const dispatchStaffSync = async (
	args: ServerDispatchStaffSyncArgs,
): Promise<StaffSyncResult> => {
	const result = await dispatchStaffSyncCore({
		...args,
		syncStaffToGhl,
		decryptApiKey: decrypt,
		putGhlUser,
	});

	// After any successful staff sync, rebuild the org's "Primary Staff" GHL
	// dropdown from currently-active staff (desired-state). Best-effort — a
	// dropdown-reconcile failure must never fail the staff sync itself.
	if (result.status === "synced") {
		try {
			await reconcilePrimaryStaffOptions({
				controlPanelDb: args.controlPanelDb,
				tenantDb: args.tenantDb,
				organizationId: args.organizationId,
				decryptApiKey: decrypt,
			});
		} catch (e) {
			console.error("[ghl] primary-staff dropdown reconcile failed", e);
		}
	}

	return result;
};

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
