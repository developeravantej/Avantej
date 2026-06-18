import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { client, orpc } from "@/utils/orpc";
import {
	DisputeDialog,
	type DisputeTarget,
} from "@/components/pages/commissions/dispute-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

type MyCommissionRow = {
	id: string;
	staffId: string;
	appointmentId: string | null;
	salesOrderId: string | null;
	splitPercentage: number;
	calculatedAmount: number;
	status: string;
	notes: string | null;
	createdAt: string | Date;
	serviceName?: string | null;
	branchName?: string | null;
	appointmentNumber?: string | null;
	salesOrderNumber?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function initials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

function statusBadgeClass(status: string): string {
	switch (status) {
		case "approved":
			return "bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]";
		case "paid":
			return "bg-[#eff6ff] text-[#1d4ed8] border border-[#bfdbfe]";
		case "void":
			return "bg-[#fef2f2] text-[#b91c1c] border border-[#fecaca]";
		case "contested":
			return "bg-[#fffbeb] text-[#b45309] border border-[#fde68a]";
		default:
			return "bg-white text-[#4a4f51] border border-[#e5e5e5]";
	}
}

function StatusPill({ status }: { status: string }) {
	return (
		<span
			className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-medium leading-[1.4] ${statusBadgeClass(status)}`}
		>
			{status}
		</span>
	);
}

// ─── SourceCell ───────────────────────────────────────────────────────────────

function SourceCell({ row }: { row: MyCommissionRow }) {
	if (row.appointmentId) {
		const label = row.appointmentNumber
			? `Appt ${row.appointmentNumber.slice(0, 8)}…`
			: `Appt ${row.appointmentId.slice(0, 8)}…`;
		return <span className="font-mono text-[#6b7170] text-xs">{label}</span>;
	}
	if (row.salesOrderId) {
		const label = row.salesOrderNumber
			? `Sale ${row.salesOrderNumber}`
			: `Sale ${row.salesOrderId.slice(0, 8)}…`;
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: row.salesOrderId }}
				className="font-mono text-xs text-[#1d4ed8] hover:underline"
			>
				{label}
			</Link>
		);
	}
	return <span className="text-[#6b7170]">—</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MyCommissionsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const [search, setSearch] = useState("");
	const [disputeTarget, setDisputeTarget] = useState<DisputeTarget | null>(
		null,
	);

	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.commissionSplits.getMyCommissions.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const rows: MyCommissionRow[] = data?.splits ?? [];

	// KPI computation
	const pendingRows = rows.filter((r) => r.status === "pending");
	const pendingTotal = pendingRows.reduce((s, r) => s + r.calculatedAmount, 0);
	const approvedRows = rows.filter((r) => r.status === "approved");
	const approvedTotal = approvedRows.reduce(
		(s, r) => s + r.calculatedAmount,
		0,
	);
	const activeRows = rows.filter((r) => r.status !== "void");
	const totalEarned = activeRows.reduce((s, r) => s + r.calculatedAmount, 0);

	// Derive "staff name" from user context
	const userName = userContext?.user?.name ?? userContext?.user?.email ?? "Me";
	const userInitials = initials(userName);

	// Group rows by status for the sidebar-style KPI list
	const statusGroups: {
		label: string;
		rows: MyCommissionRow[];
		total: number;
	}[] = [
		{ label: "Pending", rows: pendingRows, total: pendingTotal },
		{ label: "Approved", rows: approvedRows, total: approvedTotal },
	];

	// Filtered table rows
	const filteredRows = rows.filter((r) => {
		if (!search) return true;
		const q = search.toLowerCase();
		return (
			(r.serviceName ?? "").toLowerCase().includes(q) ||
			(r.branchName ?? "").toLowerCase().includes(q) ||
			(r.salesOrderNumber ?? "").toLowerCase().includes(q) ||
			(r.appointmentNumber ?? "").toLowerCase().includes(q)
		);
	});

	// ── Guards ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				Select an organization to view your commissions.
			</div>
		);
	}

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					title="Couldn't load commissions"
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<>
			<Skeleton
				name="commissions-mine-tab"
				loading={isLoading}
				fallback={<PageLoader />}
			>
				<div className="px-6 pb-6">
					{/* V1 card */}
					<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
						<div className="grid grid-cols-[260px_1fr] divide-x divide-[#e5e5e5]">
							{/* ── STAFF SIDEBAR ── */}
							<aside className="flex flex-col">
								{/* Search */}
								<div className="border-b border-[#e5e5e5] px-4 py-3">
									<input
										className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-[7px] text-xs text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
										placeholder="Search…"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								</div>

								{/* Single "me" entry (active) */}
								<div className="flex cursor-default items-center gap-3 bg-[#f3f3f3] px-4 py-3">
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
										{userInitials}
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate text-sm font-semibold text-[#0a0a0a]">
											{userName}
										</div>
										<div className="text-xs text-[#6b7170]">My Account</div>
									</div>
									<div className="text-right">
										<div className="font-mono text-sm font-semibold tabular-nums">
											{formatPrice(pendingTotal, "MYR")}
										</div>
										<StatusPill status="pending" />
									</div>
								</div>

								{/* KPI summary rows */}
								{statusGroups.map((g) =>
									g.rows.length > 0 ? (
										<div
											key={g.label}
											className="flex items-center gap-3 border-t border-[#e5e5e5] px-4 py-3"
										>
											<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3] text-xs font-bold text-[#0a0a0a]">
												{g.rows.length}
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium text-[#0a0a0a]">
													{g.label}
												</div>
												<div className="text-xs text-[#6b7170]">
													{g.rows.length} split{g.rows.length !== 1 ? "s" : ""}
												</div>
											</div>
											<div className="text-right">
												<div className="font-mono text-sm font-medium tabular-nums">
													{formatPrice(g.total, "MYR")}
												</div>
												<StatusPill status={g.label.toLowerCase()} />
											</div>
										</div>
									) : null,
								)}
							</aside>

							{/* ── DETAIL PANEL ── */}
							<div className="flex flex-col">
								{/* Staff hero */}
								<div className="flex items-start justify-between border-b border-[#e5e5e5] px-6 py-5">
									<div className="flex items-center gap-4">
										<div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black text-[17px] font-bold text-white">
											{userInitials}
										</div>
										<div>
											<div className="text-lg font-bold text-[#0a0a0a]">
												{userName}
											</div>
											<div className="mt-0.5 text-xs text-[#6b7170]">
												My commission ledger · all cycles
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8a8f91]">
											To Be Paid
										</div>
										<div className="mt-1 font-mono text-[28px] font-bold leading-none tabular-nums tracking-tight">
											{formatPrice(pendingTotal, "MYR")}
										</div>
										<div className="mt-2">
											<StatusPill status="pending" />
										</div>
									</div>
								</div>

								{/* Mini KPI band */}
								<div className="grid grid-cols-3 divide-x divide-[#e5e5e5] border-b border-[#e5e5e5]">
									<div className="px-5 py-4">
										<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
											Pending
										</div>
										<div className="mt-1 font-mono text-lg font-semibold tabular-nums">
											{formatPrice(pendingTotal, "MYR")}
										</div>
									</div>
									<div className="px-5 py-4">
										<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
											Approved
										</div>
										<div className="mt-1 font-mono text-lg font-semibold tabular-nums">
											{formatPrice(approvedTotal, "MYR")}
										</div>
									</div>
									<div className="px-5 py-4">
										<div className="text-[10px] uppercase tracking-widest text-[#8a8f91]">
											Total Earned
										</div>
										<div className="mt-1 font-mono text-lg font-semibold tabular-nums">
											{formatPrice(totalEarned, "MYR")}
										</div>
									</div>
								</div>

								{/* Ledger table */}
								<div className="flex-1 overflow-auto">
									{filteredRows.length === 0 ? (
										<div className="flex min-h-48 items-center justify-center text-sm text-[#6b7170]">
											{rows.length === 0
												? "No commission splits found."
												: "No results match your search."}
										</div>
									) : (
										<table className="w-full">
											<thead>
												<tr>
													{(
														[
															"Date",
															"Source",
															"Service",
															"Branch",
															"Rate",
															"Commission",
															"Status",
														] as const
													).map((h, i) => (
														<th
															key={h}
															className={`border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] whitespace-nowrap text-[#8a8f91] ${
																i >= 4 ? "text-right" : ""
															}`}
														>
															{h}
														</th>
													))}
													<th className="border-b border-[#e5e5e5] px-[14px] py-[9px]" />
												</tr>
											</thead>
											<tbody>
												{filteredRows.map((row) => (
													<tr
														key={row.id}
														className="border-b border-[#f7f5ee] hover:bg-[#fcfaf6] last:border-0"
													>
														<td className="px-[14px] py-[11px] text-sm text-[#0a0a0a] align-middle">
															{formatDate(row.createdAt)}
														</td>
														<td className="px-[14px] py-[11px] align-middle">
															<SourceCell row={row} />
														</td>
														<td className="px-[14px] py-[11px] text-sm text-[#0a0a0a] align-middle">
															{row.serviceName ?? (
																<span className="text-[#6b7170]">—</span>
															)}
														</td>
														<td className="px-[14px] py-[11px] text-sm text-[#6b7170] align-middle">
															{row.branchName ?? "—"}
														</td>
														<td className="px-[14px] py-[11px] text-right text-sm text-[#6b7170] font-mono tabular-nums align-middle">
															{row.splitPercentage > 0
																? `${row.splitPercentage}%`
																: "—"}
														</td>
														<td className="px-[14px] py-[11px] text-right font-semibold font-mono tabular-nums text-sm text-[#0a0a0a] align-middle">
															{formatPrice(row.calculatedAmount, "MYR")}
														</td>
														<td className="px-[14px] py-[11px] align-middle">
															<StatusPill status={row.status} />
														</td>
														<td className="px-[14px] py-[11px] pr-4 text-right align-middle">
															{(row.status === "pending" ||
																row.status === "approved") && (
																<button
																	type="button"
																	className="inline-flex items-center rounded-md border border-[#fde68a] bg-white px-2.5 py-1 text-[12px] font-medium text-[#b45309] transition-colors hover:bg-[#fffbeb]"
																	onClick={() =>
																		setDisputeTarget({
																			id: row.id,
																			amountCents: row.calculatedAmount,
																		})
																	}
																>
																	Dispute
																</button>
															)}
														</td>
													</tr>
												))}
												{/* Total pending footer row */}
												{pendingRows.length > 0 && (
													<tr className="bg-[#f7f5ee]">
														<td
															colSpan={5}
															className="px-[14px] py-[11px] text-right text-sm font-semibold text-[#0a0a0a]"
														>
															Total Pending
														</td>
														<td className="px-[14px] py-[11px] text-right font-bold font-mono tabular-nums text-base text-[#0a0a0a]">
															{formatPrice(pendingTotal, "MYR")}
														</td>
														<td colSpan={2} />
													</tr>
												)}
											</tbody>
										</table>
									)}
								</div>

								{/* Footer actions */}
								<div className="flex items-center justify-between border-t border-[#e5e5e5] px-6 py-4">
									<div className="flex gap-2">
										<span className="text-xs text-[#6b7170]">
											{rows.length} split{rows.length !== 1 ? "s" : ""} total
										</span>
									</div>
									<div className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">
										{formatPrice(totalEarned, "MYR")} earned
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</Skeleton>
			<DisputeDialog
				open={disputeTarget != null}
				onOpenChange={(o) => {
					if (!o) setDisputeTarget(null);
				}}
				organizationId={organizationId}
				target={disputeTarget}
			/>
		</>
	);
}
