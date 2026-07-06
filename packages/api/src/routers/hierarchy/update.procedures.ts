import {
	type UpdateHierarchyNodeParams,
	getDescendantNodeIds,
	updateHierarchyNode,
} from "@avantej-core/services";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { organizationBranches } from "@avantej-core/db/schema/control-panel/organization-branches";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	assertTenantContext,
} from "../../guards";
import { tryGetControlPanelDb } from "../../lib/context-helpers";
import type { ControlPanelDb } from "../../lib/context-helpers";

export const hierarchyUpdateProcedures = {
	/**
	 * Update a hierarchy node
	 */
	updateNode: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				nodeId: z.string().uuid(),
				name: z.string().min(1).optional(),
				address: z.string().nullable().optional(),
				picUserId: z.string().nullable().optional(),
				// WS3 branch company/tax profile (branch-only, all optional).
				companyLegalName: z.string().nullable().optional(),
				registrationNumber: z.string().nullable().optional(),
				taxId: z.string().nullable().optional(),
				invoicePrefix: z.string().nullable().optional(),
				receiptPrefix: z.string().nullable().optional(),
				branchTaxRateId: z.string().uuid().nullable().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			assertTenantContext(context);
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
			await requirePermissionOrpc(
				tenantDb,
				member,
				"hierarchy_management",
				"update",
			);

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
			if (input.companyLegalName !== undefined) {
				updateParams.companyLegalName = input.companyLegalName;
			}
			if (input.registrationNumber !== undefined) {
				updateParams.registrationNumber = input.registrationNumber;
			}
			if (input.taxId !== undefined) {
				updateParams.taxId = input.taxId;
			}
			if (input.invoicePrefix !== undefined) {
				updateParams.invoicePrefix = input.invoicePrefix;
			}
			if (input.receiptPrefix !== undefined) {
				updateParams.receiptPrefix = input.receiptPrefix;
			}
			if (input.branchTaxRateId !== undefined) {
				updateParams.branchTaxRateId = input.branchTaxRateId;
			}

			// Capture pre-update state for GHL branch rename sync.
			const preUpdateNode = await tenantDb.query.hierarchyNodes.findFirst({
				where: eq(hierarchyNodes.id, input.nodeId),
			});

			// Update node
			try {
				const node = await updateHierarchyNode(
					tenantDb,
					input.nodeId,
					updateParams,
				);

				// Fetch branch-specific details (split off into branch_details in H2)
				let nodeAddress: string | null = null;
				let nodePicUserId: string | null = null;
				let nodeCompanyLegalName: string | null = null;
				let nodeRegistrationNumber: string | null = null;
				let nodeTaxId: string | null = null;
				let nodeInvoicePrefix: string | null = null;
				let nodeReceiptPrefix: string | null = null;
				let nodeBranchTaxRateId: string | null = null;
				if (node.type === "branch") {
					const details = await tenantDb.query.branchDetails.findFirst({
						where: eq(branchDetails.nodeId, node.id),
					});
					nodeAddress = details?.address ?? null;
					nodePicUserId = details?.picUserId ?? null;
					nodeCompanyLegalName = details?.companyLegalName ?? null;
					nodeRegistrationNumber = details?.registrationNumber ?? null;
					nodeTaxId = details?.taxId ?? null;
					nodeInvoicePrefix = details?.invoicePrefix ?? null;
					nodeReceiptPrefix = details?.receiptPrefix ?? null;
					nodeBranchTaxRateId = details?.branchTaxRateId ?? null;
				}

				// Sync updates to control panel organization_branches registry
				const controlPanelDb = tryGetControlPanelDb(context);
				if (controlPanelDb) {
					// Branch name/address update → update the branch row
					if (
						node.type === "branch" &&
						(input.name !== undefined || input.address !== undefined)
					) {
						try {
							const syncData: {
								name?: string;
								address?: string | null;
								updatedAt: Date;
							} = {
								updatedAt: new Date(),
							};
							if (input.name !== undefined) syncData.name = node.name;
							if (input.address !== undefined) syncData.address = nodeAddress;

							await controlPanelDb
								.update(organizationBranches)
								.set(syncData)
								.where(eq(organizationBranches.tenantNodeId, input.nodeId));
						} catch (syncError) {
							console.error(
								"Failed to sync branch update to organization_branches:",
								syncError,
							);
						}
					}

					// Country rename → update country name on all branches under this country
					if (node.type === "country" && input.name !== undefined) {
						try {
							await controlPanelDb
								.update(organizationBranches)
								.set({ country: node.name, updatedAt: new Date() })
								.where(
									eq(organizationBranches.countryTenantNodeId, input.nodeId),
								);
						} catch (syncError) {
							console.error(
								"Failed to sync country rename to organization_branches:",
								syncError,
							);
						}
					}
				}

				// Fire-and-forget GHL branch rename sync.
				let ghlSync: {
					status: "synced" | "skipped" | "error";
					[k: string]: unknown;
				} | null = null;
				if (
					node.type === "branch" &&
					preUpdateNode &&
					input.name !== undefined &&
					preUpdateNode.name !== input.name &&
					context.organizationId
				) {
					const dispatchBranchRename = context.honoContext?.get(
						"dispatchBranchRename",
					) as
						| ((args: {
								controlPanelDb: ControlPanelDb;
								tenantDb: typeof tenantDb;
								organizationId: string;
								branchNodeId: string;
								oldBranchName: string;
						  }) => Promise<{
								status: "synced" | "skipped" | "error";
								[k: string]: unknown;
						  }>)
						| undefined;
					const cpDb = tryGetControlPanelDb(context);
					if (dispatchBranchRename && cpDb) {
						try {
							ghlSync = await dispatchBranchRename({
								controlPanelDb: cpDb,
								tenantDb,
								organizationId: context.organizationId,
								branchNodeId: node.id,
								oldBranchName: preUpdateNode.name,
							});
						} catch (err) {
							console.error("GHL branch rename sync failed:", err);
							ghlSync = {
								status: "error",
								error: err instanceof Error ? err.message : String(err),
							};
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
					companyLegalName: nodeCompanyLegalName,
					registrationNumber: nodeRegistrationNumber,
					taxId: nodeTaxId,
					invoicePrefix: nodeInvoicePrefix,
					receiptPrefix: nodeReceiptPrefix,
					branchTaxRateId: nodeBranchTaxRateId,
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
};
