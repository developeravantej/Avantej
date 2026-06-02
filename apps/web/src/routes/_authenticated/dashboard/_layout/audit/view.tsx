import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import {
	ActivitySquare,
	AlertTriangle,
	ChevronRight,
	Download,
	Info,
	Lock,
	ScrollText,
	ShieldAlert,
} from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import type { ElementType } from "react";
import { useState } from "react";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { RoleBadge } from "@/components/ui/role-badge";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/audit/view",
)({
	beforeLoad: async () => {
		await requirePermission("audit_log:read");
	},
	component: AuditLogPage,
});

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;

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

type SeverityFilter = "danger" | "warning" | "info" | "";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditRowEnriched = {
	id: string;
	actorUserId: string;
	actorMemberId: string | null;
	actorRole: string | null;
	actorName: string | null;
	actorInitials: string | null;
	action: string;
	entityType: string;
	entityId: string | null;
	entityLabel: string | null;
	branchId: string | null;
	branchName: string | null;
	summary: string;
	severity: "danger" | "warning" | "info";
	changes: Record<string, unknown> | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: Date | string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAbsoluteTime(date: Date | string | null): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString("en-MY", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
}

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

// ─── Severity badge ───────────────────────────────────────────────────────────

function SeverityBadge({
	severity,
}: {
	severity: "danger" | "warning" | "info";
}) {
	const map = {
		danger: {
			dot: "bg-rose-500",
			badge: "bg-rose-50 text-rose-600 border border-rose-200",
		},
		warning: {
			dot: "bg-amber-400",
			badge: "bg-amber-50 text-amber-700 border border-amber-200",
		},
		info: {
			dot: "bg-blue-500",
			badge: "bg-blue-50 text-blue-700 border border-blue-200",
		},
	};
	const { dot, badge } = map[severity];
	return (
		<div className="flex items-center gap-1.5">
			<span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
			<span
				className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}
			>
				{severity}
			</span>
		</div>
	);
}

// ─── Action badge ─────────────────────────────────────────────────────────────

function ActionBadge({
	action,
	severity,
}: {
	action: string;
	severity: "danger" | "warning" | "info";
}) {
	const cls =
		severity === "danger"
			? "bg-rose-50 border border-rose-200 text-rose-700"
			: severity === "warning"
				? "bg-amber-50 border border-amber-200 text-amber-800"
				: "bg-[#f3f3f3] text-[#737373]";
	return (
		<span className={`font-mono text-xs px-2 py-0.5 rounded-md ${cls}`}>
			{action}
		</span>
	);
}

// ─── Actor avatar ─────────────────────────────────────────────────────────────

function ActorAvatar({ initials }: { initials: string | null }) {
	const letters = initials ?? "?";
	const isUnknown = !initials;
	return (
		<span
			className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isUnknown ? "bg-rose-50 text-rose-700" : "bg-[#0a0a0a] text-white"}`}
		>
			{letters}
		</span>
	);
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
	icon: ElementType;
	label: string;
	value: number | string;
	valueClass?: string;
	isLoading?: boolean;
}

function KpiTile({
	icon: Icon,
	label,
	value,
	valueClass = "text-[#0a0a0a]",
	isLoading,
}: KpiTileProps) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
			<div className="flex items-center gap-2 mb-1">
				<Icon className="h-3.5 w-3.5 text-[#737373]" />
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
					{label}
				</p>
			</div>
			{isLoading ? (
				<div className="h-7 w-16 rounded bg-[#e5e5e5] animate-pulse mt-1" />
			) : (
				<p
					className={`mt-1 text-2xl font-bold font-mono tabular-nums ${valueClass}`}
				>
					{value}
				</p>
			)}
		</div>
	);
}

// ─── Changes dialog ───────────────────────────────────────────────────────────

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
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						AUDIT LOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a] flex flex-col gap-1">
						<span>Audit Entry Detail</span>
						<span className="font-normal text-sm text-[#737373] font-mono tabular-nums">
							{formatAbsoluteTime(row.createdAt)}
						</span>
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Full details of this audit log entry.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4">
						<div>
							<p className="mb-1 font-medium text-sm text-[#0a0a0a]">Summary</p>
							<p className="text-sm text-[#737373]">{row.summary}</p>
						</div>

						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Actor</p>
								<div className="flex items-center gap-2">
									<ActorAvatar initials={row.actorInitials} />
									<div>
										<p className="text-[#737373]">
											{row.actorName ?? "Unknown"}
										</p>
										<p className="font-mono text-[#737373] text-xs tabular-nums">
											{row.actorUserId}
										</p>
									</div>
								</div>
							</div>
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Role</p>
								<RoleBadge role={row.actorRole} />
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4 text-sm">
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Entity</p>
								<p className="text-[#737373]">
									{row.entityType}{" "}
									{row.entityLabel ? `(${row.entityLabel})` : ""}
								</p>
							</div>
							<div>
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Entity ID</p>
								<p className="break-all font-mono text-[#737373] text-xs tabular-nums">
									{row.entityId ?? "—"}
								</p>
							</div>
						</div>

						{row.branchName && (
							<div className="text-sm">
								<p className="mb-0.5 font-medium text-[#0a0a0a]">Branch</p>
								<p className="text-[#737373]">{row.branchName}</p>
							</div>
						)}

						<div>
							<p className="mb-1 font-medium text-sm text-[#0a0a0a]">
								Changes Payload
							</p>
							{row.changes ? (
								<pre className="max-h-64 overflow-auto rounded-xl bg-[#f3f3f3] border border-[#e5e5e5] p-3 font-mono text-xs leading-relaxed text-[#404040]">
									{JSON.stringify(row.changes, null, 2)}
								</pre>
							) : (
								<p className="text-sm text-[#737373]">
									No change payload recorded.
								</p>
							)}
						</div>

						{(row.ipAddress || row.userAgent) && (
							<div className="space-y-1 border-t border-[#e5e5e5] pt-3 text-xs text-[#737373]">
								{row.ipAddress && (
									<p className="font-mono tabular-nums">IP: {row.ipAddress}</p>
								)}
								{row.userAgent && (
									<p className="truncate" title={row.userAgent}>
										UA: {row.userAgent}
									</p>
								)}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ─── Page component ───────────────────────────────────────────────────────────

function AuditLogPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("audit_log:read");

	// ── Filters ────────────────────────────────────────────────────────────

	const [actorUserId, setActorUserId] = useState("");
	const [action, setAction] = useState<string>("");
	const [entityType, setEntityType] = useState<string>("");
	const [branchId, setBranchId] = useState<string>("");
	const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("");
	const [search, setSearch] = useState("");

	const [fromInput, setFromInput] = useState("");
	const [toInput, setToInput] = useState("");
	const [fromApplied, setFromApplied] = useState("");
	const [toApplied, setToApplied] = useState("");

	const [detailRow, setDetailRow] = useState<AuditRowEnriched | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);

	const [exporting, setExporting] = useState(false);

	// ── Branch options ─────────────────────────────────────────────────────

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

	// ── Shared filter params ───────────────────────────────────────────────

	const filterParams = {
		organizationId: organizationId ?? "",
		actorUserId: actorUserId || undefined,
		action: action || undefined,
		entityType: entityType || undefined,
		branchId: branchId || undefined,
		from: fromApplied || undefined,
		to: toApplied || undefined,
		severity: (severityFilter || undefined) as
			| "info"
			| "warning"
			| "danger"
			| undefined,
	};

	// ── KPI queries ────────────────────────────────────────────────────────

	const { data: kpiTotal, isLoading: kpiTotalLoading } = useQuery({
		...orpc.auditLogs.list.queryOptions({
			input: { ...filterParams, limit: 1, offset: 0, severity: undefined },
		}),
		enabled: !!organizationId && canRead,
		staleTime: 60_000,
		select: (d) => d.total,
	});

	const { data: kpiDanger, isLoading: kpiDangerLoading } = useQuery({
		...orpc.auditLogs.list.queryOptions({
			input: {
				...filterParams,
				limit: 1,
				offset: 0,
				severity: "danger" as const,
			},
		}),
		enabled: !!organizationId && canRead,
		staleTime: 60_000,
		select: (d) => d.total,
	});

	const { data: kpiWarning, isLoading: kpiWarningLoading } = useQuery({
		...orpc.auditLogs.list.queryOptions({
			input: {
				...filterParams,
				limit: 1,
				offset: 0,
				severity: "warning" as const,
			},
		}),
		enabled: !!organizationId && canRead,
		staleTime: 60_000,
		select: (d) => d.total,
	});

	const { data: kpiInfo, isLoading: kpiInfoLoading } = useQuery({
		...orpc.auditLogs.list.queryOptions({
			input: {
				...filterParams,
				limit: 1,
				offset: 0,
				severity: "info" as const,
			},
		}),
		enabled: !!organizationId && canRead,
		staleTime: 60_000,
		select: (d) => d.total,
	});

	// ── Main list query ────────────────────────────────────────────────────

	const {
		data: listData,
		isLoading,
		error,
		refetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: [
			"auditLog",
			"list",
			organizationId,
			actorUserId,
			action,
			entityType,
			branchId,
			fromApplied,
			toApplied,
			severityFilter,
		],
		queryFn: async ({ pageParam }) => {
			if (!organizationId) return { rows: [], total: 0 };
			return client.auditLogs.list({
				...filterParams,
				limit: PAGE_LIMIT,
				offset: pageParam,
			});
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage, allPages) => {
			const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0);
			return loaded < lastPage.total ? loaded : undefined;
		},
		enabled: !!organizationId && canRead,
	});

	const rows: AuditRowEnriched[] = (listData?.pages.flatMap((p) => p.rows) ??
		[]) as AuditRowEnriched[];
	const total = listData?.pages[0]?.total ?? 0;

	const filteredRows = search.trim()
		? rows.filter(
				(r) =>
					(r.actorName ?? "").toLowerCase().includes(search.toLowerCase()) ||
					r.summary.toLowerCase().includes(search.toLowerCase()) ||
					r.action.toLowerCase().includes(search.toLowerCase()),
			)
		: rows;

	async function handleExportCsv() {
		if (!organizationId) return;
		setExporting(true);
		try {
			const result = await client.auditLogs.exportCsv({ ...filterParams });
			const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
			if (result.truncated) {
				toast.warning(
					`Export truncated — showing ${result.totalMatching} total matches. Narrow your filters for a complete export.`,
				);
			} else {
				toast.success("CSV exported successfully.");
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Export failed. Please try again.",
			);
		} finally {
			setExporting(false);
		}
	}

	const hasActiveFilters = !!(
		actorUserId ||
		action ||
		entityType ||
		branchId ||
		fromApplied ||
		toApplied ||
		severityFilter
	);
	const activeFilterCount = [
		actorUserId,
		action,
		entityType,
		branchId,
		fromApplied,
		toApplied,
		severityFilter,
	].filter(Boolean).length;

	function clearAllFilters() {
		setActorUserId("");
		setAction("");
		setEntityType("");
		setBranchId("");
		setSeverityFilter("");
		setFromInput("");
		setToInput("");
		setFromApplied("");
		setToApplied("");
		setSearch("");
	}

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col items-center justify-center">
				<Lock className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					No organization selected
				</p>
				<p className="text-xs mt-1 text-[#737373]">
					Select an organization to view the audit log.
				</p>
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col items-center justify-center">
				<Lock className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					You don&apos;t have access to this page
				</p>
				<p className="text-xs mt-1 text-[#737373]">
					Ask an admin to grant audit log access.
				</p>
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
				<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col items-center justify-center">
					<Lock className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
					<p className="text-sm font-medium text-[#0a0a0a]">
						Permission denied
					</p>
					<p className="text-xs mt-1 text-[#737373]">
						You don&apos;t have permission to view the audit log.
					</p>
				</div>
			);
		}
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
				<StatusCallout variant="error" onRetry={() => refetch()}>
					Failed to load audit log. Please try again.
				</StatusCallout>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<Skeleton name="audit-view" loading={isLoading} fallback={<PageLoader />}>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
					<div className="flex items-center gap-3 text-sm">
						<span className="text-[#737373]">Operations</span>
						<span className="text-[#a3a3a3]">/</span>
						<span className="font-semibold">Audit Log</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<button
							type="button"
							onClick={handleExportCsv}
							disabled={exporting || rows.length === 0}
							className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3] disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<Download className="h-4 w-4" />
							{exporting ? "Exporting…" : "Export CSV"}
						</button>
					</div>
				</header>
				<div className="px-6 py-6">
					{/* ── KPI tiles ── */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
						<KpiTile
							icon={ActivitySquare}
							label="TOTAL EVENTS"
							value={kpiTotal ?? "—"}
							isLoading={kpiTotalLoading}
						/>
						<KpiTile
							icon={ShieldAlert}
							label="DANGER"
							value={kpiDanger ?? "—"}
							valueClass="text-rose-600"
							isLoading={kpiDangerLoading}
						/>
						<KpiTile
							icon={AlertTriangle}
							label="WARNING"
							value={kpiWarning ?? "—"}
							valueClass="text-amber-700"
							isLoading={kpiWarningLoading}
						/>
						<KpiTile
							icon={Info}
							label="INFO"
							value={kpiInfo ?? "—"}
							valueClass="text-blue-700"
							isLoading={kpiInfoLoading}
						/>
					</div>

					{/* ── Filter card ── */}
					<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 mb-4">
						<div className="flex flex-wrap items-end gap-3">
							{/* Severity */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Severity
								</Label>
								<Select
									value={severityFilter || "all"}
									onValueChange={(v) => {
										setSeverityFilter(v === "all" ? "" : (v as SeverityFilter));
									}}
								>
									<SelectTrigger className="h-9 w-36">
										<SelectValue placeholder="All" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										<SelectItem value="info">info</SelectItem>
										<SelectItem value="warning">warn</SelectItem>
										<SelectItem value="danger">danger</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Actor user ID */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Actor
								</Label>
								<Input
									placeholder="All actors"
									value={actorUserId}
									onChange={(e) => {
										setActorUserId(e.target.value);
									}}
									className="h-9 w-40 font-mono text-xs"
								/>
							</div>

							{/* Action type */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Action type
								</Label>
								<Select
									value={action || "all"}
									onValueChange={(v) => {
										setAction(v === "all" ? "" : v);
									}}
								>
									<SelectTrigger className="h-9 w-44">
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
							<div className="flex flex-col gap-1.5">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Entity type
								</Label>
								<Select
									value={entityType || "all"}
									onValueChange={(v) => {
										setEntityType(v === "all" ? "" : v);
									}}
								>
									<SelectTrigger className="h-9 w-40">
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

							{/* Date from */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Date from
								</Label>
								<input
									type="date"
									value={fromInput}
									onChange={(e) => setFromInput(e.target.value)}
									onBlur={() => {
										setFromApplied(fromInput);
									}}
									className="h-9 w-36 rounded-xl border border-[#e5e5e5] bg-white px-3 text-xs outline-none focus:border-[#0a0a0a] font-mono tabular-nums"
								/>
							</div>

							{/* Date to */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
									Date to
								</Label>
								<input
									type="date"
									value={toInput}
									onChange={(e) => setToInput(e.target.value)}
									onBlur={() => {
										setToApplied(toInput);
									}}
									className="h-9 w-36 rounded-xl border border-[#e5e5e5] bg-white px-3 text-xs outline-none focus:border-[#0a0a0a] font-mono tabular-nums"
								/>
							</div>

							{/* Branch */}
							{branchOptions.length > 0 && (
								<div className="flex flex-col gap-1.5">
									<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
										Branch
									</Label>
									<Select
										value={branchId || "all"}
										onValueChange={(v) => {
											setBranchId(v === "all" ? "" : v);
										}}
									>
										<SelectTrigger className="h-9 w-44">
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

							{/* Clear */}
							{hasActiveFilters && (
								<div className="flex items-end">
									<button
										type="button"
										onClick={clearAllFilters}
										className="h-9 rounded-[10px] border border-[#e5e5e5] bg-white px-3 text-[13px] font-medium text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] transition"
									>
										Clear filters
									</button>
								</div>
							)}

							{/* Search pushed right */}
							<div className="ml-auto flex items-end gap-2">
								<div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
									<svg
										className="h-4 w-4 text-[#737373] flex-shrink-0"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										aria-hidden
									>
										<circle cx="11" cy="11" r="8" />
										<path d="m21 21-4.35-4.35" />
									</svg>
									<input
										className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#737373] text-[#0a0a0a] w-48"
										placeholder="Search events…"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>
							</div>
						</div>

						{/* Status line */}
						<div className="mt-3 flex items-center gap-1.5 text-xs text-[#737373]">
							{activeFilterCount > 0 ? (
								<>
									<span>
										{activeFilterCount} filter
										{activeFilterCount !== 1 ? "s" : ""} active
									</span>
									<span>·</span>
								</>
							) : null}
							<span className="font-semibold text-[#0a0a0a] font-mono tabular-nums">
								{total} result{total !== 1 ? "s" : ""}
							</span>
							<span>·</span>
							<span>Sorted by timestamp desc</span>
						</div>
					</div>

					{/* ── Table ── */}
					{filteredRows.length === 0 ? (
						<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
							<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
								<ScrollText className="h-8 w-8 mb-3 opacity-30" />
								<p className="text-sm font-medium text-[#0a0a0a]">
									No audit events
								</p>
								<p className="text-xs mt-1">
									No audit log entries match the current filters.
								</p>
							</div>
						</div>
					) : (
						<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
							<table className="w-full">
								<thead className="bg-[#f3f3f3]">
									<tr className="border-b border-[#e5e5e5]">
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Severity
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Timestamp
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Actor
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Action
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Entity type
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Entity ID
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Branch
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											IP
										</th>
										<th className="px-4 py-3" />
									</tr>
								</thead>
								<tbody className="divide-y divide-[#e5e5e5]">
									{filteredRows.map((row) => (
										<tr
											key={row.id}
											className="hover:bg-[#fafafa] transition-colors"
										>
											<td className="px-4 py-3">
												<SeverityBadge severity={row.severity} />
											</td>
											<td className="px-4 py-3">
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="cursor-default whitespace-nowrap font-mono text-xs text-[#737373] tabular-nums">
																{formatAbsoluteTime(row.createdAt)}
															</span>
														</TooltipTrigger>
														<TooltipContent>
															<p>{formatRelativeTime(row.createdAt)}</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<ActorAvatar initials={row.actorInitials} />
													<span className="font-medium text-sm text-[#0a0a0a]">
														{row.actorName ?? "Unknown"}
													</span>
												</div>
											</td>
											<td className="px-4 py-3">
												<ActionBadge
													action={row.action}
													severity={row.severity}
												/>
											</td>
											<td className="px-4 py-3">
												<span className="text-xs text-[#737373]">
													{row.entityType}
												</span>
											</td>
											<td className="px-4 py-3">
												{(() => {
													const { entityLabel, entityId } = row;
													const display = entityLabel ?? entityId;
													if (!display)
														return (
															<span className="font-mono text-xs text-[#737373]">
																—
															</span>
														);
													return (
														<div className="flex items-center gap-1">
															<span className="font-mono text-xs text-[#0a0a0a]">
																{display}
															</span>
															{entityId && entityId !== display && (
																<CopyableCell
																	value={entityId}
																	displayText="ID"
																/>
															)}
														</div>
													);
												})()}
											</td>
											<td className="px-4 py-3">
												<span className="text-xs text-[#737373]">
													{row.branchName ?? "—"}
												</span>
											</td>
											<td className="px-4 py-3">
												<span className="font-mono text-xs text-[#737373] tabular-nums">
													{row.ipAddress ?? "—"}
												</span>
											</td>
											<td className="px-4 py-3">
												<button
													type="button"
													className="inline-flex items-center gap-0.5 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1 text-[11px] font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
													onClick={() => {
														setDetailRow(row);
														setDetailOpen(true);
													}}
													aria-label="View diff"
												>
													Diff <ChevronRight className="h-3 w-3" />
												</button>
											</td>
										</tr>
									))}
								</tbody>
							</table>

							{/* Load more footer */}
							<div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f3f3f3]/50 px-4 py-2.5">
								<span className="text-[13px] text-[#737373] font-mono tabular-nums">
									{rows.length} of {total} results
								</span>
								{hasNextPage && (
									<button
										type="button"
										onClick={() => fetchNextPage()}
										disabled={isFetchingNextPage}
										className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-[14px] py-[8px] text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-40"
									>
										{isFetchingNextPage ? "Loading…" : "Load more"}
									</button>
								)}
							</div>
						</div>
					)}

					<ChangesDialog
						row={detailRow}
						open={detailOpen}
						onOpenChange={(open) => {
							setDetailOpen(open);
							if (!open) setDetailRow(null);
						}}
					/>
				</div>
			</div>
		</Skeleton>
	);
}
