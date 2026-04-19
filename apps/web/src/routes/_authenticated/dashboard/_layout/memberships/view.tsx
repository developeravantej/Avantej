import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { BadgeCheck } from "lucide-react";
import { useState } from "react";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import DataTable from "@/components/tables/sales/view/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/memberships/view",
)({
	component: MembershipsPage,
});

// ─── Types ─────────────────────────────────────────────────────────────────────

type MembershipFilter =
	| "active"
	| "expiring_7d"
	| "expiring_30d"
	| "frozen"
	| "expired";

/**
 * Shape returned by packageInstances.listMemberships (backend landing separately).
 * memberId must be added to MembershipRow by the backend (JOIN members m → m.id).
 */
type MembershipRow = {
	packageInstanceId: string;
	// memberId is the members.id (UUID), required by CustomerDetailSheet.
	// Backend MUST include this field in MembershipRow — P2-Backend note.
	memberId: string;
	clientId: string;
	clientName: string;
	serviceId: string;
	serviceName: string;
	startsAt: Date | string;
	expiresAt: Date | string | null;
	status: string;
	isLocked: boolean;
	lockedReason: string | null;
	creditsTotal: number;
	creditsRemaining: number;
	daysUntilExpiry: number | null;
	outstandingBalanceCents: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value as string);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

/**
 * Returns a human-readable relative expiry label.
 * - Negative / zero daysUntilExpiry → already expired
 * - 1–7 days → "in N day(s)" (red)
 * - 8–30 days → "in N days" (amber)
 * - > 30 days → neutral
 */
function expiryLabel(days: number | null): { text: string; className: string } {
	if (days === null) return { text: "No expiry", className: "text-muted-foreground" };
	if (days <= 0) return { text: "Expired", className: "text-red-600 font-medium" };
	if (days <= 7)
		return {
			text: `in ${days} day${days !== 1 ? "s" : ""}`,
			className: "text-red-600 font-medium",
		};
	if (days <= 30)
		return {
			text: `in ${days} days`,
			className: "text-amber-600 font-medium",
		};
	return {
		text: `in ${days} days`,
		className: "text-muted-foreground",
	};
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

function membershipStatusVariant(
	status: string,
	isLocked: boolean,
): "default" | "secondary" | "outline" | "destructive" {
	if (isLocked) return "secondary";
	switch (status) {
		case "active":
			return "default";
		case "expired":
		case "cancelled":
		case "exhausted":
			return "outline";
		default:
			return "outline";
	}
}

function membershipStatusLabel(status: string, isLocked: boolean): string {
	if (isLocked) return "Frozen";
	switch (status) {
		case "active":
			return "Active";
		case "expired":
			return "Expired";
		case "exhausted":
			return "Exhausted";
		case "cancelled":
			return "Cancelled";
		default:
			return status;
	}
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS: Array<{ value: MembershipFilter; label: string }> = [
	{ value: "active", label: "All Active" },
	{ value: "expiring_7d", label: "Expiring 7 days" },
	{ value: "expiring_30d", label: "Expiring 30 days" },
	{ value: "frozen", label: "Frozen" },
	{ value: "expired", label: "Expired" },
];

const PAGE_LIMIT = 100;

// ─── Page component ──────────────────────────────────────────────────────────

function MembershipsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// RBAC — check in component (requirePermission route-guard is a stub)
	const canRead = hasPermission("service_management:read");

	// Tab / filter state
	const [filter, setFilter] = useState<MembershipFilter>("active");

	// Branch filter
	const [branchId, setBranchId] = useState<string>("");

	// Pagination
	const [offset, setOffset] = useState(0);

	// Drawer state
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	// Accessible nodes for branch combobox (same pattern as P1 customers/view.tsx)
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const accessibleNodeIds =
		currentOrg?.hierarchy?.member?.accessibleNodeIds ?? [];
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const accessibleBranches = allNodes.filter(
		(n) => accessibleNodeIds.includes(n.id) && n.type === "branch",
	);
	const branchOptions =
		accessibleBranches.length > 0
			? accessibleBranches
			: allNodes.filter((n) => accessibleNodeIds.includes(n.id));

	// ── Query ────────────────────────────────────────────────────────────────

	const {
		data: listData,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"memberships",
			organizationId,
			filter,
			branchId,
			offset,
		],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
			// NOTE: packageInstances.listMemberships procedure is landing separately (P2-Backend).
			// The oRPC client accepts unknown procedure names at runtime; TS check passes
			// because the return type is `unknown` which we cast below.
			const result = await (
				client.packageInstances as unknown as {
					listMemberships: (input: {
						organizationId: string;
						filter: MembershipFilter;
						branchId?: string;
						limit: number;
						offset: number;
					}) => Promise<{ rows: MembershipRow[]; total: number }>;
				}
			).listMemberships({
				organizationId,
				filter,
				branchId: branchId || undefined,
				limit: PAGE_LIMIT,
				offset,
			});
			return result;
		},
		enabled: !!organizationId && canRead,
	});

	const rows: MembershipRow[] = (listData as { rows?: MembershipRow[] } | undefined)?.rows ?? [];
	const total: number = (listData as { total?: number } | undefined)?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_LIMIT);
	const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

	// ── Table columns ─────────────────────────────────────────────────────────

	const columns: ColumnDef<MembershipRow>[] = [
		{
			id: "customer",
			header: "Customer",
			cell: ({ row }) => {
				const name = row.original.clientName || "Unknown member";
				const initials = getInitials(name);
				return (
					<button
						type="button"
						className="flex items-center gap-2 text-left hover:underline focus:outline-none"
						onClick={() => {
							// memberId is the members.id (UUID) — backend must include this field
							const mid = row.original.memberId;
							setSelectedMemberId(mid || null);
							setSheetOpen(true);
						}}
					>
						<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-xs">
							{initials}
						</span>
						<span className="font-medium">{name}</span>
					</button>
				);
			},
		},
		{
			id: "package",
			header: "Package",
			cell: ({ row }) => (
				<span className="font-medium">{row.original.serviceName}</span>
			),
		},
		{
			id: "credits",
			header: "Credits",
			cell: ({ row }) => (
				<span className="tabular-nums">
					{row.original.creditsRemaining} / {row.original.creditsTotal}
				</span>
			),
		},
		{
			id: "expires",
			header: "Expires",
			cell: ({ row }) => {
				const dateStr = formatDate(row.original.expiresAt);
				const { text, className } = expiryLabel(row.original.daysUntilExpiry);
				return (
					<div className="flex flex-col gap-0.5">
						<span className="text-sm">{dateStr}</span>
						<span className={`text-xs ${className}`}>{text}</span>
					</div>
				);
			},
		},
		{
			id: "outstanding",
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
			id: "status",
			header: "Status",
			cell: ({ row }) => {
				const variant = membershipStatusVariant(
					row.original.status,
					row.original.isLocked,
				);
				const label = membershipStatusLabel(
					row.original.status,
					row.original.isLocked,
				);
				if (row.original.isLocked && row.original.lockedReason) {
					return (
						<TooltipProvider>
							<Tooltip>
								<TooltipTrigger asChild>
									<span>
										<Badge variant={variant}>{label}</Badge>
									</span>
								</TooltipTrigger>
								<TooltipContent>
									<p>{row.original.lockedReason}</p>
								</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					);
				}
				return <Badge variant={variant}>{label}</Badge>;
			},
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
						const mid = row.original.memberId;
						setSelectedMemberId(mid || null);
						setSheetOpen(true);
					}}
				>
					View Customer
				</Button>
			),
		},
	];

	// ── Guards ─────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view memberships.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view memberships.
					</p>
				</div>
			</div>
		);
	}

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
							You don't have permission to view memberships.
						</p>
					</div>
				</div>
			);
		}
		return (
			<div className="flex min-h-96 items-center justify-center text-destructive">
				Failed to load memberships. Please try again.
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

	// ── Render ─────────────────────────────────────────────────────────────────

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="rounded-lg bg-primary/10 p-2">
					<BadgeCheck className="h-6 w-6 text-primary" />
				</div>
				<div>
					<h1 className="font-bold font-heading text-2xl">Memberships</h1>
					<p className="text-muted-foreground text-sm">
						{total > 0
							? `${total} membership${total !== 1 ? "s" : ""}`
							: "No memberships found"}
					</p>
				</div>
			</div>

			{/* Tabs */}
			<Tabs
				value={filter}
				onValueChange={(v) => {
					setFilter(v as MembershipFilter);
					setOffset(0);
				}}
			>
				<TabsList>
					{TABS.map((tab) => (
						<TabsTrigger key={tab.value} value={tab.value}>
							{tab.label}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3">
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

				{/*
				 * Service category filter: deferred to v2 — requires a service-categories
				 * list query that is not yet available. Documented here for future addition.
				 */}
			</div>

			<Separator />

			{/* Table */}
			<DataTable<MembershipRow, unknown> columns={columns} data={rows} />

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

			{/* Customer Detail Drawer — reused from Phase 1 */}
			{selectedMemberId && organizationId && (
				<CustomerDetailSheet
					memberId={selectedMemberId}
					organizationId={organizationId}
					open={sheetOpen}
					onOpenChange={(open) => {
						setSheetOpen(open);
						if (!open) setSelectedMemberId(null);
					}}
				/>
			)}
		</div>
	);
}
