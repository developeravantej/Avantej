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
    .handler(async ({ input, context }) => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'hierarchy.ts:125',message:'listNodes handler entry',data:{organizationId:input.organizationId,hasTenantDb:!!context.tenantDb,hasMember:!!context.member,hasAccessibleNodeIds:!!context.accessibleNodeIds},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      // Tenant DB should be set up by createContext for oRPC routes
      const tenantDb = context.tenantDb;
      const member = context.member;
      const accessibleNodeIds = context.accessibleNodeIds;

      if (!tenantDb) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/e34d4304-92ac-4a46-85ec-68df3ca09c04',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'hierarchy.ts:135',message:'Tenant DB missing in handler',data:{organizationId:input.organizationId,hasTenantDb:!!context.tenantDb,hasMember:!!context.member,hasOrgId:!!context.organizationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        console.error("listNodes: Tenant DB not available", {
          organizationId: input.organizationId,
          hasTenantDb: !!context.tenantDb,
          hasMember: !!context.member,
        });
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: `Tenant database not available for organization ${input.organizationId}. Ensure organization context is set.`,
        });
      }

      if (!member) {
        console.error("listNodes: Member not found", {
          organizationId: input.organizationId,
          userId: context.session?.user?.id,
          hasTenantDb: !!context.tenantDb,
        });
        throw new ORPCError("FORBIDDEN", {
          message: `User is not a member of organization ${input.organizationId}`,
        });
      }

      // Use the accessibleNodeIds from context (already calculated in createContext)
      const finalAccessibleNodeIds = accessibleNodeIds || [];

      // Get all nodes - ensure this completes before returning
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allNodes = await tenantDb.query.hierarchyNodes.findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        orderBy: (nodes: any, { asc }: any) => [
          asc(nodes.depth),
          asc(nodes.name),
        ],
      });

      // Filter to accessible nodes (synchronous operation)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accessibleNodes = allNodes.filter((node: any) =>
        finalAccessibleNodeIds.includes(node.id)
      );

      // Map nodes to response format (synchronous operation)
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
