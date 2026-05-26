import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { requirePermission } from "@/lib/route-guards";
import {
	Plus,
	Store,
	ChevronRight,
	ChevronDown,
	Loader2,
	MapPin,
	Clock,
	Maximize2,
	Pencil,
	BarChart2,
	PowerOff,
} from "lucide-react";
import { toast } from "sonner";

import { client, queryClient } from "@/utils/orpc";
import { useAuth } from "@/hooks/useAuth";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberReassignment } from "@/components/branch/member-reassignment";
import { MemberSelector } from "@/components/branch/member-selector";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/branch/view",
)({
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:read");
	},
	component: RouteComponent,
});

// ─── Types ─────────────────────────────────────────────────────────────────────

type NodeWithStats = {
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
};

// Opening hours shape from DB: { monday: { open: string; close: string } | null, ... }
type OpeningHoursShape = Record<
	string,
	{ open: string; close: string } | null | undefined
>;

const DAYS_OF_WEEK = [
	{ key: "monday", label: "Monday" },
	{ key: "tuesday", label: "Tuesday" },
	{ key: "wednesday", label: "Wednesday" },
	{ key: "thursday", label: "Thursday" },
	{ key: "friday", label: "Friday" },
	{ key: "saturday", label: "Saturday" },
	{ key: "sunday", label: "Sunday" },
];

// Legacy HierarchyNode shape for edit dialog
type HierarchyNode = {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
	code?: string | null;
};

// ─── Opening Hours Table ─────────────────────────────────────────────────────

function OpeningHoursTable({ hours }: { hours: unknown }) {
	const parsed = useMemo<OpeningHoursShape>(() => {
		if (!hours || typeof hours !== "object") return {};
		return hours as OpeningHoursShape;
	}, [hours]);

	const hasAnyHours = DAYS_OF_WEEK.some((d) => parsed[d.key] != null);

	if (!hasAnyHours) {
		return (
			<p className="text-xs text-[#737373] italic">
				Opening hours not set
			</p>
		);
	}

	return (
		<table className="w-full text-xs">
			<tbody>
				{DAYS_OF_WEEK.map(({ key, label }) => {
					const slot = parsed[key];
					return (
						<tr key={key} className="border-b border-[#e5e5e5] last:border-0">
							<td className="py-1.5 pr-3 font-medium text-[#0a0a0a] w-28">
								{label}
							</td>
							<td className="py-1.5 font-mono tabular-nums text-[#737373]">
								{slot ? `${slot.open} – ${slot.close}` : "Closed"}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

// ─── Breadcrumb path builder ───────────────────────────────────────────────

function buildBreadcrumb(
	nodeId: string,
	nodeById: Map<string, NodeWithStats>,
): string[] {
	const parts: string[] = [];
	let current: NodeWithStats | undefined = nodeById.get(nodeId);
	while (current) {
		parts.unshift(current.name);
		current = current.parentId ? nodeById.get(current.parentId) : undefined;
	}
	return parts;
}

// ─── Tree Row ──────────────────────────────────────────────────────────────────

function TreeRow({
	node,
	depth,
	isExpanded,
	hasChildren,
	isSelected,
	onToggle,
	onSelect,
}: {
	node: NodeWithStats;
	depth: number;
	isExpanded: boolean;
	hasChildren: boolean;
	isSelected: boolean;
	onToggle: () => void;
	onSelect: () => void;
}) {
	const isBranch = node.type === "branch";
	const isRoot = depth === 0;

	// Root node style (country-level)
	if (isRoot && !node.parentId) {
		return (
			<div
				role="button"
				tabIndex={0}
				onClick={onSelect}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") onSelect();
				}}
				className={cn(
					"flex items-center gap-3 px-3 py-2.5 rounded-xl mb-2 cursor-pointer transition-colors",
					isSelected ? "bg-[#d6cdb1]/20 border border-[#d6cdb1]" : "bg-[#f3f3f3] hover:bg-[#e5e5e5]",
				)}
			>
				<div className="w-2 h-2 rounded-sm bg-[#737373]/60 shrink-0" />
				<p className="text-xs font-semibold text-[#737373] uppercase tracking-wider">
					{node.name}
				</p>
				{hasChildren && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggle();
						}}
						className="ml-auto text-[#737373]/60 hover:text-[#0a0a0a]"
					>
						{isExpanded ? (
							<ChevronDown className="h-3.5 w-3.5" />
						) : (
							<ChevronRight className="h-3.5 w-3.5" />
						)}
					</button>
				)}
			</div>
		);
	}

	// Branch (leaf) node
	if (isBranch) {
		const revenue =
			node.monthRevenueCents != null
				? formatPrice(node.monthRevenueCents, "MYR")
				: null;
		const members =
			node.membersCount != null ? `${node.membersCount} members` : null;

		return (
			<div className="relative py-1.5">
				{/* Horizontal connector tick */}
				<div
					className="absolute top-[1.35rem] bg-[#e5e5e5]"
					style={{ left: "-14px", width: "12px", height: "1px" }}
				/>
				<div
					role="button"
					tabIndex={0}
					onClick={onSelect}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") onSelect();
					}}
					className={cn(
						"flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
						isSelected
							? "bg-white border-2 border-[#0a0a0a] shadow-sm"
							: "bg-white border border-[#e5e5e5] hover:bg-[#f3f3f3]",
					)}
				>
					<div
						className={cn(
							"w-2 h-2 rounded-full shrink-0",
							isSelected ? "bg-[#0a0a0a]" : "bg-[#737373]",
						)}
					/>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-semibold truncate text-[#0a0a0a]">{node.name}</p>
						{(revenue || members || node.stale) && (
							<p className="text-xs font-mono tabular-nums text-[#737373] truncate">
								{node.stale ? (
									<Loader2 className="h-3 w-3 animate-spin inline" />
								) : (
									[revenue, members].filter(Boolean).join(" · ")
								)}
							</p>
						)}
					</div>
				</div>
			</div>
		);
	}

	// Intermediate node (region, area, district, etc.)
	return (
		<div className="relative mb-2">
			{/* Horizontal connector tick */}
			<div
				className="absolute top-[0.875rem] bg-[#e5e5e5]"
				style={{ left: "-20px", width: "14px", height: "1px" }}
			/>
			<div
				role="button"
				tabIndex={0}
				onClick={onSelect}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") onSelect();
				}}
				className={cn(
					"flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
					isSelected
						? "bg-[#d6cdb1]/20 border border-[#d6cdb1]"
						: "bg-[#f3f3f3] hover:bg-[#e5e5e5]",
				)}
			>
				{hasChildren && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onToggle();
						}}
						className="text-[#737373] shrink-0"
					>
						{isExpanded ? (
							<ChevronDown className="h-3 w-3" />
						) : (
							<ChevronRight className="h-3 w-3" />
						)}
					</button>
				)}
				<span className="text-xs font-semibold flex-1 min-w-0 truncate text-[#0a0a0a]">
					{node.name}
				</span>
				<span className="text-xs font-medium capitalize text-[#737373] shrink-0">
					{node.type}
				</span>
			</div>
		</div>
	);
}

// ─── KPI Tile ───────────────────────────────────────────────────────────────────

function KpiTile({
	label,
	value,
	sub,
	stale,
}: {
	label: string;
	value: string;
	sub?: string;
	stale?: boolean;
}) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-center">
			<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373] mb-1">
				{label}
			</div>
			<div
				className="text-2xl font-bold tabular-nums font-mono text-[#0a0a0a]"
				title={stale ? "Cache warming — data may be up to 5 min old" : undefined}
			>
				{stale && value === "—" ? (
					<span className="text-[#737373] text-xl">—</span>
				) : (
					value
				)}
			</div>
			{sub && (
				<div className="text-xs mt-1 text-[#737373]">{sub}</div>
			)}
		</div>
	);
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

function NodeDetailPanel({
	node,
	breadcrumb,
	onEdit,
}: {
	node: NodeWithStats;
	breadcrumb: string[];
	onEdit: () => void;
}) {
	const membersValue =
		node.membersCount != null ? String(node.membersCount) : "—";
	const staffValue = node.staffCount != null ? String(node.staffCount) : "—";
	const revenueValue =
		node.monthRevenueCents != null
			? formatPrice(node.monthRevenueCents, "MYR")
			: "—";

	// Breadcrumb path: all ancestors except the node itself
	const ancestorPath = breadcrumb.slice(0, -1).join(" · ");

	return (
		<div className="flex flex-col h-full overflow-hidden bg-white border border-[#e5e5e5] rounded-2xl">
			{/* Header */}
			<div className="p-6 pb-4 border-b border-[#e5e5e5]">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						{ancestorPath && (
							<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373] mb-1">
								{ancestorPath}
							</p>
						)}
						<h2 className="text-xl font-bold text-[#0a0a0a] leading-tight">
							{node.name}
						</h2>
						{node.address && (
							<p className="text-sm text-[#737373] mt-1 flex items-start gap-1.5">
								<MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
								{node.address}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
				{/* 3 KPI tiles */}
				<div className="grid grid-cols-3 gap-3">
					<KpiTile
						label="Members"
						value={membersValue}
						sub="total"
						stale={node.stale && node.membersCount == null}
					/>
					<KpiTile
						label="Revenue / mo"
						value={revenueValue}
						sub="this month"
						stale={node.stale && node.monthRevenueCents == null}
					/>
					<KpiTile
						label="Staff"
						value={staffValue}
						sub="total"
						stale={node.stale && node.staffCount == null}
					/>
				</div>

				{/* Opening hours card */}
				<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
					<div className="flex items-center gap-2 mb-3">
						<Clock className="h-3.5 w-3.5 text-[#737373]" />
						<p className="text-sm font-semibold text-[#0a0a0a]">Opening Hours</p>
					</div>
					<OpeningHoursTable hours={node.openingHours} />
				</div>

				{/* Stale warning */}
				{node.stale && (
					<p className="text-xs text-[#737373] italic">
						Stats are warming up (cache miss). Refresh in a few seconds.
					</p>
				)}
			</div>

			{/* Action toolbar — pinned at bottom */}
			<div className="shrink-0 border-t border-[#e5e5e5] p-4 flex items-center gap-2 bg-white">
				<Button
					variant="outline"
					size="sm"
					className="flex-1 text-xs gap-1.5"
					onClick={onEdit}
				>
					<Pencil className="h-3.5 w-3.5" />
					Edit Branch
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="flex-1 text-xs gap-1.5"
					disabled
				>
					<BarChart2 className="h-3.5 w-3.5" />
					View Performance
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="flex-1 text-xs gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
					disabled
				>
					<PowerOff className="h-3.5 w-3.5" />
					Deactivate
				</Button>
			</div>
		</div>
	);
}

// ─── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(nodes: NodeWithStats[]): Map<string | null, NodeWithStats[]> {
	const map = new Map<string | null, NodeWithStats[]>();
	for (const node of nodes) {
		const key = node.parentId ?? null;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(node);
	}
	return map;
}

// ─── Route Component ───────────────────────────────────────────────────────────

function RouteComponent() {
	const { isLoading: authLoading, isAuthenticated } = useAuth();
	const { data: userContext, isLoading: isLoadingContext } = useUserContext();
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
	const [allNodes, setAllNodes] = useState<HierarchyNode[]>([]);

	// Tree expand state
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [allExpanded, setAllExpanded] = useState(false);

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
		queryKey: ["nodesWithStats", organizationId],
		queryFn: () =>
			client.hierarchy.listNodesWithStats({ organizationId: organizationId! }),
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
	const nodeById = useMemo(
		() => new Map(nodes.map((n) => [n.id, n])),
		[nodes],
	);

	// ── Selected node ─────────────────────────────────────────────────────────
	const selectedNode = selectedNodeId
		? (nodeById.get(selectedNodeId) ?? null)
		: null;

	// ── Breadcrumb for selected node ──────────────────────────────────────────
	const breadcrumb = useMemo(
		() => (selectedNodeId ? buildBreadcrumb(selectedNodeId, nodeById) : []),
		[selectedNodeId, nodeById],
	);

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
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: async () => {
			if (!organizationId) return { nodes: [] as HierarchyNode[] };
			const result = await client.hierarchy.listNodes({ organizationId });
			return result as { nodes: HierarchyNode[] };
		},
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
					n.type === "region" &&
					n.depth === 2 &&
					n.parentId === editCountryId,
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

	// ── Summary stats ─────────────────────────────────────────────────────────
	const branchNodes = useMemo(
		() => nodes.filter((n) => n.type === "branch"),
		[nodes],
	);
	const totalBranches = branchNodes.length;
	const totalMembers = branchNodes.reduce(
		(sum, n) => sum + (n.membersCount ?? 0),
		0,
	);
	const uniqueRegions = new Set(
		nodes
			.filter((n) => n.type === "region")
			.map((n) => n.name)
			.filter(Boolean),
	).size;

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
			if (
				msg.includes("UNAUTHORIZED") ||
				msg.includes("Not authenticated")
			) {
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
		}: {
			nodeId: string;
			name?: string;
			address?: string | null;
			picUserId?: string | null;
		}) => {
			if (!organizationId) throw new Error("Organization ID required");
			return client.hierarchy.updateNode({
				organizationId,
				nodeId,
				name,
				address,
				picUserId,
			});
		},
		successMessage: false,
		errorMessage: (err) => `Failed to update: ${err.message}`,
		invalidate: [["nodesWithStats", organizationId], ["user-context"]],
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
		invalidate: [["nodesWithStats", organizationId], ["user-context"]],
	});

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

		if (!nameChanged && !addressChanged && !picChanged && !areaChanged) {
			toast.info("No changes made");
			setIsEditDialogOpen(false);
			return;
		}

		try {
			if (nameChanged || addressChanged || picChanged) {
				const params: {
					nodeId: string;
					name?: string;
					address?: string | null;
					picUserId?: string | null;
				} = { nodeId: editingNode.id };
				if (nameChanged) params.name = trimName;
				if (addressChanged) params.address = trimAddress || null;
				if (picChanged) params.picUserId = trimPic || null;
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
			queryClient.invalidateQueries({
				queryKey: ["nodesWithStats", organizationId],
			});
		} catch {
			// errors handled by mutation onError
		}
	}, [
		editingNode,
		editName,
		editAddress,
		editPicUserId,
		editAreaId,
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

			// Count immediate branch-type children for badge label
			const childCount = treeMap.get(node.id)?.length ?? 0;

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
					<span className="text-muted-foreground">Branch</span>
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
								<p className="text-sm font-medium text-[#0a0a0a]">No branches found</p>
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
					{selectedNode ? (
						<NodeDetailPanel
							node={selectedNode}
							breadcrumb={breadcrumb}
							onEdit={() => handleOpenEdit(selectedNode)}
						/>
					) : (
						<div className="flex h-full items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white text-sm text-[#737373]">
							Select a node to view details
						</div>
					)}
				</div>
			</div>

			{/* ── Edit dialog ───────────────────────────────────────────────────── */}
			<Dialog
				open={isEditDialogOpen}
				onOpenChange={(open) => !open && setIsEditDialogOpen(false)}
			>
				<DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit {editingNode?.name}</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="edit-name">Name *</Label>
							<Input
								id="edit-name"
								value={editName}
								onChange={(e) => setEditName(e.target.value)}
								placeholder="Branch name"
								autoFocus
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-country">Country</Label>
							<Select
								value={editCountryId}
								onValueChange={(v) => {
									setEditCountryId(v);
									setEditRegionId("");
									setEditAreaId("");
								}}
							>
								<SelectTrigger id="edit-country">
									<SelectValue placeholder="Select country" />
								</SelectTrigger>
								<SelectContent>
									{countries.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-region">Region</Label>
							<Select
								value={editRegionId}
								onValueChange={(v) => {
									setEditRegionId(v);
									setEditAreaId("");
								}}
								disabled={!editCountryId}
							>
								<SelectTrigger id="edit-region">
									<SelectValue
										placeholder={
											editCountryId ? "Select region" : "Select country first"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{regions.map((r) => (
										<SelectItem key={r.id} value={r.id}>
											{r.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-area">Area</Label>
							<Select
								value={editAreaId}
								onValueChange={setEditAreaId}
								disabled={!editRegionId}
							>
								<SelectTrigger id="edit-area">
									<SelectValue
										placeholder={
											editRegionId ? "Select area" : "Select region first"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{areas.map((a) => (
										<SelectItem key={a.id} value={a.id}>
											{a.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="edit-address">Address</Label>
							<Input
								id="edit-address"
								value={editAddress}
								onChange={(e) => setEditAddress(e.target.value)}
								placeholder="Branch address"
							/>
						</div>

						{organizationId && (
							<div className="space-y-2">
								<Label>Person In Charge</Label>
								<MemberSelector
									organizationId={organizationId}
									value={editPicUserId}
									onChange={setEditPicUserId}
									placeholder="Select Person In Charge"
									allowClear
									disabled={
										updateMutation.isPending || moveMutation.isPending
									}
								/>
							</div>
						)}

						{editingNode?.id && organizationId && (
							<div className="pt-4 border-t">
								<MemberReassignment
									branchId={editingNode.id}
									organizationId={organizationId}
									allBranches={allNodes.filter((n) => n.type === "branch")}
									picUserId={editPicUserId || null}
									onReassigned={() => {
										queryClient.invalidateQueries({
											queryKey: ["nodesWithStats", organizationId],
										});
										queryClient.invalidateQueries({
											queryKey: ["user-context"],
										});
									}}
								/>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setIsEditDialogOpen(false);
								setEditingNode(null);
							}}
							disabled={updateMutation.isPending || moveMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleEditSubmit}
							disabled={
								!editName.trim() ||
								updateMutation.isPending ||
								moveMutation.isPending
							}
						>
							{updateMutation.isPending || moveMutation.isPending
								? "Saving…"
								: "Save Changes"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
