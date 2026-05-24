import {
	type CreateHierarchyNodeParams,
	createHierarchyNode,
	getDescendantNodeIds,
	validateHierarchyRules,
	validateParentAccess,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";
import type { ControlPanelDb } from "../../lib/context-helpers";

export const hierarchyCreateProcedures = {
	/**
   * Create a hierarchy node (country, state, or branch)
   */
  createNode: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        type: z.enum(["country", "state", "branch"]),
        name: z.string().min(1),
        code: z.string().optional(),
        parentId: z.string().uuid().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
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

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "hierarchy_management", "create");

      // Validate parent access if parentId provided
      if (input.parentId) {
        try {
          validateParentAccess(input.parentId, accessibleNodeIds);
        } catch (error) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error ? error.message : "Parent not accessible",
          });
        }

        // Check if parent node exists and is not deleted
        const parent = await tenantDb.query.hierarchyNodes.findFirst({
          where: eq(hierarchyNodes.id, input.parentId),
        });

        if (!parent) {
          throw new ORPCError("NOT_FOUND", {
            message: `Parent node not found: ${input.parentId}`,
          });
        }

      }

      // Prepare params
      const params: CreateHierarchyNodeParams = {
        type: input.type,
        name: input.name,
        code: input.code,
        parentId: input.parentId || null,
      };

      // Validate hierarchy rules
      try {
        await validateHierarchyRules(tenantDb, params);
      } catch (error) {
        throw new ORPCError("BAD_REQUEST", {
          message: error instanceof Error ? error.message : "Validation failed",
        });
      }

      // Create node
      try {
        const node = await createHierarchyNode(tenantDb, params);

        // Fetch branch-specific details (split off into branch_details in H2)
        let nodeAddress: string | null = null;
        let nodePicUserId: string | null = null;
        if (node.type === "branch") {
          const details = await tenantDb.query.branchDetails.findFirst({
            where: eq(branchDetails.nodeId, node.id),
          });
          nodeAddress = details?.address ?? null;
          nodePicUserId = details?.picUserId ?? null;
        }

        // Sync branch to control panel organization_branches registry
        if (node.type === "branch" && context.organizationId) {
          const controlPanelDb = tryGetControlPanelDb(context);
          if (controlPanelDb) {
            try {
              // Resolve country ancestor by walking up the hierarchy
              let countryName: string | null = null;
              let countryTenantNodeId: string | null = null;
              let currentParentId = node.parentId;
              while (currentParentId) {
                const parent = await tenantDb.query.hierarchyNodes.findFirst({
                  where: eq(hierarchyNodes.id, currentParentId),
                });
                if (!parent) break;
                if (parent.type === "country") {
                  countryName = parent.name;
                  countryTenantNodeId = parent.id;
                  break;
                }
                currentParentId = parent.parentId;
              }

              await controlPanelDb.insert(organizationBranches).values({
                organizationId: context.organizationId,
                tenantNodeId: node.id,
                name: node.name,
                countryTenantNodeId,
                country: countryName,
                address: nodeAddress,
              });
            } catch (syncError) {
              console.error("Failed to sync branch to organization_branches:", syncError);
            }
          }
        }

        // Fire-and-forget GHL branch-option sync (Phase G org-shared model).
        // Skips silently if org isn't on org-shared model; error never blocks
        // the create response.
        let ghlSync:
          | { status: "synced" | "skipped" | "error"; [k: string]: unknown }
          | null = null;
        if (node.type === "branch" && context.organizationId) {
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
          const controlPanelDb = tryGetControlPanelDb(context);
          if (dispatchBranchSync && controlPanelDb) {
            try {
              ghlSync = await dispatchBranchSync({
                controlPanelDb,
                tenantDb,
                organizationId: context.organizationId,
                branchNodeId: node.id,
              });
            } catch (err) {
              console.error("GHL branch sync failed:", err);
              ghlSync = {
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }
        }

        return {
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          address: nodeAddress,
          picUserId: nodePicUserId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
          ghlSync,
        };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to create node",
        });
      }
    })
};
