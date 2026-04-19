import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, ClipboardList } from "lucide-react";
import { useState } from "react";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/audit/view",
)({
	component: AuditLogPage,
});

// ─── Constants ─────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;

// Canonical action vocabulary — extensible string (no DB enum)
const AUDIT_ACTIONS = [
	"sale.create",
	"sale.cancel",
	"sale.refund.request",
	"sale.refund.approve",
	"sale.refund.process",
	"sale.refund.reject",
	"commission.approve",
	"commission.mark_paid",
	"member.deactivate",
	"member.reactivate",
	"member.role_change",
	"member.suspend",
	"checkin.create",
	"checkin.delete",
	"package.unlock",
	"package.refund",
	"promotion.create",
	"promotion.deactivate",
	"tax.set_default",
] as const;

// Entity types available for filtering
const ENTITY_TYPES = [
	"sales_order",
	"refund",
	"payment",
	"package_instance",
	"member",
	"commission_split",
	"check_in",
	"promotion",
	"tax_rate",
] as const;

// ─── Action color mapping ─────────────────────────────────────────────────────

/**
 * Maps the leading category of an action string to a Tailwind badge class.
 * Key = first segment of action (before the first ".").
 */
const ACTION_CATEGORY_COLORS: Record<string, string> = {
	sale: "bg-blue-100 text-blue-800 border-blue-200",
	commission: "bg-green-100 text-green-800 border-green-200",
	member: "bg-purple-100 text-purple-800 border-purple-200",
	checkin: "bg-cyan-100 text-cyan-800 border-cyan-200",
	package: "bg-indigo-100 text-indigo-800 border-indigo-200",
	promotion: "bg-pink-100 text-pink-800 border-pink-200",
	tax: "bg-yellow-100 text-yellow-800 border-yellow-200",
	system: "bg-gray-100 text-gray-700 border-gray-200",
};

// Refund actions get their own color (override the sale.* default)
function getActionColor(action: string): string {
	if (action.includes("refund")) {
		return "bg-orange-100 text-orange-800 border-orange-200";
	}
	const category = action.split(".")[0] ?? "system";
	return ACTION_CATEGORY_COLORS[category] ?? ACTION_CATEGORY_COLORS.system;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditRowEnriched = {
	id: string;
	actorUserId: string;
	actorMemberId: string | null;
	actorRole: string | null;
	actorName: string | null;
	action: string;
	entityType: string;
	entityId: string | null;
	entityLabel: string | null;
	branchId: string | null;
	branchName: string | null;
	summary: string;
	changes: Record<string, unknown> | null;
	ipAddress: string | null;
	userAgent: string | null;
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

function formatAbsoluteTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_BADGE_COLORS: Record<string, string> = {
	admin: "bg-red-100 text-red-800 border-red-200",
	staff: "bg-blue-100 text-blue-800 border-blue-200",
	trainer: "bg-green-100 text-green-800 border-green-200",
	client: "bg-gray-100 text-gray-700 border-gray-200",
	system: "bg-slate-100 text-slate-700 border-slate-200",
};

function RoleBadge({ role }: { role: string | null }) {
	if (!role) return null;
	const colorClass =
		ROLE_BADGE_COLORS[role.toLowerCase()] ?? ROLE_BADGE_COLORS.system;
	return (
		<span
			className={`inline-flex items-center rounded border px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide ${colorClass}`}
		>
			{role}
		</span>
	);
}

// ─── Changes Dialog ───────────────────────────────────────────────────────────

function ChangesDialog({
	row,
	open,
	onOpenChange,
}: {
	row: AuditRowEnriched | null;
	open: boolean;
	onOpenChange: (v: boolean) => void;
}) {
	if (!row) return null;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex flex-col gap-1">
						<span>Audit Entry Detail</span>
						<span className="font-normal text-muted-foreground text-sm">
							{formatAbsoluteTime(row.createdAt)}
						</span>
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Summary */}
					<div>
						<p className="mb-1 font-medium text-sm">Summary</p>
						<p className="text-muted-foreground text-sm">{row.summary}</p>
					</div>

					{/* Actor */}
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<p className="mb-0.5 font-medium">Actor</p>
							<p className="text-muted-foreground">
								{row.actorName ?? "Unknown"}
							</p>
							<p className="font-mono text-muted-foreground text-xs">
								{row.actorUserId}
							</p>
						</div>
						<div>
							<p className="mb-0.5 font-medium">Role</p>
							<RoleBadge role={row.actorRole} />
						</div>
					</div>

					{/* Entity */}
					<div className="grid grid-cols-2 gap-4 text-sm">
						<div>
							<p className="mb-0.5 font-medium">Entity</p>
							<p className="text-muted-foreground">
								{row.entityType}{" "}
								{row.entityLabel ? `(${row.entityLabel})` : ""}
							</p>
						</div>
						<div>
							<p className="mb-0.5 font-medium">Entity ID</p>
							<p className="break-all font-mono text-muted-foreground text-xs">
								{row.entityId ?? "—"}
							</p>
						</div>
					</div>

					{/* Branch */}
					{row.branchName && (
						<div className="text-sm">
							<p className="mb-0.5 font-medium">Branch</p>
							<p className="text-muted-foreground">{row.branchName}</p>
						</div>
					)}

					{/* Changes JSON */}
					<div>
						<p className="mb-1 font-medium text-sm">Changes Payload</p>
						{row.changes ? (
							<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
								{JSON.stringify(row.changes, null, 2)}
							</pre>
						) : (
							<p className="text-muted-foreground text-sm">
								No change payload recorded.
							</p>
						)}
					</div>

					{/* Meta */}
					{(row.ipAddress || row.userAgent) && (
						<div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">
							{row.ipAddress && <p>IP: {row.ipAddress}</p>}
							{row.userAgent && (
								<p className="truncate" title={row.userAgent}>
									UA: {row.userAgent}
								</p>
							)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ─── Page component ───────────────────────────────────────────────────────────

function AuditLogPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// RBAC — checked in component (route-guard is a stub)
	const canRead = hasPermission("audit_log:read");

	// ── Filters ────────────────────────────────────────────────────────────

	// Actor filter — free-text userId (no listStaff procedure confirmed available)
	const [actorUserId, setActorUserId] = useState("");

	// Single action filter (backend accepts string | string[]; single-select matches existing UX)
	const [action, setAction] = useState<string>("");

	// Entity type filter
	const [entityType, setEntityType] = useState<string>("");

	// Branch filter
	const [branchId, setBranchId] = useState<string>("");

	// Date range — applied on blur via local state pushed to query state
	const [fromInput, setFromInput] = useState("");
	const [toInput, setToInput] = useState("");
	const [fromApplied, setFromApplied] = useState("");
	const [toApplied, setToApplied] = useState("");

	// Pagination
	const [offset, setOffset] = useState(0);

	// Detail dialog
	const [detailRow, setDetailRow] = useState<AuditRowEnriched | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);

	// ── Branch options from hierarchy ──────────────────────────────────────

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

	// ── Query ──────────────────────────────────────────────────────────────

	const {
		data: listData,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"auditLog",
			organizationId,
			actorUserId,
			action,
			entityType,
			branchId,
			fromApplied,
			toApplied,
			offset,
		],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
			// @ts-expect-error — auditLogs router merges from backend agent before release
			return client.auditLogs.list({
				organizationId,
				actorUserId: actorUserId || undefined,
				action: action || undefined,
				entityType: entityType || undefined,
				branchId: branchId || undefined,
				from: fromApplied || undefined,
				to: toApplied || undefined,
				limit: PAGE_LIMIT,
				offset,
			});
		},
		enabled: !!organizationId && canRead,
	});

	const rows: AuditRowEnriched[] = listData?.rows ?? [];
	const total = listData?.total ?? 0;
	const totalPages = Math.ceil(total / PAGE_LIMIT);
	const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;

	// ── Reset pagination when any filter changes ────────────────────────────

	function resetOffset() {
		setOffset(0);
	}

	// ── Table columns ──────────────────────────────────────────────────────

	const columns: ColumnDef<AuditRowEnriched>[] = [
		{
			accessorKey: "createdAt",
			header: "When",
			cell: ({ row }) => (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-default whitespace-nowrap text-muted-foreground text-sm">
								{formatRelativeTime(row.original.createdAt)}
							</span>
						</TooltipTrigger>
						<TooltipContent>
							<p>{formatAbsoluteTime(row.original.createdAt)}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			),
		},
		{
			accessorKey: "actorName",
			header: "Actor",
			cell: ({ row }) => {
				const { actorName, actorUserId: userId, actorRole } = row.original;
				return (
					<div className="flex flex-col gap-0.5">
						<span className="font-medium">{actorName ?? "Unknown"}</span>
						<div className="flex items-center gap-1.5">
							<CopyableCell
								value={userId}
								displayText={userId.slice(0, 8) + "…"}
							/>
							<RoleBadge role={actorRole} />
						</div>
					</div>
				);
			},
		},
		{
			accessorKey: "action",
			header: "Action",
			cell: ({ row }) => {
				const colorClass = getActionColor(row.original.action);
				return (
					<span
						className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs ${colorClass}`}
					>
						{row.original.action}
					</span>
				);
			},
		},
		{
			accessorKey: "entityType",
			header: "Entity",
			cell: ({ row }) => {
				const { entityType: eType, entityLabel, entityId } = row.original;
				const displayLabel = entityLabel ?? entityId ?? "—";
				return (
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							{eType}
						</span>
						<div className="flex items-center gap-1">
							<span className="text-sm">{displayLabel}</span>
							{entityId && <CopyableCell value={entityId} displayText="ID" />}
						</div>
					</div>
				);
			},
		},
		{
			accessorKey: "branchName",
			header: "Branch",
			cell: ({ row }) => (
				<span className="text-muted-foreground text-sm">
					{row.original.branchName ?? "—"}
				</span>
			),
		},
		{
			accessorKey: "summary",
			header: "Summary",
			cell: ({ row }) => (
				<span className="max-w-xs truncate text-sm" title={row.original.summary}>
					{row.original.summary}
				</span>
			),
		},
		{
			id: "expand",
			header: "",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 w-7 p-0"
					onClick={() => {
						setDetailRow(row.original);
						setDetailOpen(true);
					}}
					aria-label="View details"
				>
					<ChevronRight className="h-4 w-4" />
				</Button>
			),
		},
	];

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view the audit log.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view the audit log.
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
							You don't have permission to view the audit log.
						</p>
					</div>
				</div>
			);
		}
		return (
			<div className="flex min-h-96 items-center justify-center text-destructive">
				Failed to load audit log. Please try again.
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
			<div className="flex items-center gap-3">
				<div className="rounded-lg bg-primary/10 p-2">
					<ClipboardList className="h-6 w-6 text-primary" />
				</div>
				<div>
					<h1 className="font-bold font-heading text-2xl">Audit Log</h1>
					<p className="text-muted-foreground text-sm">
						{total > 0
							? `${total} audit entr${total !== 1 ? "ies" : "y"}`
							: "No audit entries found"}
					</p>
				</div>
			</div>

			{/* Filters */}
			<div className="flex flex-wrap items-end gap-3">
				{/* Actor userId — free-text (no listStaff procedure confirmed; TODO: upgrade to combobox when available) */}
				<div className="flex flex-col gap-1">
					<Label className="text-xs">Actor User ID</Label>
					<Input
						placeholder="Paste user ID..."
						value={actorUserId}
						onChange={(e) => {
							setActorUserId(e.target.value);
							resetOffset();
						}}
						className="h-9 w-56 font-mono text-xs"
					/>
				</div>

				{/* Action — single-select */}
				<div className="flex flex-col gap-1">
					<Label className="text-xs">Action</Label>
					<Select
						value={action || "all"}
						onValueChange={(v) => {
							setAction(v === "all" ? "" : v);
							resetOffset();
						}}
					>
						<SelectTrigger className="h-9 w-52">
							<SelectValue placeholder="All actions" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All actions</SelectItem>
							{AUDIT_ACTIONS.map((a) => (
								<SelectItem key={a} value={a}>
									{a}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Entity type */}
				<div className="flex flex-col gap-1">
					<Label className="text-xs">Entity Type</Label>
					<Select
						value={entityType || "all"}
						onValueChange={(v) => {
							setEntityType(v === "all" ? "" : v);
							resetOffset();
						}}
					>
						<SelectTrigger className="h-9 w-44">
							<SelectValue placeholder="All entities" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All entities</SelectItem>
							{ENTITY_TYPES.map((et) => (
								<SelectItem key={et} value={et}>
									{et}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Branch filter */}
				{branchOptions.length > 0 && (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Branch</Label>
						<Select
							value={branchId || "all"}
							onValueChange={(v) => {
								setBranchId(v === "all" ? "" : v);
								resetOffset();
							}}
						>
							<SelectTrigger className="h-9 w-48">
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
					</div>
				)}

				{/* Date range — applied on blur */}
				<div className="flex flex-col gap-1">
					<Label className="text-xs">From</Label>
					<Input
						type="datetime-local"
						value={fromInput}
						onChange={(e) => setFromInput(e.target.value)}
						onBlur={() => {
							setFromApplied(fromInput);
							resetOffset();
						}}
						className="h-9 w-48"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<Label className="text-xs">To</Label>
					<Input
						type="datetime-local"
						value={toInput}
						onChange={(e) => setToInput(e.target.value)}
						onBlur={() => {
							setToApplied(toInput);
							resetOffset();
						}}
						className="h-9 w-48"
					/>
				</div>

				{/* Clear filters */}
				{(actorUserId || action || entityType || branchId || fromApplied || toApplied) && (
					<Button
						variant="ghost"
						size="sm"
						className="h-9 self-end"
						onClick={() => {
							setActorUserId("");
							setAction("");
							setEntityType("");
							setBranchId("");
							setFromInput("");
							setToInput("");
							setFromApplied("");
							setToApplied("");
							resetOffset();
						}}
					>
						Clear filters
					</Button>
				)}
			</div>

			<Separator />

			{/* Table */}
			<DataTable<AuditRowEnriched, unknown> columns={columns} data={rows} />

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

			{/* Detail dialog — row expand v1 */}
			<ChangesDialog
				row={detailRow}
				open={detailOpen}
				onOpenChange={(open) => {
					setDetailOpen(open);
					if (!open) setDetailRow(null);
				}}
			/>
		</div>
	);
}
