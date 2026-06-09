import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
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
import { useState } from "react";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { StatusCallout } from "@/components/ui/status-callout";
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

import { ActionBadge, ActorAvatar, SeverityBadge } from "./badges";
import { ChangesDialog } from "./ChangesDialog";
import { formatAbsoluteTime, formatRelativeTime } from "./helpers";
import { KpiTile } from "./KpiTile";
import {
	AUDIT_ACTIONS,
	type AuditRowEnriched,
	ENTITY_TYPES,
	PAGE_LIMIT,
	type SeverityFilter,
} from "./types";

// ─── Page component ───────────────────────────────────────────────────────────

export function AuditLogPage() {
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
