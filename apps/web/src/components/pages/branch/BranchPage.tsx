import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Store, Loader2, Maximize2 } from "lucide-react";
import { toast } from "sonner";

import { client, orpc, queryClient } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { cn } from "@/lib/utils";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EditBranchDialog } from "./EditBranchDialog";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { TreeRow } from "./TreeRow";
import { buildBreadcrumb, buildTree } from "./tree";
import type { HierarchyNode, NodeWithStats, OpeningHoursShape } from "./types";

// ─── Branch Page ───────────────────────────────────────────────────────────────

export function BranchPage() {
	const { data: session, isPending: authLoading } = authClient.useSession();
	const isAuthenticated = !!session?.user;
	const {
		data: userContext,
		isLoading: isLoadingContext,
		hasPermission,
	} = useUserContext();
	const canDelete = hasPermission("hierarchy_management:delete");
	const navigate = useNavigate();
	const orgErrorShown = useRef(false);

	// Edit dialog state
	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [editingNode, setEditingNode] = useState<NodeWithStats | null>(null);
	const [editName, setEditName] = useState("");
	const [editAddress, setEditAddress] = useState("");
	const [editPicUserId, setEditPicUserId] = useState("");
	const [editCountryId, setEditCountryId] = useState("");
	const [editRegionId, setEditRegionId] = useState("");
	const [editAreaId, setEditAreaId] = useState("");
	// WS3 branch company/tax profile edit state (branches only).
	const [editCompanyLegalName, setEditCompanyLegalName] = useState("");
	const [editRegistrationNumber, setEditRegistrationNumber] = useState("");
	const [editTaxId, setEditTaxId] = useState("");
	const [editInvoicePrefix, setEditInvoicePrefix] = useState("");
	const [editReceiptPrefix, setEditReceiptPrefix] = useState("");
	const [editBranchTaxRateId, setEditBranchTaxRateId] = useState("");
	const [editOpeningHours, setEditOpeningHours] = useState<OpeningHoursShape>(
		{},
	);
	const [allNodes, setAllNodes] = useState<HierarchyNode[]>([]);

	// Tree expand state
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [allExpanded, setAllExpanded] = useState(false);

	// Delete confirmation state
	const [deletingNode, setDeletingNode] = useState<NodeWithStats | null>(null);

	const rawOrgId = userContext?.currentOrganizationId ?? null;
	const organizationId =
		rawOrgId &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
			rawOrgId,
		)
			? rawOrgId
			: null;

	// ── Data: listNodesWithStats ──────────────────────────────────────────────
	const {
		data: nodesData,
		isLoading: isLoadingNodes,
		error: nodesError,
	} = useQuery({
		...orpc.hierarchy.listNodesWithStats.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId && isAuthenticated,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchOnMount: true,
	});

	// ── Flat nodes list ───────────────────────────────────────────────────────
	const nodes: NodeWithStats[] = useMemo(
		() => nodesData?.nodes ?? [],
		[nodesData],
	);

	// ── Tree map: parentId → children ─────────────────────────────────────────
	const treeMap = useMemo(() => buildTree(nodes), [nodes]);

	// ── Node lookup ──────────────────────────────────────────────────────────
	const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

	// ── Selected node ─────────────────────────────────────────────────────────
	const selectedNode = selectedNodeId
		? (nodeById.get(selectedNodeId) ?? null)
		: null;

	// ── Breadcrumb for selected node ──────────────────────────────────────────
	const breadcrumb = useMemo(
		() => (selectedNodeId ? buildBreadcrumb(selectedNodeId, nodeById) : []),
		[selectedNodeId, nodeById],
	);

	// ── Tax rates (WS3 branch override dropdown + name resolution) ────────────
	const { data: taxRatesData } = useQuery({
		...orpc.taxRates.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId && isAuthenticated,
		staleTime: 60_000,
	});
	const taxRates = useMemo(
		() =>
			(taxRatesData ?? []).map((r) => ({
				id: r.id,
				name: r.name,
				rateInBasisPoints: r.rateInBasisPoints,
			})),
		[taxRatesData],
	);

	// ── Branch company/tax profile for the selected branch (WS3) ──────────────
	// listNodesWithStats omits these columns, so the detail panel + edit prefill
	// read them from getBranchDetails for the selected branch.
	const { data: selectedBranchDetails } = useQuery({
		...orpc.hierarchy.getBranchDetails.queryOptions({
			input: { organizationId: organizationId!, nodeId: selectedNodeId! },
		}),
		enabled:
			!!organizationId &&
			isAuthenticated &&
			!!selectedNodeId &&
			selectedNode?.type === "branch",
		staleTime: 30_000,
	});

	// Merge the fetched profile into the selected node so the detail panel and
	// edit dialog see the WS3 fields (and the real address, which stats omit).
	const enrichedSelectedNode = useMemo<NodeWithStats | null>(() => {
		if (!selectedNode) return null;
		if (
			selectedNode.type === "branch" &&
			selectedBranchDetails &&
			selectedBranchDetails.nodeId === selectedNode.id
		) {
			return {
				...selectedNode,
				address: selectedBranchDetails.address ?? selectedNode.address,
				companyLegalName: selectedBranchDetails.companyLegalName,
				registrationNumber: selectedBranchDetails.registrationNumber,
				taxId: selectedBranchDetails.taxId,
				invoicePrefix: selectedBranchDetails.invoicePrefix,
				receiptPrefix: selectedBranchDetails.receiptPrefix,
				branchTaxRateId: selectedBranchDetails.branchTaxRateId,
				// AVANTEJ-16: surface persisted opening hours on the detail panel.
				openingHours: selectedBranchDetails.openingHours ?? null,
			};
		}
		return selectedNode;
	}, [selectedNode, selectedBranchDetails]);

	const taxRateName = useMemo(() => {
		const id = enrichedSelectedNode?.branchTaxRateId;
		if (!id) return null;
		return taxRates.find((r) => r.id === id)?.name ?? null;
	}, [enrichedSelectedNode, taxRates]);

	// ── Auto-select first root on load ────────────────────────────────────────
	useEffect(() => {
		if (nodes.length > 0 && !selectedNodeId) {
			const roots = treeMap.get(null) ?? [];
			if (roots.length > 0) {
				setSelectedNodeId(roots[0].id);
				setExpandedIds(new Set([roots[0].id]));
			}
		}
	}, [nodes, selectedNodeId, treeMap]);

	// ── Expand all handler ────────────────────────────────────────────────────
	const handleExpandAll = useCallback(() => {
		if (allExpanded) {
			setExpandedIds(new Set());
			setAllExpanded(false);
		} else {
			setExpandedIds(new Set(nodes.map((n) => n.id)));
			setAllExpanded(true);
		}
	}, [allExpanded, nodes]);

	// ── Cascading dropdown data for edit dialog ───────────────────────────────
	const { data: hierarchyNodesData } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId && isAuthenticated,
		staleTime: 30_000,
	});

	useEffect(() => {
		if (hierarchyNodesData?.nodes) {
			setAllNodes(hierarchyNodesData.nodes as HierarchyNode[]);
		}
	}, [hierarchyNodesData]);

	const countries = useMemo(
		() => allNodes.filter((n) => n.type === "country" && n.depth === 1),
		[allNodes],
	);
	const regions = useMemo(
		() =>
			allNodes.filter(
				(n) =>
					n.type === "region" && n.depth === 2 && n.parentId === editCountryId,
			),
		[allNodes, editCountryId],
	);
	const areas = useMemo(
		() =>
			allNodes.filter(
				(n) =>
					n.type === "area" && n.depth === 3 && n.parentId === editRegionId,
			),
		[allNodes, editRegionId],
	);

	// ── Org error ─────────────────────────────────────────────────────────────
	useEffect(() => {
		if (
			!organizationId &&
			!isLoadingContext &&
			!authLoading &&
			!orgErrorShown.current
		) {
			orgErrorShown.current = true;
			toast.error("No organization selected.");
		} else if (organizationId) {
			orgErrorShown.current = false;
		}
	}, [organizationId, isLoadingContext, authLoading]);

	useEffect(() => {
		if (nodesError) {
			const msg =
				nodesError instanceof Error ? nodesError.message : "Unknown error";
			if (msg.includes("UNAUTHORIZED") || msg.includes("Not authenticated")) {
				toast.error("Please log in");
				navigate({ to: "/login", search: {} });
			} else {
				toast.error(`Failed to load branches: ${msg}`);
			}
		}
	}, [nodesError, navigate]);

	// ── Mutations ─────────────────────────────────────────────────────────────
	const updateMutation = useApiMutation({
		mutationFn: async ({
			nodeId,
			name,
			address,
			picUserId,
			companyLegalName,
			registrationNumber,
			taxId,
			invoicePrefix,
			receiptPrefix,
			branchTaxRateId,
			openingHours,
		}: {
			nodeId: string;
			name?: string;
			address?: string | null;
			picUserId?: string | null;
			companyLegalName?: string | null;
			registrationNumber?: string | null;
			taxId?: string | null;
			invoicePrefix?: string | null;
			receiptPrefix?: string | null;
			branchTaxRateId?: string | null;
			openingHours?: OpeningHoursShape | null;
		}) => {
			if (!organizationId) throw new Error("Organization ID required");
			return client.hierarchy.updateNode({
				organizationId,
				nodeId,
				name,
				address,
				picUserId,
				companyLegalName,
				registrationNumber,
				taxId,
				invoicePrefix,
				receiptPrefix,
				branchTaxRateId,
				openingHours,
			});
		},
		successMessage: false,
		errorMessage: (err) => `Failed to update: ${err.message}`,
		invalidate: [
			orpc.hierarchy.listNodesWithStats.key(),
			orpc.hierarchy.getBranchDetails.key(),
			["user-context"],
		],
	});

	const moveMutation = useApiMutation({
		mutationFn: async ({
			nodeId,
			newParentId,
		}: {
			nodeId: string;
			newParentId: string;
		}) => {
			if (!organizationId) throw new Error("Organization ID required");
			return client.hierarchy.moveNode({
				organizationId,
				nodeId,
				newParentId,
			});
		},
		successMessage: false,
		errorMessage: (err) => `Failed to move: ${err.message}`,
		invalidate: [orpc.hierarchy.listNodesWithStats.key(), ["user-context"]],
	});

	const deleteMutation = useApiMutation({
		mutationFn: async (nodeId: string) => {
			if (!organizationId) throw new Error("Organization ID required");
			// Server defaults: autoDeleteChildren + autoReassignMembers = true.
			return client.hierarchy.deleteNode({ organizationId, nodeId });
		},
		successMessage: "Branch deleted",
		errorMessage: (err) => `Failed to delete: ${err.message}`,
		invalidate: [orpc.hierarchy.listNodesWithStats.key(), ["user-context"]],
	});

	// ── Delete handlers ───────────────────────────────────────────────────────
	// Count all descendants of a node so the confirm dialog can warn about cascade.
	const countDescendants = useCallback(
		(id: string): number => {
			const kids = treeMap.get(id) ?? [];
			return kids.reduce((acc, k) => acc + 1 + countDescendants(k.id), 0);
		},
		[treeMap],
	);

	const handleConfirmDelete = useCallback(async () => {
		if (!deletingNode) return;
		try {
			await deleteMutation.mutateAsync(deletingNode.id);
			if (selectedNodeId === deletingNode.id) setSelectedNodeId(null);
			setDeletingNode(null);
		} catch {
			// errors surfaced by mutation onError
		}
	}, [deletingNode, deleteMutation, selectedNodeId]);

	// ── Edit handlers ─────────────────────────────────────────────────────────
	const handleOpenEdit = useCallback(
		(node: NodeWithStats) => {
			const hierarchyNodes: HierarchyNode[] =
				(hierarchyNodesData?.nodes as HierarchyNode[]) ?? allNodes;
			const found = hierarchyNodes.find((n) => n.id === node.id);
			const parentArea = found?.parentId
				? hierarchyNodes.find((n) => n.id === found.parentId)
				: null;
			const parentRegion = parentArea?.parentId
				? hierarchyNodes.find((n) => n.id === parentArea.parentId)
				: null;
			const parentCountry = parentRegion?.parentId
				? hierarchyNodes.find((n) => n.id === parentRegion.parentId)
				: null;

			setEditingNode(node);
			setEditName(node.name);
			setEditAddress(node.address ?? "");
			setEditPicUserId("");
			setEditCountryId(parentCountry?.id ?? "");
			setEditRegionId(parentRegion?.id ?? "");
			setEditAreaId(parentArea?.id ?? "");
			// WS3 company/tax profile (present on the enriched branch node).
			setEditCompanyLegalName(node.companyLegalName ?? "");
			setEditRegistrationNumber(node.registrationNumber ?? "");
			setEditTaxId(node.taxId ?? "");
			setEditInvoicePrefix(node.invoicePrefix ?? "");
			setEditReceiptPrefix(node.receiptPrefix ?? "");
			setEditBranchTaxRateId(node.branchTaxRateId ?? "");
			setEditOpeningHours((node.openingHours as OpeningHoursShape) ?? {});
			setIsEditDialogOpen(true);
		},
		[allNodes, hierarchyNodesData],
	);

	const handleEditSubmit = useCallback(async () => {
		if (!editingNode) return;
		const trimName = editName.trim();
		const trimAddress = editAddress.trim();
		const trimPic = editPicUserId.trim();

		if (!trimName) {
			toast.error("Name cannot be empty");
			return;
		}

		const nameChanged = trimName !== editingNode.name;
		const addressChanged = trimAddress !== (editingNode.address ?? "");
		const picChanged = !!trimPic;
		const areaChanged = editAreaId && editAreaId !== editingNode.parentId;

		// WS3 company/tax profile — branches only.
		const isBranch = editingNode.type === "branch";
		const trimCompany = editCompanyLegalName.trim();
		const trimReg = editRegistrationNumber.trim();
		const trimTaxId = editTaxId.trim();
		const trimInvoicePrefix = editInvoicePrefix.trim();
		const trimReceiptPrefix = editReceiptPrefix.trim();
		const companyChanged =
			isBranch && trimCompany !== (editingNode.companyLegalName ?? "");
		const regChanged =
			isBranch && trimReg !== (editingNode.registrationNumber ?? "");
		const taxIdChanged = isBranch && trimTaxId !== (editingNode.taxId ?? "");
		const invoicePrefixChanged =
			isBranch && trimInvoicePrefix !== (editingNode.invoicePrefix ?? "");
		const receiptPrefixChanged =
			isBranch && trimReceiptPrefix !== (editingNode.receiptPrefix ?? "");
		const taxRateChanged =
			isBranch && editBranchTaxRateId !== (editingNode.branchTaxRateId ?? "");
		const openingHoursChanged =
			isBranch &&
			JSON.stringify(editOpeningHours ?? {}) !==
				JSON.stringify((editingNode.openingHours as OpeningHoursShape) ?? {});

		const profileChanged =
			companyChanged ||
			regChanged ||
			taxIdChanged ||
			invoicePrefixChanged ||
			receiptPrefixChanged ||
			taxRateChanged ||
			openingHoursChanged;

		if (
			!nameChanged &&
			!addressChanged &&
			!picChanged &&
			!areaChanged &&
			!profileChanged
		) {
			toast.info("No changes made");
			setIsEditDialogOpen(false);
			return;
		}

		try {
			if (nameChanged || addressChanged || picChanged || profileChanged) {
				const params: {
					nodeId: string;
					name?: string;
					address?: string | null;
					picUserId?: string | null;
					companyLegalName?: string | null;
					registrationNumber?: string | null;
					taxId?: string | null;
					invoicePrefix?: string | null;
					receiptPrefix?: string | null;
					branchTaxRateId?: string | null;
					openingHours?: OpeningHoursShape | null;
				} = { nodeId: editingNode.id };
				if (nameChanged) params.name = trimName;
				if (addressChanged) params.address = trimAddress || null;
				if (picChanged) params.picUserId = trimPic || null;
				if (companyChanged) params.companyLegalName = trimCompany || null;
				if (regChanged) params.registrationNumber = trimReg || null;
				if (taxIdChanged) params.taxId = trimTaxId || null;
				if (invoicePrefixChanged)
					params.invoicePrefix = trimInvoicePrefix || null;
				if (receiptPrefixChanged)
					params.receiptPrefix = trimReceiptPrefix || null;
				if (taxRateChanged)
					params.branchTaxRateId = editBranchTaxRateId || null;
				if (openingHoursChanged) params.openingHours = editOpeningHours;
				await updateMutation.mutateAsync(params);
			}

			if (areaChanged && editAreaId) {
				await moveMutation.mutateAsync({
					nodeId: editingNode.id,
					newParentId: editAreaId,
				});
			}

			setIsEditDialogOpen(false);
			setEditingNode(null);
			toast.success("Branch updated successfully");
			queryClient.invalidateQueries(
				orpc.hierarchy.listNodesWithStats.queryOptions({
					input: { organizationId: organizationId! },
				}),
			);
		} catch {
			// errors handled by mutation onError
		}
	}, [
		editingNode,
		editName,
		editAddress,
		editPicUserId,
		editAreaId,
		editCompanyLegalName,
		editRegistrationNumber,
		editTaxId,
		editInvoicePrefix,
		editReceiptPrefix,
		editBranchTaxRateId,
		updateMutation,
		moveMutation,
		organizationId,
	]);

	// ── Render tree recursively ───────────────────────────────────────────────
	function renderTree(parentId: string | null, depth: number): React.ReactNode {
		const children = treeMap.get(parentId) ?? [];
		if (children.length === 0) return null;

		const isTopLevel = parentId === null;

		return children.map((node) => {
			const hasChildren = (treeMap.get(node.id)?.length ?? 0) > 0;
			const isExpanded = expandedIds.has(node.id);
			const isSelected = selectedNodeId === node.id;

			return (
				<div key={node.id}>
					<TreeRow
						node={node}
						depth={depth}
						isExpanded={isExpanded}
						hasChildren={hasChildren}
						isSelected={isSelected}
						onToggle={() => {
							setExpandedIds((prev) => {
								const next = new Set(prev);
								if (next.has(node.id)) next.delete(node.id);
								else next.add(node.id);
								return next;
							});
						}}
						onSelect={() => {
							setSelectedNodeId(node.id);
							if (hasChildren && !isExpanded) {
								setExpandedIds((prev) => new Set([...prev, node.id]));
							}
						}}
					/>
					{isExpanded && hasChildren && (
						<div
							className={cn(
								"border-l-2 border-[#e5e5e5] mt-0.5 mb-0.5",
								isTopLevel ? "ml-[11px] pl-5" : "ml-[11px] pl-4",
							)}
						>
							{renderTree(node.id, depth + 1)}
						</div>
					)}
				</div>
			);
		});
	}

	// ── Loading guard ─────────────────────────────────────────────────────────
	if (authLoading || isLoadingContext || isLoadingNodes) {
		return (
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-[#737373]" />
			</div>
		);
	}

	if (!isAuthenticated) return null;

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-[#737373]">Branch</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Overview</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
						onClick={handleExpandAll}
					>
						<Maximize2 className="h-4 w-4" />
						{allExpanded ? "Collapse all" : "Expand all"}
					</button>
					<Link to="/dashboard/branch/create">
						<button
							type="button"
							className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626]"
						>
							<Plus className="h-4 w-4" />
							Add Branch
						</button>
					</Link>
				</div>
			</header>

			{/* ── Main content ─────────────────────────────────────────────────── */}
			<div className="flex-1 min-h-0 flex gap-5 px-6 py-6 overflow-hidden">
				{/* Tree panel */}
				<div className="w-80 shrink-0 flex flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white p-4">
					<div className="flex-1 overflow-y-auto pr-1">
						{nodes.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
								<Store className="h-8 w-8 mb-3 opacity-30" />
								<p className="text-sm font-medium text-[#0a0a0a]">
									No branches found
								</p>
								<p className="text-xs mt-1">
									{organizationId
										? "Create your first branch to get started."
										: "Please ensure you're logged in and have an organization selected."}
								</p>
								{organizationId && (
									<button
										type="button"
										className="mt-4 inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
										onClick={() => navigate({ to: "/dashboard/branch/create" })}
									>
										Create Branch
									</button>
								)}
							</div>
						) : (
							renderTree(null, 0)
						)}
					</div>
				</div>

				{/* Detail panel */}
				<div className="flex-1 min-w-0 overflow-hidden">
					{selectedNode && enrichedSelectedNode ? (
						<NodeDetailPanel
							node={enrichedSelectedNode}
							breadcrumb={breadcrumb}
							onEdit={() => handleOpenEdit(enrichedSelectedNode)}
							onDelete={() => setDeletingNode(selectedNode)}
							canDelete={canDelete}
							isDeleting={deleteMutation.isPending}
							taxRateName={taxRateName}
						/>
					) : (
						<div className="flex h-full items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white text-sm text-[#737373]">
							Select a node to view details
						</div>
					)}
				</div>
			</div>

			{/* ── Edit dialog ───────────────────────────────────────────────────── */}
			<EditBranchDialog
				open={isEditDialogOpen}
				onDismiss={() => setIsEditDialogOpen(false)}
				onCancel={() => {
					setIsEditDialogOpen(false);
					setEditingNode(null);
				}}
				organizationId={organizationId}
				editingNode={editingNode}
				editName={editName}
				setEditName={setEditName}
				editAddress={editAddress}
				setEditAddress={setEditAddress}
				editPicUserId={editPicUserId}
				setEditPicUserId={setEditPicUserId}
				editCountryId={editCountryId}
				setEditCountryId={setEditCountryId}
				editRegionId={editRegionId}
				setEditRegionId={setEditRegionId}
				editAreaId={editAreaId}
				setEditAreaId={setEditAreaId}
				editCompanyLegalName={editCompanyLegalName}
				setEditCompanyLegalName={setEditCompanyLegalName}
				editRegistrationNumber={editRegistrationNumber}
				setEditRegistrationNumber={setEditRegistrationNumber}
				editTaxId={editTaxId}
				setEditTaxId={setEditTaxId}
				editInvoicePrefix={editInvoicePrefix}
				setEditInvoicePrefix={setEditInvoicePrefix}
				editReceiptPrefix={editReceiptPrefix}
				setEditReceiptPrefix={setEditReceiptPrefix}
				editBranchTaxRateId={editBranchTaxRateId}
				setEditBranchTaxRateId={setEditBranchTaxRateId}
				editOpeningHours={editOpeningHours}
				setEditOpeningHours={setEditOpeningHours}
				taxRates={taxRates}
				allNodes={allNodes}
				countries={countries}
				regions={regions}
				areas={areas}
				onSubmit={handleEditSubmit}
				isPending={updateMutation.isPending || moveMutation.isPending}
			/>

			{/* ── Delete confirmation ───────────────────────────────────────────── */}
			<Dialog
				open={!!deletingNode}
				onOpenChange={(open) => {
					if (!open) setDeletingNode(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete “{deletingNode?.name}”?</DialogTitle>
						<DialogDescription asChild>
							<div className="space-y-2 text-sm">
								<p>
									This permanently deletes{" "}
									<span className="font-semibold">{deletingNode?.name}</span>
									{deletingNode && countDescendants(deletingNode.id) > 0 ? (
										<>
											{" "}
											and its{" "}
											<span className="font-semibold">
												{countDescendants(deletingNode.id)}
											</span>{" "}
											sub-node(s)
										</>
									) : null}
									. Members scoped to these nodes are reassigned to the parent.
								</p>
								<p className="text-rose-600">
									This cannot be undone, and any linked GoHighLevel branch
									options are removed.
								</p>
							</div>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeletingNode(null)}
							disabled={deleteMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							className="bg-rose-600 text-white hover:bg-rose-700"
							onClick={handleConfirmDelete}
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? (
								<>
									<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
									Deleting…
								</>
							) : (
								"Delete"
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
