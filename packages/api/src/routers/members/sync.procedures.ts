/**
 * Members Router
 *
 * API endpoints for managing organization members.
 * Members are stored in tenant databases and linked to users in the control panel.
 */

import { createMember, getMembersNewToday } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { user } from "@avantej-core/db/schema/auth";
import { desc, eq, and, inArray, asc, isNull, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, resolveAccessibleNodeIds } from "../../guards";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { getDescendantNodeIds,
 validateParentAccess } from "@avantej-core/services";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { deactivateMember } from "@avantej-core/services/member.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";

// Shared GHL staff sync dispatcher result type (Phase 7.4 wiring). The
// dispatcher itself is env-bound by `dbMiddleware` in apps/server and looked
// up via `context.honoContext.get("dispatchStaffSync")`. The function type is
// declared locally per handler since it references `typeof context.tenantDb`.
type GhlSyncResult = {
  status: "synced" | "skipped" | "error";
  reason?: string;
  ghlUserId?: string;
  error?: string;
};

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
      })
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

      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;
      const dispatchStaffSync = context.honoContext?.get(
        "dispatchStaffSync"
      ) as DispatchStaffSyncFn | undefined;

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
    })
};
