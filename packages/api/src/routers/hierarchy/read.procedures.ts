import { getDescendantNodeIds, listNodesWithStats } from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

export const hierarchyReadProcedures = {
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
		assertOrgContextMatch(context, input);
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

      // Check permission
      await requirePermissionOrpc(tenantDb, member, "hierarchy_management", "read");

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
      

      

		assertOrgContextMatch(context, input);
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
    })
};
