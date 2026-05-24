import {
  type CreateHierarchyNodeParams,
  type UpdateHierarchyNodeParams,
  type DeleteHierarchyNodeOptions,
  createHierarchyNode,
  updateHierarchyNode,
  deleteHierarchyNode,
  moveHierarchyNode,
  getDescendantNodeIds,
  listNodesWithStats,

  validateHierarchyRules,
  validateParentAccess,
  getMembersByHierarchyScope,
  updateMemberHierarchyScope,
  bulkUpdateMemberHierarchyScope,
  getAllOrganizationMembersWithUserDetails,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { members } from "@avantej-core/db/schema/tenant/members";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

function getControlPanelDb(context: { honoContext?: any }): NeonDatabase<typeof controlPanelSchema> | null {
  return context.honoContext?.get("controlPanelDb") as NeonDatabase<typeof controlPanelSchema> | null;
}

export const hierarchyRouter = {
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
          const controlPanelDb = getControlPanelDb(context);
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
                controlPanelDb: ReturnType<typeof getControlPanelDb>;
                tenantDb: typeof tenantDb;
                organizationId: string;
                branchNodeId: string;
              }) => Promise<{
                status: "synced" | "skipped" | "error";
                [k: string]: unknown;
              }>)
            | undefined;
          const controlPanelDb = getControlPanelDb(context);
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
    }),

  /**
   * List hierarchy nodes
   */
  listNodes: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      // Tenant DB should be set up by createContext for oRPC routes
      const tenantDb = context.tenantDb;
      const member = context.member;
      const accessibleNodeIds = context.accessibleNodeIds;

      if (!tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: `Tenant database not available for organization ${input.organizationId}. Ensure organization context is set.`,
        });
      }

      if (!member) {
        throw new ORPCError("FORBIDDEN", {
          message: `User is not a member of organization ${input.organizationId}`,
        });
      }

      // Use the accessibleNodeIds from context (already calculated in createContext)
      const finalAccessibleNodeIds = accessibleNodeIds || [];

      // Get all nodes — use plain select instead of the relational query API so
      // the SELECT column list matches the actual Drizzle schema definition (the
      // query API's auto-include can drift if the table has columns the schema
      // doesn't model).
      const allNodes = await tenantDb
        .select()
        .from(hierarchyNodes)
        .orderBy(hierarchyNodes.depth, hierarchyNodes.name);

      // If admin: return all nodes; if no accessible IDs: return all nodes; otherwise filter
      let accessibleNodes: typeof allNodes;
      const isAdmin = member.role === "admin";

      if (isAdmin || finalAccessibleNodeIds.length === 0) {
        accessibleNodes = allNodes;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accessibleNodes = allNodes.filter((node: any) =>
          finalAccessibleNodeIds.includes(node.id)
        );
      }

      // Phase H2: branch details split off hierarchy_nodes. Batch-fetch
      // all branch_details rows for branches in the response.
      type BranchDetailRow = {
        nodeId: string;
        address: string | null;
        picUserId: string | null;
      };
      const branchIds = accessibleNodes
        .filter((n: any) => n.type === "branch")
        .map((n: any) => n.id as string);
      const detailsRows: BranchDetailRow[] = branchIds.length > 0
        ? ((await tenantDb.query.branchDetails.findMany({
            where: inArray(branchDetails.nodeId, branchIds),
          })) as BranchDetailRow[])
        : [];
      const detailsByNodeId = new Map<string, BranchDetailRow>(
        detailsRows.map((d) => [d.nodeId, d]),
      );

      // Map nodes to response format
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: accessibleNodes.map((node: any) => {
          const d = detailsByNodeId.get(node.id);
          return {
            id: node.id,
            name: node.name,
            type: node.type,
            depth: node.depth,
            parentId: node.parentId,
            address: d?.address ?? null,
            picUserId: d?.picUserId ?? null,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
          };
        }),
      };
    }),

  /**
   * Update a hierarchy node
   */
  updateNode: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
        name: z.string().min(1).optional(),
        address: z.string().nullable().optional(),
        picUserId: z.string().nullable().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

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
      await requirePermissionOrpc(tenantDb, member, "hierarchy_management", "update");

      // Build update params
      const updateParams: UpdateHierarchyNodeParams = {};
      if (input.name !== undefined) {
        updateParams.name = input.name;
      }
      if (input.address !== undefined) {
        updateParams.address = input.address;
      }
      if (input.picUserId !== undefined) {
        updateParams.picUserId = input.picUserId;
      }

      // Capture pre-update state for GHL branch rename sync.
      const preUpdateNode = await tenantDb.query.hierarchyNodes.findFirst({
        where: eq(hierarchyNodes.id, input.nodeId),
      });

      // Update node
      try {
        const node = await updateHierarchyNode(tenantDb, input.nodeId, updateParams);

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

        // Sync updates to control panel organization_branches registry
        const controlPanelDb = getControlPanelDb(context);
        if (controlPanelDb) {
          // Branch name/address update → update the branch row
          if (node.type === "branch" && (input.name !== undefined || input.address !== undefined)) {
            try {
              const syncData: { name?: string; address?: string | null; updatedAt: Date } = {
                updatedAt: new Date(),
              };
              if (input.name !== undefined) syncData.name = node.name;
              if (input.address !== undefined) syncData.address = nodeAddress;

              await controlPanelDb
                .update(organizationBranches)
                .set(syncData)
                .where(eq(organizationBranches.tenantNodeId, input.nodeId));
            } catch (syncError) {
              console.error("Failed to sync branch update to organization_branches:", syncError);
            }
          }

          // Country rename → update country name on all branches under this country
          if (node.type === "country" && input.name !== undefined) {
            try {
              await controlPanelDb
                .update(organizationBranches)
                .set({ country: node.name, updatedAt: new Date() })
                .where(eq(organizationBranches.countryTenantNodeId, input.nodeId));
            } catch (syncError) {
              console.error("Failed to sync country rename to organization_branches:", syncError);
            }
          }
        }

        // Fire-and-forget GHL branch rename sync.
        let ghlSync:
          | { status: "synced" | "skipped" | "error"; [k: string]: unknown }
          | null = null;
        if (
          node.type === "branch" &&
          preUpdateNode &&
          input.name !== undefined &&
          preUpdateNode.name !== input.name &&
          context.organizationId
        ) {
          const dispatchBranchRename = context.honoContext?.get(
            "dispatchBranchRename",
          ) as
            | ((args: {
                controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
                tenantDb: typeof tenantDb;
                organizationId: string;
                branchNodeId: string;
                oldBranchName: string;
              }) => Promise<{
                status: "synced" | "skipped" | "error";
                [k: string]: unknown;
              }>)
            | undefined;
          const cpDb = getControlPanelDb(context);
          if (dispatchBranchRename && cpDb) {
            try {
              ghlSync = await dispatchBranchRename({
                controlPanelDb: cpDb,
                tenantDb,
                organizationId: context.organizationId,
                branchNodeId: node.id,
                oldBranchName: preUpdateNode.name,
              });
            } catch (err) {
              console.error("GHL branch rename sync failed:", err);
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
        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            throw new ORPCError("NOT_FOUND", {
              message: error.message,
            });
          }
          if (error.message.includes("already exists")) {
            throw new ORPCError("BAD_REQUEST", {
              message: error.message,
            });
          }
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to update node",
        });
      }
    }),

  /**
   * Delete a hierarchy node
   *
   * By default, automatically handles:
   * - Recursively soft-deletes all active child nodes
   * - Reassigns members to parent node (or org root if no parent)
   *
   * Options can be provided to customize behavior, but defaults are recommended
   * for a smooth user experience.
   */
  /**
   * Get a single hierarchy node by ID
   */
  getNode: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

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

      // Get the node
      const node = await tenantDb.query.hierarchyNodes.findFirst({
        where: eq(hierarchyNodes.id, input.nodeId),
      });

      if (!node) {
        throw new ORPCError("NOT_FOUND", {
          message: `Node not found: ${input.nodeId}`,
        });
      }

      // Phase H2: branch details split off.
      let address: string | null = null;
      let picUserId: string | null = null;
      if (node.type === "branch") {
        const details = await tenantDb.query.branchDetails.findFirst({
          where: eq(branchDetails.nodeId, node.id),
        });
        address = details?.address ?? null;
        picUserId = details?.picUserId ?? null;
      }

      return {
        id: node.id,
        name: node.name,
        type: node.type,
        depth: node.depth,
        parentId: node.parentId,
        address,
        picUserId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    }),

  /**
   * Get all descendant nodes of a given node
   */
  getDescendants: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

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

      // Check if user can access the parent node
      if (!accessibleNodeIds.includes(input.nodeId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this node",
        });
      }

      // Get all descendant node IDs using the service function
      const descendantIds = await getDescendantNodeIds(
        tenantDb,
        input.nodeId
      );

      // Remove the parent node ID from the list (descendants only)
      const descendantIdsOnly = descendantIds.filter(
        (id) => id !== input.nodeId
      );

      if (descendantIdsOnly.length === 0) {
        return {
          descendants: [],
        };
      }

      // Get full node details for all descendants
      const descendantNodes = await tenantDb.query.hierarchyNodes.findMany({
        where: (nodes: any, { inArray }: any) => inArray(nodes.id, descendantIdsOnly),
        orderBy: (nodes: any, { asc }: any) => [
          asc(nodes.depth),
          asc(nodes.name),
        ],
      });

      // Filter to only accessible nodes
      const accessibleDescendants = descendantNodes.filter((node: any) =>
        accessibleNodeIds.includes(node.id)
      );

      // Phase H2: batch-load branch_details for branch descendants.
      const dBranchIds = accessibleDescendants
        .filter((n: any) => n.type === "branch")
        .map((n: any) => n.id as string);
      type BranchDetailRow = {
        nodeId: string;
        address: string | null;
        picUserId: string | null;
      };
      const dDetails: BranchDetailRow[] = dBranchIds.length > 0
        ? ((await tenantDb.query.branchDetails.findMany({
            where: inArray(branchDetails.nodeId, dBranchIds),
          })) as BranchDetailRow[])
        : [];
      const dDetailsByNodeId = new Map<string, BranchDetailRow>(
        dDetails.map((d) => [d.nodeId, d]),
      );

      return {
        descendants: accessibleDescendants.map((node: any) => {
          const d = dDetailsByNodeId.get(node.id);
          return {
            id: node.id,
            name: node.name,
            type: node.type,
            depth: node.depth,
            parentId: node.parentId,
            address: d?.address ?? null,
            picUserId: d?.picUserId ?? null,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
          };
        }),
      };
    }),

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
      const controlPanelDb = getControlPanelDb(context);
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
              controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
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
                controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
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
    }),

  /**
   * Move a hierarchy node to a new parent
   */
  moveNode: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
        newParentId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

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

      // Check if user can access both nodes
      if (!accessibleNodeIds.includes(input.nodeId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this node",
        });
      }

      if (!accessibleNodeIds.includes(input.newParentId)) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to the new parent node",
        });
      }

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "hierarchy_management", "update");

      // Check if node being moved exists and is not deleted
      const nodeToMove = await tenantDb.query.hierarchyNodes.findFirst({
        where: eq(hierarchyNodes.id, input.nodeId),
      });

      if (!nodeToMove) {
        throw new ORPCError("NOT_FOUND", {
          message: `Node not found: ${input.nodeId}`,
        });
      }

      // Check if new parent exists
      const newParent = await tenantDb.query.hierarchyNodes.findFirst({
        where: eq(hierarchyNodes.id, input.newParentId),
      });

      if (!newParent) {
        throw new ORPCError("NOT_FOUND", {
          message: `New parent node not found: ${input.newParentId}`,
        });
      }

      // For branches: capture old country + state prefix + branch name BEFORE
      // the move, so we can rebuild the OLD GHL option label for removal.
      let preMoveCountryNodeId: string | null = null;
      let preMoveStatePrefix: string | null = null;
      const preMoveBranchName = nodeToMove.name;
      if (nodeToMove.type === "branch") {
        preMoveCountryNodeId = nodeToMove.countryNodeId ?? null;
        if (!preMoveCountryNodeId && nodeToMove.parentId) {
          // Fallback: walk parents to find the country ancestor.
          let cursorId: string | null = nodeToMove.parentId;
          while (cursorId) {
            const p: any = await tenantDb.query.hierarchyNodes.findFirst({
              where: eq(hierarchyNodes.id, cursorId),
            });
            if (!p) break;
            if (p.type === "country") {
              preMoveCountryNodeId = p.id;
              break;
            }
            cursorId = p.parentId ?? null;
          }
        }
        // State prefix = immediate non-country, non-organization parent's name.
        if (nodeToMove.parentId) {
          const parent: any = await tenantDb.query.hierarchyNodes.findFirst({
            where: eq(hierarchyNodes.id, nodeToMove.parentId),
          });
          if (
            parent &&
            parent.type !== "country" &&
            parent.type !== "organization"
          ) {
            preMoveStatePrefix = parent.name;
          }
        }
      }

      // Move node
      try {
        const node = await moveHierarchyNode(tenantDb, input.nodeId, input.newParentId);

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

        // Fire-and-forget GHL branch move sync. Only when a branch crossed
        // countries.
        let ghlSync:
          | { status: "synced" | "skipped" | "error"; [k: string]: unknown }
          | null = null;
        if (
          node.type === "branch" &&
          preMoveCountryNodeId &&
          context.organizationId
        ) {
          const newCountryNodeId = node.countryNodeId ?? null;
          if (newCountryNodeId && newCountryNodeId !== preMoveCountryNodeId) {
            const dispatchBranchMove = context.honoContext?.get(
              "dispatchBranchMove",
            ) as
              | ((args: {
                  controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
                  tenantDb: typeof tenantDb;
                  organizationId: string;
                  branchNodeId: string;
                  oldCountryNodeId: string;
                  oldBranchName: string;
                  oldStatePrefix: string | null;
                }) => Promise<{
                  status: "synced" | "skipped" | "error";
                  [k: string]: unknown;
                }>)
              | undefined;
            const cpDb = getControlPanelDb(context);
            if (dispatchBranchMove && cpDb) {
              try {
                ghlSync = await dispatchBranchMove({
                  controlPanelDb: cpDb,
                  tenantDb,
                  organizationId: context.organizationId,
                  branchNodeId: node.id,
                  oldCountryNodeId: preMoveCountryNodeId,
                  oldBranchName: preMoveBranchName,
                  oldStatePrefix: preMoveStatePrefix,
                });
              } catch (err) {
                console.error("GHL branch move sync failed:", err);
                ghlSync = {
                  status: "error",
                  error: err instanceof Error ? err.message : String(err),
                };
              }
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
        // Handle specific error cases
        if (error instanceof Error) {
          if (error.message.includes("not found")) {
            throw new ORPCError("NOT_FOUND", {
              message: error.message,
            });
          }
          if (
            error.message.includes("circular reference") ||
            error.message.includes("already exists") ||
            error.message.includes("Invalid parent type") ||
            error.message.includes("depth mismatch") ||
            error.message.includes("cannot have a parent")
          ) {
            throw new ORPCError("BAD_REQUEST", {
              message: error.message,
            });
          }
        }
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to move node",
        });
      }
    }),

  /**
   * List members assigned to a hierarchy node
   */
  listMembers: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        hierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check if user can access this hierarchy node
      if (!accessibleNodeIds.includes(input.hierarchyScopeId) && member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to this hierarchy node",
        });
      }

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "read");

      try {
        const memberList = await getMembersByHierarchyScope(
          tenantDb,
          input.hierarchyScopeId
        );
        return { members: memberList };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to list members",
        });
      }
    }),

  /**
   * Reassign a member to a new hierarchy scope
   */
  reassignMember: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "update");

      // Check if user can access the target hierarchy node
      if (!accessibleNodeIds.includes(input.newHierarchyScopeId) && member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to the target hierarchy node",
        });
      }

      // Get the member being reassigned to check current scope
      const memberToReassign = await tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!memberToReassign) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found",
        });
      }

      // Check if user can access the member's current scope (for admin override)
      if (
        !accessibleNodeIds.includes(memberToReassign.hierarchyScopeId) &&
        member.role !== "admin"
      ) {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to reassign this member",
        });
      }

      try {
        const updatedMember = await updateMemberHierarchyScope(
          tenantDb,
          input.memberId,
          input.newHierarchyScopeId
        );
        return { member: updatedMember };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to reassign member",
        });
      }
    }),

  /**
   * Bulk reassign members to a new hierarchy scope
   */
  bulkReassignMembers: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberIds: z.array(z.string().uuid()),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "update");

      // Check if user can access the target hierarchy node
      if (!accessibleNodeIds.includes(input.newHierarchyScopeId) && member.role !== "admin") {
        throw new ORPCError("FORBIDDEN", {
          message: "User does not have access to the target hierarchy node",
        });
      }

      try {
        const updatedMembers = await bulkUpdateMemberHierarchyScope(
          tenantDb,
          input.memberIds,
          input.newHierarchyScopeId
        );
        return { members: updatedMembers };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to bulk reassign members",
        });
      }
    }),

  /**
   * List all members in the organization with user details
   * Returns members with their names and emails from the control panel database
   */
  listAllMembers: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        includeInactive: z.boolean().optional().default(false),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      const { tenantDb, member } = context;

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "user_management", "read");

      // Get control panel database from Hono context
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;
      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      try {
        const membersWithDetails = await getAllOrganizationMembersWithUserDetails(
          tenantDb,
          controlPanelDb,
          input.organizationId,
          input.includeInactive
        );
        return { members: membersWithDetails };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            error instanceof Error ? error.message : "Failed to list all members",
        });
      }
    }),

  /**
   * List hierarchy nodes enriched with branch stats from the cache.
   *
   * Stats (membersCount, staffCount, monthRevenueCents) are read ONLY from the
   * branch_stats_cache table — never computed inline. A cache miss results in
   * stale: true + null stats; a debounced background refresh is enqueued.
   *
   * RBAC: requires hierarchy_management:read. Admin sees all nodes; staff sees
   * only their accessibleNodeIds.
   */
  listNodesWithStats: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

      const { tenantDb, member } = context;

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "hierarchy_management", "read");

      const isAdmin = member.role === "admin";
      const accessibleNodeIds = context.accessibleNodeIds ?? [];

      try {
        const nodes = await listNodesWithStats(tenantDb, { accessibleNodeIds, isAdmin });
        return { nodes };
      } catch (error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: error instanceof Error ? error.message : "Failed to list nodes with stats",
        });
      }
    }),
};
