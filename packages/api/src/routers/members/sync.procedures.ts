import { z } from "zod";
import { tenantProcedure } from "../../index";
import { assertOrgContextMatch } from "../../guards";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { GhlSyncResult } from "./shared";

export const membersSyncProcedures = {
	/**
	 * Manually retry GHL staff sync for a member (Phase 7.4 wiring).
	 *
	 * Useful when the original create/update/delete dispatched but the GHL side
	 * errored, and an operator wants to retry without re-saving the member row.
	 * Always dispatches with operation=update; the dispatcher resolves the
	 * member's current state in tenant + control-panel and reconciles.
	 */
	retryGhlSync: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				memberId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			assertOrgContextMatch(context, input);
			type DispatchStaffSyncFn = (args: {
				controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
				tenantDb: typeof context.tenantDb;
				organizationId: string;
				memberId: string;
				operation: "create" | "update" | "delete";
			}) => Promise<GhlSyncResult>;

			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			const dispatchStaffSync = context.honoContext?.get("dispatchStaffSync") as
				| DispatchStaffSyncFn
				| undefined;

			if (!controlPanelDb || !dispatchStaffSync) {
				return {
					ghlSync: {
						status: "error" as const,
						error: "GHL sync not configured",
					},
				};
			}

			const ghlSync = await dispatchStaffSync({
				controlPanelDb,
				tenantDb: context.tenantDb,
				organizationId: input.organizationId,
				memberId: input.memberId,
				operation: "update",
			}).catch((err: unknown) => ({
				status: "error" as const,
				error: err instanceof Error ? err.message : String(err),
			}));

			return { ghlSync };
		}),
};
