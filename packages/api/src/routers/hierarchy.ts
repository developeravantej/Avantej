import {
  type CreateHierarchyNodeParams,
  createHierarchyNode,
  getDescendantNodeIds,
  requirePermission,
  validateHierarchyRules,
  validateParentAccess,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

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
    .handler(async ({ context }) => {
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

      // Get all nodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allNodes = await tenantDb.query.hierarchyNodes.findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orderBy: (nodes: any, { asc }: any) => [
          asc(nodes.depth),
          asc(nodes.name),
        ],
      });

      // Filter to accessible nodes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accessibleNodes = allNodes.filter((node: any) =>
        accessibleNodeIds.includes(node.id)
      );

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: accessibleNodes.map((node: any) => ({
          id: node.id,
          name: node.name,
          type: node.type,
          depth: node.depth,
          parentId: node.parentId,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        })),
      };
    }),
};
