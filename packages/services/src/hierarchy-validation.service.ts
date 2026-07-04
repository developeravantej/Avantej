/**
 * Hierarchy Validation Service
 *
 * Validates hierarchy rules for creating hierarchy nodes.
 * Ensures proper parent-child relationships, depth constraints, and uniqueness.
 *
 * Usage:
 * ```typescript
 * import { validateHierarchyRules } from "@avantej-core/services";
 *
 * await validateHierarchyRules(tenantDb, {
 *   type: "branch",
 *   name: "Downtown Branch",
 *   parentId: stateNodeId,
 * });
 * ```
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

export type HierarchyNodeType = "organization" | "country" | "state" | "branch";

export interface CreateHierarchyNodeParams {
	type: HierarchyNodeType;
	name: string;
	code?: string;
	parentId?: string | null;
	address?: string | null; // Branch-specific: physical address
	picUserId?: string | null; // Branch-specific: Person In Charge user ID
	// WS3 branch company/tax profile (branch-specific, all optional).
	companyLegalName?: string | null;
	registrationNumber?: string | null;
	taxId?: string | null;
	invoicePrefix?: string | null;
	receiptPrefix?: string | null;
	branchTaxRateId?: string | null;
}

export interface UpdateHierarchyNodeParams {
	name?: string;
	address?: string | null;
	picUserId?: string | null;
	// WS3 branch company/tax profile (branch-specific, all optional).
	companyLegalName?: string | null;
	registrationNumber?: string | null;
	taxId?: string | null;
	invoicePrefix?: string | null;
	receiptPrefix?: string | null;
	branchTaxRateId?: string | null;
}

/**
 * Get expected depth for a hierarchy node type
 */
export function getDepthForType(type: HierarchyNodeType): number {
	const depthMap: Record<HierarchyNodeType, number> = {
		organization: 0,
		country: 1,
		state: 2,
		branch: 3,
	};
	return depthMap[type];
}

/**
 * Get expected parent type for a hierarchy node type
 */
export function getParentTypeForType(
	type: HierarchyNodeType,
): HierarchyNodeType | null {
	const parentMap: Record<HierarchyNodeType, HierarchyNodeType | null> = {
		organization: null,
		country: "organization",
		state: "country",
		branch: "state",
	};
	return parentMap[type];
}

/**
 * Validate hierarchy rules for creating a node
 *
 * @param tenantDb - Drizzle client for the tenant database
 * @param params - Node creation parameters
 * @throws Error if validation fails
 */
export async function validateHierarchyRules(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	params: CreateHierarchyNodeParams,
): Promise<void> {
	const { type, name, parentId } = params;
	const expectedParentType = getParentTypeForType(type);

	// Rule 1: Organization cannot have a parent
	if (type === "organization" && parentId) {
		throw new Error("Organization node cannot have a parent");
	}

	// Rule 2: Non-organization nodes must have a parent
	if (type !== "organization" && !parentId) {
		throw new Error(`${type} node must have a parent`);
	}

	// Rule 3: Validate parent exists and is correct type
	if (parentId) {
		const parent = await tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, parentId),
		});

		if (!parent) {
			throw new Error(`Parent node not found: ${parentId}`);
		}

		if (parent.type !== expectedParentType) {
			throw new Error(
				`Invalid parent type: ${type} must be under ${expectedParentType}, but parent is ${parent.type}`,
			);
		}

		// Rule 4: Validate parent depth matches expected parent depth
		const expectedParentDepth = expectedParentType
			? getDepthForType(expectedParentType)
			: -1;
		if (parent.depth !== expectedParentDepth) {
			throw new Error(
				`Parent depth mismatch: expected ${expectedParentDepth}, got ${parent.depth}`,
			);
		}
	}

	// Rule 5: Check for duplicate names
	if (type === "branch") {
		// For branches: check global uniqueness (enforced by database constraint)
		const existingBranch = await tenantDb.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.name, name),
				eq(hierarchyNodes.type, "branch"),
			),
		});

		if (existingBranch) {
			throw new Error(
				`Branch name "${name}" already exists. Branch names must be unique across your organization.`,
			);
		}
	} else if (parentId) {
		// For other node types: check uniqueness within parent scope
		const existingNode = await tenantDb.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.name, name),
				eq(hierarchyNodes.parentId, parentId),
				eq(hierarchyNodes.type, type),
			),
		});

		if (existingNode) {
			throw new Error(
				`Duplicate ${type} name "${name}" already exists under the same parent`,
			);
		}
	} else {
		// For organization nodes, check if organization already exists
		const existingOrg = await tenantDb.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.type, "organization"),
				eq(hierarchyNodes.name, name),
			),
		});

		if (existingOrg) {
			throw new Error(`Organization "${name}" already exists`);
		}
	}
}

/**
 * Validate parent accessibility
 *
 * Ensures the parent node is accessible to the user (within their hierarchy scope).
 *
 * @param parentId - UUID of the parent node
 * @param accessibleNodeIds - Array of node IDs the user can access
 * @throws Error if parent is not accessible
 */
export function validateParentAccess(
	parentId: string,
	accessibleNodeIds: string[],
): void {
	if (!accessibleNodeIds.includes(parentId)) {
		throw new Error(
			`Parent node ${parentId} is not accessible within your hierarchy scope`,
		);
	}
}
