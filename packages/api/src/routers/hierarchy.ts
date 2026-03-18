import {
  type CreateHierarchyNodeParams,
  type UpdateHierarchyNodeParams,
  type DeleteHierarchyNodeOptions,
  createHierarchyNode,
  updateHierarchyNode,
  deleteHierarchyNode,
  moveHierarchyNode,
  getDescendantNodeIds,
  requirePermission,
  validateHierarchyRules,
  validateParentAccess,
  getMembersByHierarchyScope,
  updateMemberHierarchyScope,
  bulkUpdateMemberHierarchyScope,
  getAllOrganizationMembersWithUserDetails,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export const hierarchyRouter = {
  /**
   * Create a hierarchy node (country, region, area, or branch)
   */
  createNode: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        type: z.enum(["country", "region", "area", "branch"]),
        name: z.string().min(1),
        code: z.string().optional(),
        parentId: z.string().uuid().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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
      try {
        await requirePermission(
          tenantDb,
          member,
          "hierarchy_management",
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          address: (node as any).address,
          picUserId: (node as any).picUserId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
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
  listNodes: protectedProcedure
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

      // Get all nodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allNodes = await tenantDb.query.hierarchyNodes.findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orderBy: (nodes: any, { asc }: any) => [
          asc(nodes.depth),
          asc(nodes.name),
        ],
      });

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

      // Map nodes to response format
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: accessibleNodes.map((node: any) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          address: node.address,
          picUserId: node.picUserId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        })),
      };
    }),

  /**
   * Update a hierarchy node
   */
  updateNode: protectedProcedure
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
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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
      try {
        await requirePermission(
          tenantDb,
          member,
          "hierarchy_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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

      // Update node
      try {
        const node = await updateHierarchyNode(tenantDb, input.nodeId, updateParams);
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          address: (node as any).address,
          picUserId: (node as any).picUserId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
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
  getNode: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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

      return {
        id: node.id,
        name: node.name,
        type: node.type,
        depth: node.depth,
        parentId: node.parentId,
        address: (node as any).address,
        picUserId: (node as any).picUserId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      };
    }),

  /**
   * Get all descendant nodes of a given node
   */
  getDescendants: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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
        where: (nodes, { inArray }) => inArray(nodes.id, descendantIdsOnly),
        orderBy: (nodes: any, { asc }: any) => [
          asc(nodes.depth),
          asc(nodes.name),
        ],
      });

      // Filter to only accessible nodes
      const accessibleDescendants = descendantNodes.filter((node) =>
        accessibleNodeIds.includes(node.id)
      );

      return {
        descendants: accessibleDescendants.map((node: any) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          address: node.address,
          picUserId: node.picUserId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        })),
      };
    }),

  deleteNode: protectedProcedure
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
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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
      try {
        await requirePermission(
          tenantDb,
          member,
          "hierarchy_management",
          "delete"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Prepare delete options (defaults to true for both)
      const deleteOptions: DeleteHierarchyNodeOptions = {
        autoDeleteChildren: input.options?.autoDeleteChildren ?? true,
        autoReassignMembers: input.options?.autoReassignMembers ?? true,
      };

      // Delete node with automatic handling
      try {
        await deleteHierarchyNode(tenantDb, input.nodeId, deleteOptions);
        return { success: true };
      } catch (error) {
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
  moveNode: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        nodeId: z.string().uuid(),
        newParentId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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
      try {
        await requirePermission(
          tenantDb,
          member,
          "hierarchy_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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

      // Move node
      try {
        const node = await moveHierarchyNode(tenantDb, input.nodeId, input.newParentId);
        return {
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          address: (node as any).address,
          picUserId: (node as any).picUserId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
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
  listMembers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        hierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

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
      try {
        await requirePermission(
          tenantDb,
          member,
          "user_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
  reassignMember: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check permission
      try {
        await requirePermission(
          tenantDb,
          member,
          "user_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
  bulkReassignMembers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberIds: z.array(z.string().uuid()),
        newHierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      const { tenantDb, member, accessibleNodeIds: contextAccessibleNodeIds } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Check permission
      try {
        await requirePermission(
          tenantDb,
          member,
          "user_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
  listAllMembers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        includeInactive: z.boolean().optional().default(false),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      const { tenantDb, member } = context;

      // Check permission
      try {
        await requirePermission(
          tenantDb,
          member,
          "user_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

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
};
