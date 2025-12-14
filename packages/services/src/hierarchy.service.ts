/**
 * Hierarchy Service
 *
 * Provides utilities for working with organizational hierarchy trees.
 * Uses PostgreSQL recursive CTEs for efficient hierarchy traversal.
 *
 * Usage:
 * ```typescript
 * import { getDescendantNodeIds, createHierarchyNode } from "@avantej-core/services";
 *
 * const descendantIds = await getDescendantNodeIds(tenantDb, nodeId);
 * const newNode = await createHierarchyNode(tenantDb, { type: "branch", name: "Downtown", parentId: areaId });
 * ```
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { sql, eq, and } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type {
  CreateHierarchyNodeParams,
  UpdateHierarchyNodeParams,
  HierarchyNodeType,
} from "./hierarchy-validation.service";
import { getDepthForType, getParentTypeForType } from "./hierarchy-validation.service";

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
  nodeId: string
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
      `Failed to get descendant nodes: ${error instanceof Error ? error.message : "Unknown error"}`
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
  nodeId: string
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
      `Failed to get ancestor nodes: ${error instanceof Error ? error.message : "Unknown error"}`
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
  params: CreateHierarchyNodeParams
) {
  const { type, name, parentId, address, picUserId } = params;
  const depth = getDepthForType(type);

  try {
    const [node] = await tenantDb
      .insert(hierarchyNodes)
      .values({
        name,
        type,
        parentId: parentId || null,
        depth,
        address: address || null,
        picUserId: picUserId || null,
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
      `Failed to create hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Update a hierarchy node in the tenant database
 *
 * Updates the node's fields (name, address, picUserId) and updatedAt timestamp.
 * Validates that the node exists and that the new name doesn't conflict with siblings.
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId - UUID of the node to update
 * @param params - Update parameters (name, address, picUserId)
 * @returns Updated hierarchy node
 * @throws Error if node not found, name conflict, or update fails
 *
 * @example
 * ```typescript
 * const updatedNode = await updateHierarchyNode(tenantDb, nodeId, {
 *   name: "New Branch Name",
 *   address: "123 Main St",
 *   picUserId: "user-123"
 * });
 * ```
 */
export async function updateHierarchyNode(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  nodeId: string,
  params: UpdateHierarchyNodeParams
) {
  if (!nodeId) {
    throw new Error("Node ID is required");
  }

  const { name, address, picUserId } = params;

  // At least one field must be provided
  if (name === undefined && address === undefined && picUserId === undefined) {
    throw new Error("At least one field (name, address, picUserId) must be provided");
  }

  // Validate name if provided
  if (name !== undefined && name.trim().length === 0) {
    throw new Error("Node name cannot be empty");
  }

  try {
    // First, get the node to check it exists and get its parentId
    const node = await tenantDb.query.hierarchyNodes.findFirst({
      where: eq(hierarchyNodes.id, nodeId),
    });

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Check for duplicate name within the same parent scope (if name is being updated)
    if (name !== undefined && name !== node.name) {
      if (node.parentId) {
        const existingSibling = await tenantDb.query.hierarchyNodes.findFirst({
          where: (nodes, { and, eq, ne }) =>
            and(
              eq(nodes.name, name),
              eq(nodes.parentId, node.parentId!),
              eq(nodes.type, node.type),
              ne(nodes.id, nodeId)
            ),
        });

        if (existingSibling) {
          throw new Error(
            `A ${node.type} with the name "${name}" already exists under the same parent`
          );
        }
      } else {
        // For organization nodes, check if name already exists
        const existingOrg = await tenantDb.query.hierarchyNodes.findFirst({
          where: (nodes, { and, eq, ne }) =>
            and(
              eq(nodes.name, name),
              eq(nodes.type, "organization"),
              ne(nodes.id, nodeId)
            ),
        });

        if (existingOrg) {
          throw new Error(`An organization with the name "${name}" already exists`);
        }
      }
    }

    // Build update object with only provided fields
    const updateData: {
      name?: string;
      address?: string | null;
      picUserId?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      updateData.name = name.trim();
    }
    if (address !== undefined) {
      updateData.address = address?.trim() || null;
    }
    if (picUserId !== undefined) {
      updateData.picUserId = picUserId?.trim() || null;
    }

    // Update the node
    const [updatedNode] = await tenantDb
      .update(hierarchyNodes)
      .set(updateData)
      .where(eq(hierarchyNodes.id, nodeId))
      .returning();

    if (!updatedNode) {
      throw new Error("Failed to update hierarchy node");
    }

    return updatedNode;
  } catch (error) {
    throw new Error(
      `Failed to update hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Options for deleting a hierarchy node
 */
export interface DeleteHierarchyNodeOptions {
  /**
   * Automatically hard-delete all child nodes recursively
   * @default true
   */
  autoDeleteChildren?: boolean;
  /**
   * Automatically reassign members to parent node (or org root if no parent)
   * @default true
   */
  autoReassignMembers?: boolean;
}

/**
 * Find the target node for reassigning members when a node is deleted
 *
 * Priority:
 * 1. Parent node (if exists)
 * 2. Organization root (if no valid parent)
 * 3. null (if no valid target found)
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId - UUID of the node being deleted
 * @returns UUID of the target node for reassignment, or null if not found
 */
async function findReassignTarget(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  nodeId: string
): Promise<string | null> {
  // Get the node being deleted
  const node = await tenantDb.query.hierarchyNodes.findFirst({
    where: eq(hierarchyNodes.id, nodeId),
  });

  if (!node) {
    return null;
  }

  // Priority 1: Try parent node (if exists)
  if (node.parentId) {
    const parent = await tenantDb.query.hierarchyNodes.findFirst({
      where: eq(hierarchyNodes.id, node.parentId!),
    });

    if (parent) {
      return parent.id;
    }
  }

  // Priority 2: Find organization root (depth = 0, type = "organization")
  const orgRoot = await tenantDb.query.hierarchyNodes.findFirst({
    where: (nodes, { and, eq }) =>
      and(
        eq(nodes.depth, 0),
        eq(nodes.type, "organization")
      ),
  });

  if (orgRoot) {
    return orgRoot.id;
  }

  // No valid target found
  return null;
}

/**
 * Recursively hard-delete all child nodes
 *
 * Deletes all children and their descendants recursively before deleting the parent.
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param parentId - UUID of the parent node
 */
async function recursivelyDeleteChildren(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  parentId: string
): Promise<void> {
  // Get all direct children
  const children = await tenantDb.query.hierarchyNodes.findMany({
    where: eq(hierarchyNodes.parentId, parentId),
  });

  // Recursively delete each child's children first
  for (const child of children) {
    await recursivelyDeleteChildren(tenantDb, child.id);
  }

  // Then hard delete all children
  await tenantDb
    .delete(hierarchyNodes)
    .where(eq(hierarchyNodes.parentId, parentId));
}

/**
 * Hard delete a hierarchy node from the tenant database
 *
 * Validates that the node can be deleted:
 * - Node must exist
 * - Node must not have child nodes (unless autoDeleteChildren is true)
 * - Node must not have assigned members (unless autoReassignMembers is true)
 *
 * Performs hard delete by permanently removing the record from the database.
 *
 * With auto-handling enabled (default):
 * - Automatically hard-deletes all child nodes recursively
 * - Automatically reassigns members to parent node (or org root if no parent)
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId - UUID of the node to delete
 * @param options - Options for automatic handling of children and members
 * @returns Deleted node information
 * @throws Error if node cannot be deleted (when auto-handling is disabled and constraints exist)
 *
 * @example
 * ```typescript
 * // Default: auto-handle children and members
 * await deleteHierarchyNode(tenantDb, nodeId);
 *
 * // Explicit options
 * await deleteHierarchyNode(tenantDb, nodeId, {
 *   autoDeleteChildren: true,
 *   autoReassignMembers: true,
 * });
 *
 * // Manual handling (throw errors if constraints exist)
 * await deleteHierarchyNode(tenantDb, nodeId, {
 *   autoDeleteChildren: false,
 *   autoReassignMembers: false,
 * });
 * ```
 */
export async function deleteHierarchyNode(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  nodeId: string,
  options: DeleteHierarchyNodeOptions = {}
) {
  if (!nodeId) {
    throw new Error("Node ID is required");
  }

  const {
    autoDeleteChildren = true,
    autoReassignMembers = true,
  } = options;

  try {
    // Check if node exists
    const node = await tenantDb.query.hierarchyNodes.findFirst({
      where: eq(hierarchyNodes.id, nodeId),
    });

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Check if node has child nodes
    const activeChildNodes = await tenantDb.query.hierarchyNodes.findMany({
      where: eq(hierarchyNodes.parentId, nodeId),
    });

    // Handle children based on options
    if (activeChildNodes.length > 0) {
      if (autoDeleteChildren) {
        // Recursively hard-delete all children
        await recursivelyDeleteChildren(tenantDb, nodeId);
      } else {
        // Throw error if auto-delete is disabled
        throw new Error(
          `Cannot delete node "${node.name}" because it has ${activeChildNodes.length} active child node(s). Please delete or move the child nodes first.`
        );
      }
    }

    // Check if node has assigned members
    const assignedMembers = await tenantDb.query.members.findMany({
      where: eq(members.hierarchyScopeId, nodeId),
    });

    // Handle members based on options
    if (assignedMembers.length > 0) {
      if (autoReassignMembers) {
        // Find target node for reassignment
        const targetNodeId = await findReassignTarget(tenantDb, nodeId);

        if (!targetNodeId) {
          throw new Error(
            `Cannot delete node "${node.name}" because it has ${assignedMembers.length} assigned member(s) and no valid target node found for reassignment.`
          );
        }

        // Reassign all members to target node
        await tenantDb
          .update(members)
          .set({
            hierarchyScopeId: targetNodeId,
          })
          .where(eq(members.hierarchyScopeId, nodeId));
      } else {
        // Throw error if auto-reassign is disabled
        throw new Error(
          `Cannot delete node "${node.name}" because it has ${assignedMembers.length} assigned member(s). Please reassign or remove the members first.`
        );
      }
    }

    // Hard delete: Actually delete the record
    await tenantDb
      .delete(hierarchyNodes)
      .where(eq(hierarchyNodes.id, nodeId));

    return node; // Return the deleted node info
  } catch (error) {
    throw new Error(
      `Failed to delete hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Move a hierarchy node to a new parent
 *
 * Validates that the move is valid:
 * - New parent must exist and be correct type
 * - Must not create circular reference
 * - Must maintain depth constraints
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param nodeId - UUID of the node to move
 * @param newParentId - UUID of the new parent node
 * @returns Updated hierarchy node
 * @throws Error if move is invalid
 *
 * @example
 * ```typescript
 * const movedNode = await moveHierarchyNode(tenantDb, branchId, newAreaId);
 * ```
 */
export async function moveHierarchyNode(
  tenantDb: NeonDatabase<typeof tenantSchema>,
  nodeId: string,
  newParentId: string
) {
  if (!nodeId || !newParentId) {
    throw new Error("Node ID and new parent ID are required");
  }

  try {
    // Get the node to move
    const node = await tenantDb.query.hierarchyNodes.findFirst({
      where: eq(hierarchyNodes.id, nodeId),
    });

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    // Get the new parent node
    const newParent = await tenantDb.query.hierarchyNodes.findFirst({
      where: eq(hierarchyNodes.id, newParentId),
    });

    if (!newParent) {
      throw new Error(`New parent node not found: ${newParentId}`);
    }

    // Validate parent type matches expected type for this node
    const expectedParentType = getParentTypeForType(node.type as HierarchyNodeType);
    if (!expectedParentType) {
      throw new Error(`Cannot move ${node.type} node: it cannot have a parent`);
    }

    if (newParent.type !== expectedParentType) {
      throw new Error(
        `Invalid parent type: ${node.type} must be under ${expectedParentType}, but parent is ${newParent.type}`
      );
    }

    // Validate depth constraint
    const expectedParentDepth = getDepthForType(expectedParentType);
    if (newParent.depth !== expectedParentDepth) {
      throw new Error(
        `Parent depth mismatch: expected ${expectedParentDepth}, got ${newParent.depth}`
      );
    }

    // Check for circular reference: new parent cannot be a descendant of this node
    const descendantIds = await getDescendantNodeIds(tenantDb, nodeId);
    if (descendantIds.includes(newParentId)) {
      throw new Error("Cannot move node: would create circular reference");
    }

    // Check for duplicate name within new parent scope
    const existingSibling = await tenantDb.query.hierarchyNodes.findFirst({
      where: (nodes, { and, eq, ne }) =>
        and(
          eq(nodes.name, node.name),
          eq(nodes.parentId, newParentId),
          eq(nodes.type, node.type),
          ne(nodes.id, nodeId)
        ),
    });

    if (existingSibling) {
      throw new Error(
        `A ${node.type} with the name "${node.name}" already exists under the new parent`
      );
    }

    // Update the node's parentId
    const [updatedNode] = await tenantDb
      .update(hierarchyNodes)
      .set({
        parentId: newParentId,
        updatedAt: new Date(),
      })
      .where(eq(hierarchyNodes.id, nodeId))
      .returning();

    if (!updatedNode) {
      throw new Error("Failed to move hierarchy node");
    }

    return updatedNode;
  } catch (error) {
    throw new Error(
      `Failed to move hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}


