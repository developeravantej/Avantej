import {
	getDescendantNodeIds,
	moveHierarchyNode,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	tryGetControlPanelDb,
	type ControlPanelDb,
} from "../../lib/context-helpers";

export const hierarchyMoveProcedures = {
	/**
	 * Move a hierarchy node to a new parent
	 */
	moveNode: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				nodeId: z.string().uuid(),
				newParentId: z.string().uuid(),
			}),
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
			await requirePermissionOrpc(
				tenantDb,
				member,
				"hierarchy_management",
				"update",
			);

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
				const node = await moveHierarchyNode(
					tenantDb,
					input.nodeId,
					input.newParentId,
				);

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
				let ghlSync: {
					status: "synced" | "skipped" | "error";
					[k: string]: unknown;
				} | null = null;
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
									controlPanelDb: ControlPanelDb;
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
						const cpDb = tryGetControlPanelDb(context);
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
};
