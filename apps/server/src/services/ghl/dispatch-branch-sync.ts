/**
 * Server-side adapter for branch ↔ GHL custom-field-option sync.
 *
 * Mirrors `dispatch-staff-sync.ts`. Routers in `@avantej-core/api` reach
 * this via the Hono context (`context.honoContext.get("dispatchBranchSync")`),
 * not by direct import — keeps `apps/server` deps out of the shared package.
 */

import { decrypt } from "@avantej-core/db";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { syncBranchToGhl, type SyncBranchResult } from "./branch-sync";

export interface ServerDispatchBranchSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
}

export const dispatchBranchSync = (
	args: ServerDispatchBranchSyncArgs,
): Promise<SyncBranchResult> =>
	syncBranchToGhl({ ...args, decryptApiKey: decrypt });
