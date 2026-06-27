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
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { branchStatsCache } from "@avantej-core/db/schema/tenant/branch-stats-cache";
import { members } from "@avantej-core/db/schema/tenant/members";
import { sql, eq, inArray } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as branchStatsCacheService from "./branch-stats-cache.service";

type TenantDb = NeonDatabase<typeof tenantSchema>;
/** Transaction handle — same query surface as TenantDb. */
type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
/** Either a pooled tenant client or an in-flight transaction. */
type TenantDbOrTx = TenantDb | TenantTx;

/**
 * A hierarchy delete was blocked because the subtree still has child nodes or
 * assigned members (or no valid reassignment target). The router maps this to a
 * typed 409 CONFLICT — by `instanceof`, not by matching the message string.
 */
export class HierarchyDeleteBlockedError extends Error {
	constructor(
		message: string,
		readonly reason: "children" | "members" | "no_target",
	) {
		super(message);
		this.name = "HierarchyDeleteBlockedError";
	}
}

/** The node to delete does not exist. Router maps to 404 NOT_FOUND. */
export class HierarchyNodeNotFoundError extends Error {
	constructor(nodeId: string) {
		super(`Node not found: ${nodeId}`);
		this.name = "HierarchyNodeNotFoundError";
	}
}
import type {
	CreateHierarchyNodeParams,
	UpdateHierarchyNodeParams,
	HierarchyNodeType,
} from "./hierarchy-validation.service";
import {
	getDepthForType,
	getParentTypeForType,
} from "./hierarchy-validation.service";

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
	tenantDb: TenantDbOrTx,
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
	const { type, name, parentId, address, picUserId } = params;
	const depth = getDepthForType(type);

	// Resolve country_node_id (Phase G0 denorm).
	// organization + country rows: NULL.
	// state row: parent is the country itself.
	// branch row: parent is a state; inherit country_node_id from parent.
	let countryNodeId: string | null = null;
	if (parentId && (type === "state" || type === "branch")) {
		const parent = await tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, parentId),
		});
		if (!parent) {
			throw new Error(`Parent node not found: ${parentId}`);
		}
		if (parent.type === "country") {
			countryNodeId = parent.id;
		} else {
			countryNodeId = parent.countryNodeId ?? null;
		}
	}

	// Phase H2: auto-generate slug from name. Same algorithm as the SQL
	// backfill in migration 0058 (no diacritic stripping at this layer —
	// matches the DB constraint).
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");

	try {
		const [node] = await tenantDb
			.insert(hierarchyNodes)
			.values({
				name,
				slug,
				type,
				parentId: parentId || null,
				depth,
				countryNodeId,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!node) {
			throw new Error("Failed to create hierarchy node");
		}

		// Phase H2: branch-specific data lives in branch_details (split off
		// hierarchy_nodes). Insert lazily — only when at least one branch
		// attribute was supplied.
		if (type === "branch" && (address || picUserId)) {
			await tenantDb.insert(branchDetails).values({
				nodeId: node.id,
				address: address || null,
				picUserId: picUserId || null,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		return node;
	} catch (error) {
		throw new Error(
			`Failed to create hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`,
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
	params: UpdateHierarchyNodeParams,
) {
	if (!nodeId) {
		throw new Error("Node ID is required");
	}

	const { name, address, picUserId } = params;

	// At least one field must be provided
	if (name === undefined && address === undefined && picUserId === undefined) {
		throw new Error(
			"At least one field (name, address, picUserId) must be provided",
		);
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

		// Check for duplicate name (if name is being updated)
		if (name !== undefined && name !== node.name) {
			if (node.type === "branch") {
				// For branches: check global uniqueness
				const existingBranch = await tenantDb.query.hierarchyNodes.findFirst({
					where: (nodes, { and, eq, ne }) =>
						and(
							eq(nodes.name, name),
							eq(nodes.type, "branch"),
							ne(nodes.id, nodeId),
						),
				});

				if (existingBranch) {
					throw new Error(
						`Branch name "${name}" already exists. Branch names must be unique across your organization.`,
					);
				}
			} else if (node.parentId) {
				// For other node types: check uniqueness within parent scope
				const existingSibling = await tenantDb.query.hierarchyNodes.findFirst({
					where: (nodes, { and, eq, ne }) =>
						and(
							eq(nodes.name, name),
							eq(nodes.parentId, node.parentId!),
							eq(nodes.type, node.type),
							ne(nodes.id, nodeId),
						),
				});

				if (existingSibling) {
					throw new Error(
						`A ${node.type} with the name "${name}" already exists under the same parent`,
					);
				}
			} else {
				// For organization nodes, check if name already exists
				const existingOrg = await tenantDb.query.hierarchyNodes.findFirst({
					where: (nodes, { and, eq, ne }) =>
						and(
							eq(nodes.name, name),
							eq(nodes.type, "organization"),
							ne(nodes.id, nodeId),
						),
				});

				if (existingOrg) {
					throw new Error(
						`An organization with the name "${name}" already exists`,
					);
				}
			}
		}

		// Build update object for hierarchy_nodes (name only — branch-specific
		// columns now live in branch_details, Phase H2).
		const updateData: {
			name?: string;
			slug?: string;
			updatedAt: Date;
		} = {
			updatedAt: new Date(),
		};

		if (name !== undefined) {
			const trimmed = name.trim();
			updateData.name = trimmed;
			// Phase H2: keep slug in sync with name on rename.
			updateData.slug = trimmed
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "_")
				.replace(/^_+|_+$/g, "");
		}

		const [updatedNode] = await tenantDb
			.update(hierarchyNodes)
			.set(updateData)
			.where(eq(hierarchyNodes.id, nodeId))
			.returning();

		if (!updatedNode) {
			throw new Error("Failed to update hierarchy node");
		}

		// Phase H2: branch-specific updates routed to branch_details.
		if (address !== undefined || picUserId !== undefined) {
			if (node.type !== "branch") {
				throw new Error(
					`Cannot set address or picUserId on a ${node.type} node — only branches have those fields.`,
				);
			}
			const detailsUpdate: {
				address?: string | null;
				picUserId?: string | null;
				updatedAt: Date;
			} = { updatedAt: new Date() };
			if (address !== undefined) {
				detailsUpdate.address = address?.trim() || null;
			}
			if (picUserId !== undefined) {
				detailsUpdate.picUserId = picUserId?.trim() || null;
			}
			// Upsert: insert if no row yet, update otherwise.
			await tenantDb
				.insert(branchDetails)
				.values({
					nodeId,
					address: detailsUpdate.address ?? null,
					picUserId: detailsUpdate.picUserId ?? null,
					createdAt: new Date(),
					updatedAt: detailsUpdate.updatedAt,
				})
				.onConflictDoUpdate({
					target: branchDetails.nodeId,
					set: detailsUpdate,
				});
		}

		return updatedNode;
	} catch (error) {
		throw new Error(
			`Failed to update hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`,
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
	tenantDb: TenantDbOrTx,
	nodeId: string,
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
			and(eq(nodes.depth, 0), eq(nodes.type, "organization")),
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
	tenantDb: TenantDbOrTx,
	parentId: string,
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
	tenantDb: TenantDb,
	nodeId: string,
	options: DeleteHierarchyNodeOptions = {},
) {
	if (!nodeId) {
		throw new Error("Node ID is required");
	}

	const { autoDeleteChildren = true, autoReassignMembers = true } = options;

	try {
		// Run the whole delete in ONE transaction so the tree can never be left
		// half-deleted: every guard either lets the full delete commit, or aborts
		// before any row is touched / rolls everything back. (UAT §8.)
		return await tenantDb.transaction(async (tx) => {
			// Check if node exists
			const node = await tx.query.hierarchyNodes.findFirst({
				where: eq(hierarchyNodes.id, nodeId),
			});

			if (!node) {
				throw new HierarchyNodeNotFoundError(nodeId);
			}

			// Full subtree (self + all descendants) — the unit we reason about.
			const subtreeIds = await getDescendantNodeIds(tx, nodeId);

			// Direct child nodes (drives the block-on-children rule).
			const activeChildNodes = await tx.query.hierarchyNodes.findMany({
				where: eq(hierarchyNodes.parentId, nodeId),
			});

			if (activeChildNodes.length > 0 && !autoDeleteChildren) {
				throw new HierarchyDeleteBlockedError(
					`Cannot delete node "${node.name}" because it has ${activeChildNodes.length} active child node(s). Please delete or move the child nodes first.`,
					"children",
				);
			}

			// Members assigned ANYWHERE in the subtree — not just the direct node.
			// A descendant member is the real cause of the FK-restrict 500 the old
			// code hit; we surface it as a typed conflict (block) or reassign the
			// whole subtree up-front (cascade) so the child deletes never violate FK.
			const subtreeMembers = await tx.query.members.findMany({
				where: inArray(members.hierarchyScopeId, subtreeIds),
				columns: { id: true },
			});

			if (subtreeMembers.length > 0) {
				if (!autoReassignMembers) {
					// BLOCK: leave the subtree completely intact.
					throw new HierarchyDeleteBlockedError(
						`Cannot delete node "${node.name}" because it (or a child node) has ${subtreeMembers.length} assigned member(s). Please reassign or remove the members first.`,
						"members",
					);
				}
				// CASCADE: reassign every subtree member to the target BEFORE any node
				// is deleted, so no member ever references a node about to disappear.
				const targetNodeId = await findReassignTarget(tx, nodeId);
				if (!targetNodeId || subtreeIds.includes(targetNodeId)) {
					throw new HierarchyDeleteBlockedError(
						`Cannot delete node "${node.name}" because it has ${subtreeMembers.length} assigned member(s) and no valid target node found for reassignment.`,
						"no_target",
					);
				}
				await tx
					.update(members)
					.set({ hierarchyScopeId: targetNodeId })
					.where(inArray(members.hierarchyScopeId, subtreeIds));
			}

			// Now safe to delete children (no members reference them anymore).
			if (activeChildNodes.length > 0 && autoDeleteChildren) {
				await recursivelyDeleteChildren(tx, nodeId);
			}

			// Hard delete the node itself.
			await tx.delete(hierarchyNodes).where(eq(hierarchyNodes.id, nodeId));

			return node; // Return the deleted node info
		});
	} catch (error) {
		// Preserve typed block/not-found errors so the router maps them by
		// instanceof (not by string-matching a re-wrapped message).
		if (
			error instanceof HierarchyDeleteBlockedError ||
			error instanceof HierarchyNodeNotFoundError
		) {
			throw error;
		}
		throw new Error(
			`Failed to delete hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`,
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
	newParentId: string,
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
		const expectedParentType = getParentTypeForType(
			node.type as HierarchyNodeType,
		);
		if (!expectedParentType) {
			throw new Error(`Cannot move ${node.type} node: it cannot have a parent`);
		}

		if (newParent.type !== expectedParentType) {
			throw new Error(
				`Invalid parent type: ${node.type} must be under ${expectedParentType}, but parent is ${newParent.type}`,
			);
		}

		// Validate depth constraint
		const expectedParentDepth = getDepthForType(expectedParentType);
		if (newParent.depth !== expectedParentDepth) {
			throw new Error(
				`Parent depth mismatch: expected ${expectedParentDepth}, got ${newParent.depth}`,
			);
		}

		// Check for circular reference: new parent cannot be a descendant of this node
		const descendantIds = await getDescendantNodeIds(tenantDb, nodeId);
		if (descendantIds.includes(newParentId)) {
			throw new Error("Cannot move node: would create circular reference");
		}

		// Check for duplicate name
		if (node.type === "branch") {
			// For branches: check global uniqueness
			const existingBranch = await tenantDb.query.hierarchyNodes.findFirst({
				where: (nodes, { and, eq, ne }) =>
					and(
						eq(nodes.name, node.name),
						eq(nodes.type, "branch"),
						ne(nodes.id, nodeId),
					),
			});

			if (existingBranch) {
				throw new Error(
					`Branch name "${node.name}" already exists. Branch names must be unique across your organization.`,
				);
			}
		} else {
			// For other types: check within new parent scope
			const existingSibling = await tenantDb.query.hierarchyNodes.findFirst({
				where: (nodes, { and, eq, ne }) =>
					and(
						eq(nodes.name, node.name),
						eq(nodes.parentId, newParentId),
						eq(nodes.type, node.type),
						ne(nodes.id, nodeId),
					),
			});

			if (existingSibling) {
				throw new Error(
					`A ${node.type} with the name "${node.name}" already exists under the new parent`,
				);
			}
		}

		// Resolve new country_node_id (Phase G0 denorm).
		// state moving: new parent is country itself → countryNodeId = newParent.id
		// branch moving: new parent is state → inherit newParent.countryNodeId
		const newCountryNodeId =
			node.type === "state"
				? newParent.id
				: node.type === "branch"
					? (newParent.countryNodeId ?? null)
					: null;

		// Update the node's parentId + countryNodeId
		const [updatedNode] = await tenantDb
			.update(hierarchyNodes)
			.set({
				parentId: newParentId,
				countryNodeId: newCountryNodeId,
				updatedAt: new Date(),
			})
			.where(eq(hierarchyNodes.id, nodeId))
			.returning();

		if (!updatedNode) {
			throw new Error("Failed to move hierarchy node");
		}

		// If a state moved across countries, cascade country_node_id update to all branches under it
		if (node.type === "state" && node.countryNodeId !== newCountryNodeId) {
			await tenantDb
				.update(hierarchyNodes)
				.set({ countryNodeId: newCountryNodeId, updatedAt: new Date() })
				.where(eq(hierarchyNodes.parentId, nodeId));
		}

		return updatedNode;
	} catch (error) {
		throw new Error(
			`Failed to move hierarchy node: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
	}
}

// ---------------------------------------------------------------------------
// listNodesWithStats (task 1.14)
// ---------------------------------------------------------------------------

export interface NodeWithStats {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
	address: string | null;
	openingHours: unknown | null;
	membersCount: number | null;
	staffCount: number | null;
	monthRevenueCents: number | null;
	stale: boolean;
}

/**
 * List hierarchy nodes enriched with stats from branch_stats_cache.
 *
 * - Admin members see ALL nodes; staff members see only their accessibleNodeIds.
 * - Stats are read ONLY from the cache table (never computed inline).
 * - Cache miss → stale: true + null stats; a debounced refresh is enqueued.
 *
 * RBAC: caller must hold `hierarchy_management:read`.
 */
export async function listNodesWithStats(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	options: {
		accessibleNodeIds: string[];
		isAdmin: boolean;
	},
): Promise<NodeWithStats[]> {
	// 1. Fetch all (or scoped) hierarchy nodes
	const allNodes = await tenantDb
		.select()
		.from(hierarchyNodes)
		.orderBy(hierarchyNodes.depth, hierarchyNodes.name);

	const scopedNodes = options.isAdmin
		? allNodes
		: allNodes.filter((n) => options.accessibleNodeIds.includes(n.id));

	if (scopedNodes.length === 0) return [];

	// 2. Fetch all cached stats rows for these nodes in one query
	const nodeIds = scopedNodes.map((n) => n.id);
	const cacheRows =
		nodeIds.length > 0
			? await tenantDb
					.select()
					.from(branchStatsCache)
					.where(inArray(branchStatsCache.hierarchyNodeId, nodeIds))
			: [];

	const cacheMap = new Map(cacheRows.map((r) => [r.hierarchyNodeId, r]));

	// 3. Merge and enqueue refresh for cache misses
	return scopedNodes.map((node) => {
		const cached = cacheMap.get(node.id);

		if (!cached) {
			// Cache miss — enqueue debounced refresh for all three kinds
			branchStatsCacheService.refresh(tenantDb, node.id, "members");
			branchStatsCacheService.refresh(tenantDb, node.id, "staff");
			branchStatsCacheService.refresh(tenantDb, node.id, "revenue");

			return {
				id: node.id,
				name: node.name,
				type: node.type,
				depth: node.depth,
				parentId: node.parentId ?? null,
				address: null,
				openingHours: null,
				membersCount: null,
				staffCount: null,
				monthRevenueCents: null,
				stale: true,
			};
		}

		// Staleness: data older than 5 minutes is considered stale
		const staleness =
			Date.now() - new Date(cached.computedAt).getTime() > 5 * 60 * 1000;

		return {
			id: node.id,
			name: node.name,
			type: node.type,
			depth: node.depth,
			parentId: node.parentId ?? null,
			address: null,
			openingHours: null,
			membersCount: cached.membersCount,
			staffCount: cached.staffCount,
			monthRevenueCents: cached.monthRevenueCents,
			stale: staleness,
		};
	});
}
