import {
	type DeleteHierarchyNodeOptions,
	deleteHierarchyNode,
	getDescendantNodeIds,
} from "@avantej-core/services";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch, assertTenantContext } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";
import type { ControlPanelDb } from "../../lib/context-helpers";

export const hierarchyDeleteProcedures = {
	deleteNode: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
        /**
         * Options for automatic handling (defaults to true for both)
         * - autoDeleteChildren: Recursively soft-delete all active child nodes
         * - autoReassignMembers: Reassign members to parent (or org root)
         */
        options: z
          .object({
            autoDeleteChildren: z.boolean().optional(),
            autoReassignMembers: z.boolean().optional(),
          })
          .optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
		assertTenantContext(context);
      const {
        tenantDb,
        member,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check if user can access this node
      if (!accessibleNodeIds.includes(input.nodeId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this node",
        });
      }

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "hierarchy_management", "delete");

      // Prepare delete options (defaults to true for both)
      const deleteOptions: DeleteHierarchyNodeOptions = {
        autoDeleteChildren: input.options?.autoDeleteChildren ?? true,
        autoReassignMembers: input.options?.autoReassignMembers ?? true,
      };

      // Collect branch node IDs before deletion (for sync cleanup)
      // This includes the node itself (if branch) and any descendant branches
      let branchNodeIds: string[] = [];
      const controlPanelDb = tryGetControlPanelDb(context);
      if (controlPanelDb) {
        try {
          const descendantIds = await getDescendantNodeIds(tenantDb, input.nodeId);
          const descendantNodes = await tenantDb.query.hierarchyNodes.findMany({
            where: (nodes: any, { inArray }: any) => inArray(nodes.id, descendantIds),
          });
          branchNodeIds = descendantNodes
            .filter((n: any) => n.type === "branch")
            .map((n: any) => n.id);
        } catch {
          // If we can't collect IDs, proceed with delete anyway
        }
      }

      // Fire-and-forget GHL branch option removal BEFORE the delete, so the
      // dispatcher can still resolve the branch path while the row exists.
      // Errors are logged but never block the delete.
      const ghlSyncResults: Array<{
        branchNodeId: string;
        status: "synced" | "skipped" | "error";
        [k: string]: unknown;
      }> = [];
      if (controlPanelDb && branchNodeIds.length > 0 && context.organizationId) {
        const dispatchBranchRemove = context.honoContext?.get(
          "dispatchBranchRemove",
        ) as
          | ((args: {
              controlPanelDb: ControlPanelDb;
              tenantDb: typeof tenantDb;
              organizationId: string;
              branchNodeId: string;
            }) => Promise<{
              status: "synced" | "skipped" | "error";
              [k: string]: unknown;
            }>)
          | undefined;
        if (dispatchBranchRemove) {
          for (const branchId of branchNodeIds) {
            try {
              const res = await dispatchBranchRemove({
                controlPanelDb,
                tenantDb,
                organizationId: context.organizationId,
                branchNodeId: branchId,
              });
              ghlSyncResults.push({ branchNodeId: branchId, ...res });
            } catch (err) {
              console.error(
                "GHL branch remove sync failed for",
                branchId,
                err,
              );
              ghlSyncResults.push({
                branchNodeId: branchId,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      }

      // Delete node with automatic handling
      try {
        await deleteHierarchyNode(tenantDb, input.nodeId, deleteOptions);

        // Sync: remove deleted branches from organization_branches registry
        if (controlPanelDb && branchNodeIds.length > 0) {
          try {
            for (const branchId of branchNodeIds) {
              await controlPanelDb
                .delete(organizationBranches)
                .where(eq(organizationBranches.tenantNodeId, branchId));
            }
          } catch (syncError) {
            console.error("Failed to sync branch deletion to organization_branches:", syncError);
          }
        }

        return { success: true, ghlSync: ghlSyncResults };
      } catch (error) {
        // Compensation: GHL options were removed BEFORE the delete to allow
        // the dispatcher to resolve branch paths while rows still existed.
        // If the delete failed, re-add any successfully-removed options so
        // the two systems don't drift (GHL option gone, branch row still
        // present). Best-effort: log and continue on compensation failure.
        const successfullyRemovedBranchIds = ghlSyncResults
          .filter((r) => r.status === "synced")
          .map((r) => r.branchNodeId);
        if (
          successfullyRemovedBranchIds.length > 0 &&
          controlPanelDb &&
          context.organizationId
        ) {
          const dispatchBranchSync = context.honoContext?.get(
            "dispatchBranchSync",
          ) as
            | ((args: {
                controlPanelDb: ControlPanelDb;
                tenantDb: typeof tenantDb;
                organizationId: string;
                branchNodeId: string;
              }) => Promise<{
                status: "synced" | "skipped" | "error";
                [k: string]: unknown;
              }>)
            | undefined;
          if (dispatchBranchSync) {
            for (const branchId of successfullyRemovedBranchIds) {
              try {
                await dispatchBranchSync({
                  controlPanelDb,
                  tenantDb,
                  organizationId: context.organizationId,
                  branchNodeId: branchId,
                });
                console.warn(
                  `Delete failed for ${branchId}; GHL option re-added via compensation.`,
                );
              } catch (compensateErr) {
                console.error(
                  `Delete failed AND GHL compensation failed for ${branchId}:`,
                  compensateErr,
                );
              }
            }
          }
        }

        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            throw new ORPCError("NOT_FOUND", {
              message: error.message,
            });
          }
          if (
            error.message.includes("child node") ||
            error.message.includes("assigned member") ||
            error.message.includes("no valid target")
          ) {
            throw new ORPCError("CONFLICT", {
              message: error.message,
            });
          }
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to delete node",
        });
      }
    })
};
