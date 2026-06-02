/**
 * Hierarchy Service
 *
 * Provides utilities for working with organizational hierarchy trees.
 * Uses PostgreSQL recursive CTEs for efficient hierarchy traversal.
 *
 * Usage:
 * ```typescript
 * import { getDescendantNodeIds, createHierarchyNode } from "@/services/hierarchy.service";
 * import { getTenantDb } from "@/lib/db";
 *
 * const tenantDb = await getTenantDb(organizationId);
 * const descendantIds = await getDescendantNodeIds(tenantDb, nodeId);
 * const newNode = await createHierarchyNode(tenantDb, { type: "branch", name: "Downtown", parentId: areaId });
 * ```
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { CreateHierarchyNodeParams } from "./hierarchy-validation.service";
import { getDepthForType } from "./hierarchy-validation.service";

/**
 * Get all descendant node IDs (including the node itself) using recursive CTE
 *
 * Uses PostgreSQL recursive CTE to traverse the hierarchy tree and return
 * all descendant nodes (children, grandchildren, etc.) including the starting node.
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId - UUID of the starting node
 * @returns Array of node IDs (includes the starting node and all descendants)
 * @throws Error if node not found or query fails
 *
 * @example
 * ```typescript
 * // Get all branches under a region
 * const branchIds = await getDescendantNodeIds(tenantDb, regionNodeId);
 * // Returns: [regionNodeId, area1Id, branch1Id, branch2Id, area2Id, branch3Id]
 * ```
 */
export async function getDescendantNodeIds(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	nodeId: string,
): Promise<string[]> {
	if (!nodeId) {
		throw new Error("Node ID is required");
	}

	try {
		// PostgreSQL recursive CTE to get all descendants
		// Starting with the node itself, then recursively finding all children
		const result = await tenantDb.execute(sql`
      WITH RECURSIVE descendants AS (
        -- Base case: start with the specified node
        SELECT id FROM hierarchy_nodes WHERE id = ${nodeId}
        UNION
        -- Recursive case: find all children of nodes in the current set
        SELECT hn.id
        FROM hierarchy_nodes hn
        INNER JOIN descendants d ON hn.parent_id = d.id
      )
      SELECT id FROM descendants
    `);

		// Extract IDs from result rows
		// Neon HTTP returns results as array of objects
		const ids = result.rows.map((row) => {
			const id = row.id;
			if (typeof id !== "string") {
				throw new Error(`Unexpected ID type: ${typeof id}`);
			}
			return id;
		});

		return ids;
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("relation") &&
			error.message.includes("does not exist")
		) {
			throw new Error(`Node not found: ${nodeId}`);
		}
		throw new Error(
			`Failed to get descendant nodes: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Get all ancestor node IDs (including the node itself) using recursive CTE
 *
 * Traverses up the hierarchy tree to find all ancestors (parent, grandparent, etc.)
 * including the starting node itself.
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId - UUID of the starting node
 * @returns Array of node IDs (includes the starting node and all ancestors)
 * @throws Error if node not found or query fails
 *
 * @example
 * ```typescript
 * // Get all ancestors of a branch (branch -> area -> region -> country -> org)
 * const ancestorIds = await getAncestorNodeIds(tenantDb, branchNodeId);
 * // Returns: [branchNodeId, areaNodeId, regionNodeId, countryNodeId, orgNodeId]
 * ```
 */
export async function getAncestorNodeIds(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	nodeId: string,
): Promise<string[]> {
	if (!nodeId) {
		throw new Error("Node ID is required");
	}

	try {
		// PostgreSQL recursive CTE to get all ancestors
		// Starting with the node itself, then recursively finding all parents
		const result = await tenantDb.execute(sql`
      WITH RECURSIVE ancestors AS (
        -- Base case: start with the specified node
        SELECT id, parent_id FROM hierarchy_nodes WHERE id = ${nodeId}
        UNION
        -- Recursive case: find parent of nodes in the current set
        SELECT hn.id, hn.parent_id
        FROM hierarchy_nodes hn
        INNER JOIN ancestors a ON hn.id = a.parent_id
      )
      SELECT id FROM ancestors
    `);

		// Extract IDs from result rows
		const ids = result.rows.map((row) => {
			const id = row.id;
			if (typeof id !== "string") {
				throw new Error(`Unexpected ID type: ${typeof id}`);
			}
			return id;
		});

		return ids;
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("relation") &&
			error.message.includes("does not exist")
		) {
			throw new Error(`Node not found: ${nodeId}`);
		}
		throw new Error(
			`Failed to get ancestor nodes: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

/**
 * Create a hierarchy node in the tenant database
 *
 * Creates a new hierarchy node with proper depth calculation and parent relationship.
 * Does not perform validation - use validateHierarchyRules() before calling this.
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param params - Node creation parameters
 * @returns Created hierarchy node
 * @throws Error if creation fails
 *
 * @example
 * ```typescript
 * const node = await createHierarchyNode(tenantDb, {
 *   type: "branch",
 *   name: "Downtown Branch",
 *   parentId: areaNodeId,
 * });
 * ```
 */
export async function createHierarchyNode(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateHierarchyNodeParams,
) {
	const { type, name, parentId } = params;
	const depth = getDepthForType(type);

	try {
		const slug = name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		const [node] = await tenantDb
			.insert(hierarchyNodes)
			.values({
				name,
				slug,
				type,
				parentId: parentId || null,
				depth,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!node) {
			throw new Error("Failed to create hierarchy node");
		}

		return node;
	} catch (error) {
		throw new Error(
			`Failed to create hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}
