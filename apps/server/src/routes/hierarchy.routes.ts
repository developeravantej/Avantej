/**
 * Hierarchy Routes
 *
 * Implements hierarchy node management endpoints.
 *
 * Routes:
 * - POST /orgs/:organizationId/hierarchy/nodes - Create hierarchy node (country, region, area, branch)
 * - GET /orgs/:organizationId/hierarchy/nodes - List hierarchy nodes
 */

import { authMiddleware } from "@/middleware/auth.middleware";
import { hierarchyMiddleware } from "@/middleware/hierarchy.middleware";
import { tenantMiddleware } from "@/middleware/tenant.middleware";
import {
	type CreateHierarchyNodeParams,
	createHierarchyNode,
	requirePermission,
	validateHierarchyRules,
	validateParentAccess,
} from "@avantej-core/services";
import { Hono } from "hono";

export const hierarchyRoutes = new Hono();

/**
 * POST /orgs/:organizationId/hierarchy/nodes
 * Create a new hierarchy node (country, region, area, or branch)
 *
 * Requires:
 * - Authentication (authMiddleware)
 * - Organization context (tenantMiddleware)
 * - Hierarchy context (hierarchyMiddleware)
 * - Permission: hierarchy_management:create
 *
 * Body:
 * {
 *   type: "country" | "state" | "branch",
 *   name: string,
 *   code?: string,
 *   parentId?: string (UUID, required for non-organization nodes)
 * }
 */
hierarchyRoutes.post(
	"/nodes",
	authMiddleware,
	tenantMiddleware,
	hierarchyMiddleware,
	async (c) => {
		try {
			const member = c.get("member");
			const tenantDb = c.get("tenantDb");
			const accessibleNodeIds = c.get("accessibleNodeIds");

			if (!member || !tenantDb || !accessibleNodeIds) {
				return c.json({ error: "Missing required context" }, 500);
			}

			// Check permission
			await requirePermission(
				tenantDb,
				member,
				"hierarchy_management",
				"create",
			);

			// Parse request body
			const body = await c.req.json();
			const { type, name, code, parentId } = body;

			// Validate required fields
			if (!type || !name) {
				return c.json({ error: "type and name are required" }, 400);
			}

			// Validate type
			const validTypes = ["country", "state", "branch"];
			if (!validTypes.includes(type)) {
				return c.json(
					{ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
					400,
				);
			}

			// Validate parent access if parentId provided
			if (parentId) {
				validateParentAccess(parentId, accessibleNodeIds);
			}

			// Prepare params
			const params: CreateHierarchyNodeParams = {
				type,
				name,
				code,
				parentId: parentId || null,
			};

			// Validate hierarchy rules
			await validateHierarchyRules(tenantDb, params);

			// Create node
			const node = await createHierarchyNode(tenantDb, params);

			return c.json(
				{
					id: node.id,
					name: node.name,
					type: node.type,
					depth: node.depth,
					parentId: node.parentId,
					createdAt: node.createdAt,
					updatedAt: node.updatedAt,
				},
				201,
			);
		} catch (error) {
			console.error("Create hierarchy node error:", error);

			// Handle permission errors
			if (
				error instanceof Error &&
				error.message.includes("Permission denied")
			) {
				return c.json({ error: error.message }, 403);
			}

			// Handle validation errors
			if (
				error instanceof Error &&
				(error.message.includes("must have a parent") ||
					error.message.includes("Invalid parent type") ||
					error.message.includes("Duplicate") ||
					error.message.includes("not accessible"))
			) {
				return c.json({ error: error.message }, 400);
			}

			// Handle not found errors
			if (error instanceof Error && error.message.includes("not found")) {
				return c.json({ error: error.message }, 404);
			}

			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to create hierarchy node",
				},
				500,
			);
		}
	},
);

/**
 * GET /orgs/:organizationId/hierarchy/nodes
 * List all hierarchy nodes in the organization
 *
 * Requires:
 * - Authentication (authMiddleware)
 * - Organization context (tenantMiddleware)
 * - Hierarchy context (hierarchyMiddleware)
 */
hierarchyRoutes.get(
	"/nodes",
	authMiddleware,
	tenantMiddleware,
	hierarchyMiddleware,
	async (c) => {
		try {
			const tenantDb = c.get("tenantDb");
			const accessibleNodeIds = c.get("accessibleNodeIds");

			if (!tenantDb || !accessibleNodeIds) {
				return c.json({ error: "Missing required context" }, 500);
			}

			// Get all active nodes (exclude soft-deleted, filtered by accessible nodes if needed)
			const allNodes = await tenantDb.query.hierarchyNodes.findMany({
				where: (nodes: any, { isNull }: any) => isNull(nodes.deletedAt), // Only active nodes
				orderBy: (nodes, { asc }) => [asc(nodes.depth), asc(nodes.name)],
			});

			// Filter nodes to only those accessible by user
			const accessibleNodes = allNodes.filter((node) =>
				accessibleNodeIds.includes(node.id),
			);

			return c.json({
				nodes: accessibleNodes.map((node) => ({
					id: node.id,
					name: node.name,
					type: node.type,
					depth: node.depth,
					parentId: node.parentId,
					createdAt: node.createdAt,
					updatedAt: node.updatedAt,
				})),
			});
		} catch (error) {
			console.error("List hierarchy nodes error:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to list hierarchy nodes",
				},
				500,
			);
		}
	},
);
