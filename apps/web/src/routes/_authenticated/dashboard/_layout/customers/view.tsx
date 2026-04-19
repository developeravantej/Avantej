import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Search, Users } from "lucide-react";
import { useState } from "react";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/customers/view",
)({
	component: CustomerDirectoryPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerDirectoryRow = {
	memberId: string;
	userId: string;
	name: string;
	email: string;
	phone: string | null;
	hierarchyScopeId: string;
	branchName: string | null;
	activePackageCount: number;
	lifetimeValueCents: number;
	outstandingBalanceCents: number;
	appointmentCount: number;
	lastVisitAt: Date | string | null;
	createdAt: Date | string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a relative time string without requiring date-fns.
 * Example: "3 days ago", "2 hours ago", "just now".
 */
function formatRelativeTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	const diffMs = Date.now() - d.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	if (diffSecs < 60) return "just now";
	const diffMins = Math.floor(diffSecs / 60);
	if (diffMins < 60)
		return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24)
		return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12)
		return `${diffMonths} month${diffMonths !== 1 ? "s" : ""} ago`;
	const diffYears = Math.floor(diffMonths / 12);
	return `${diffYears} year${diffYears !== 1 ? "s" : ""} ago`;
}

function formatDate(value: Date | string | null): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

// ─── Page component ───────────────────────────────────────────────────────────

const PAGE_LIMIT = 50;

function CustomerDirectoryPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// RBAC — check in component (requirePermission route-guard is a stub)
	const canRead = hasPermission("customer_management:read");

	// Search & debounce (300ms per plan §1.6)
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	// Branch filter
	const [branchId, setBranchId] = useState<string>("");

	// Pagination
	const [offset, setOffset] = useState(0);

	// Drawer state
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	// Accessible nodes for branch combobox
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const accessibleNodeIds =
		currentOrg?.hierarchy?.member?.accessibleNodeIds ?? [];
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	// Show only branch-type nodes the member can access
	const accessibleBranches = allNodes.filter(
		(n) => accessibleNodeIds.includes(n.id) && n.type === "branch",
	);
	// Fallback: if no "branch" type nodes, show all accessible nodes
	const branchOptions =
		accessibleBranches.length > 0
			? accessibleBranches
			: allNodes.filter((n) => accessibleNodeIds.includes(n.id));

	// ── Query ──────────────────────────────────────────────────────────────

	const {
		data: listData,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"customerDirectory",
			organizationId,
			debouncedSearch,
			branchId,
			offset,
		],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
			return client.customerDirectory.list({
				organizationId,
				search: debouncedSearch || undefined,
				branchId: branchId || undefined,
				limit: PAGE_LIMIT,
				offset,
			});
		},
		enabled: !!organizationId && canRead,
	});

	const rows: CustomerDirectoryRow[] = listData?.rows ?? [];
	const total = listData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_LIMIT);
	const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

	// ── Table columns ──────────────────────────────────────────────────────

	const columns: ColumnDef<CustomerDirectoryRow>[] = [
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => {
				const initials = getInitials(row.original.name);
				return (
					<div className="flex items-center gap-2">
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
							{initials}
						</span>
						<span className="font-medium">{row.original.name}</span>
					</div>
				);
			},
		},
		{
			accessorKey: "phone",
			header: "Phone",
			cell: ({ row }) => <CopyableCell value={row.original.phone} />,
		},
		{
			accessorKey: "email",
			header: "Email",
			cell: ({ row }) => <CopyableCell value={row.original.email} />,
		},
		{
			accessorKey: "activePackageCount",
			header: "Active Pkgs",
			cell: ({ row }) => (
				<Badge variant="secondary">{row.original.activePackageCount}</Badge>
			),
		},
		{
			accessorKey: "lifetimeValueCents",
			header: "LTV",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{formatPrice(row.original.lifetimeValueCents, "MYR")}
				</span>
			),
		},
		{
			accessorKey: "outstandingBalanceCents",
			header: "Outstanding",
			cell: ({ row }) => {
				const val = row.original.outstandingBalanceCents;
				return (
					<span
						className={`tabular-nums ${val > 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}
					>
						{formatPrice(val, "MYR")}
					</span>
				);
			},
		},
		{
			accessorKey: "lastVisitAt",
			header: "Last Visit",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{formatRelativeTime(row.original.lastVisitAt)}
				</span>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Joined",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{formatDate(row.original.createdAt)}
				</span>
			),
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="sm"
					onClick={() => {
						setSelectedMemberId(row.original.memberId);
						setSheetOpen(true);
					}}
				>
					View
				</Button>
			),
		},
	];

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view the customer directory.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view the customer directory.
					</p>
				</div>
			</div>
		);
	}

	// 403 from API
	if (error) {
		const isForbidden =
			error instanceof Error &&
			(error.message.includes("403") ||
				error.message.toLowerCase().includes("forbidden") ||
				error.message.toLowerCase().includes("permission"));
		if (isForbidden) {
			return (
				<div className="flex min-h-96 items-center justify-center text-muted-foreground">
					<div className="space-y-2 text-center">
						<p className="font-medium">Permission Denied</p>
						<p className="text-sm">
							You don't have permission to view the customer directory.
						</p>
					</div>
				</div>
			);
		}
		return (
			<div className="flex min-h-96 items-center justify-center text-destructive">
				Failed to load customers. Please try again.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
					<span className="sr-only">Loading...</span>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="rounded-lg bg-primary/10 p-2">
						<Users className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="font-bold font-heading text-2xl">
							Registered Customers
						</h1>
						<p className="text-muted-foreground text-sm">
							{total > 0
								? `${total} registered customer${total !== 1 ? "s" : ""}`
								: "No customers found"}
						</p>
					</div>
				</div>

				{/* Export CSV — disabled in v1 */}
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<span>
								<Button variant="outline" disabled>
									<Download className="mr-2 h-4 w-4" />
									Export CSV
								</Button>
							</span>
						</TooltipTrigger>
						<TooltipContent>
							<p>Export is not available yet.</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3">
				{/* Search */}
				<div className="relative w-72">
					<Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search name, email or phone..."
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setOffset(0); // reset pagination on new search
						}}
						className="pl-9"
					/>
				</div>

				{/* Branch filter */}
				{branchOptions.length > 0 && (
					<Select
						value={branchId || "all"}
						onValueChange={(v) => {
							setBranchId(v === "all" ? "" : v);
							setOffset(0);
						}}
					>
						<SelectTrigger className="w-48">
							<SelectValue placeholder="All branches" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All branches</SelectItem>
							{branchOptions.map((node) => (
								<SelectItem key={node.id} value={node.id}>
									{node.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>

			<Separator />

			{/* Table */}
			<DataTable<CustomerDirectoryRow, unknown> columns={columns} data={rows} />

			{/* Pagination */}
			{total > PAGE_LIMIT && (
				<div className="flex items-center justify-between text-muted-foreground text-sm">
					<span>
						Page {currentPage} of {totalPages} ({total} total)
					</span>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
							disabled={offset === 0}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setOffset(offset + PAGE_LIMIT)}
							disabled={offset + PAGE_LIMIT >= total}
						>
							Next
						</Button>
					</div>
				</div>
			)}

			{/* Customer Detail Drawer */}
			{selectedMemberId && (
				<CustomerDetailSheet
					memberId={selectedMemberId}
					organizationId={organizationId}
					open={sheetOpen}
					onOpenChange={(open) => {
						setSheetOpen(open);
						if (!open) setSelectedMemberId(null);
					}}
					onSaved={() => {
						// keep drawer open; table will refetch due to query invalidation
					}}
				/>
			)}
		</div>
	);
}
