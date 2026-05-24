import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

/** Result shape from the GHL staff sync dispatcher (Phase 7.4). */
export type GhlSyncResult = {
	status: "synced" | "skipped" | "error";
	reason?: string;
	ghlUserId?: string;
	error?: string;
};

export type TenantDb = NeonDatabase<typeof tenantSchema>;

/** Env-bound dispatcher looked up via `context.honoContext.get("dispatchStaffSync")`. */
export type DispatchStaffSyncFn = (args: {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: TenantDb;
	organizationId: string;
	memberId: string;
	operation: "create" | "update" | "delete";
}) => Promise<GhlSyncResult>;
