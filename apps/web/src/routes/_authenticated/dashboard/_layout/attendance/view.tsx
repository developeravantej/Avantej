import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Clock, UserCheck, XCircle, Lock } from "lucide-react";
import type { ElementType } from "react";
import { useState } from "react";
import type { CheckInRow } from "@/components/attendance/check-ins-log";
import { CheckInsLog } from "@/components/attendance/check-ins-log";
import { DropInForm } from "@/components/attendance/drop-in-form";
import type { TodaysBookingRow } from "@/components/attendance/today-bookings";
import { TodayBookingsSection } from "@/components/attendance/today-bookings";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StatusCallout } from "@/components/ui/status-callout";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/attendance/view",
)({
	component: AttendancePage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateString(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
	icon: ElementType;
	label: string;
	value: number;
	valueClass?: string;
}

function KpiTile({
	icon: Icon,
	label,
	value,
	valueClass = "text-[#0a0a0a]",
}: KpiTileProps) {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
			<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
				{label}
			</p>
			<div className="mt-2 flex items-center gap-2">
				<Icon className="h-4 w-4 text-[#737373]" />
				<p
					className={`text-2xl font-bold font-mono tabular-nums ${valueClass}`}
				>
					{value}
				</p>
			</div>
		</div>
	);
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function KpiSkeleton() {
	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
			<div className="h-3 w-24 rounded bg-[#e5e5e5] animate-pulse" />
			<div className="h-7 w-16 rounded bg-[#e5e5e5] animate-pulse mt-2" />
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AttendancePage() {
	const { data: userContext, hasPermission } = useUserContext();

	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("attendance_management:read");
	const canDelete = hasPermission("attendance_management:delete");

	// ── Derive accessible branches ─────────────────────────────────────────

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

	// ── Filters ────────────────────────────────────────────────────────────

	const [branchId, setBranchId] = useState<string>(branchOptions[0]?.id ?? "");
	const [date, setDate] = useState<string>(toLocalDateString(new Date()));

	// ── Query keys ─────────────────────────────────────────────────────────

	const bookingsQueryKey = [
		"attendance",
		"bookings",
		organizationId,
		branchId,
		date,
	];

	const checkInsQueryKey = [
		"attendance",
		"checkIns",
		organizationId,
		branchId,
		date,
	];

	// ── Today's Bookings query ─────────────────────────────────────────────

	const {
		data: bookingsData,
		isLoading: bookingsLoading,
		error: bookingsError,
		refetch: refetchBookings,
	} = useQuery({
		queryKey: bookingsQueryKey,
		queryFn: async () => {
			if (!organizationId || !branchId) return [];
			return client.checkIns.listTodaysBookings({
				organizationId,
				branchId,
				date,
			}) as Promise<TodaysBookingRow[]>;
		},
		enabled: !!organizationId && !!branchId && canRead,
	});

	const bookings: TodaysBookingRow[] = bookingsData ?? [];

	// ── Today's Check-ins log query ────────────────────────────────────────

	const {
		data: checkInsData,
		isLoading: checkInsLoading,
		error: checkInsError,
		refetch: refetchCheckIns,
	} = useQuery({
		queryKey: checkInsQueryKey,
		queryFn: async () => {
			if (!organizationId || !branchId) return { rows: [], total: 0 };
			return client.checkIns.list({
				organizationId,
				branchId,
				from: `${date}T00:00:00`,
				to: `${date}T23:59:59`,
			}) as unknown as Promise<{ rows: CheckInRow[]; total: number }>;
		},
		enabled: !!organizationId && !!branchId && canRead,
	});

	const checkInRows: CheckInRow[] = checkInsData?.rows ?? [];

	// ── KPI derivations ────────────────────────────────────────────────────

	const kpiTotal = checkInRows.length;
	const kpiAttended = checkInRows.filter((r) => r.outcome === "attended").length;
	const kpiDropIns = checkInRows.filter((r) => r.source === "drop_in").length;
	const kpiNoShows = checkInRows.filter((r) => r.outcome === "no_show").length;

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col items-center justify-center">
				<Lock className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					No organization selected
				</p>
				<p className="text-xs mt-1 text-[#737373]">
					Select an organization to view attendance.
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
					Ask an admin to grant attendance management access.
				</p>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* ── Page header ── */}
			<div className="mb-5 flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						STAFF ATTENDANCE
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Attendance
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						Today&apos;s check-ins and drop-ins
					</p>
				</div>
			</div>

			{/* ── Filters band ── */}
			<div className="mb-5 rounded-2xl border border-[#e5e5e5] bg-white p-4">
				<div className="flex flex-wrap items-end gap-4">
					{branchOptions.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Branch
							</Label>
							<Select
								value={branchId || ""}
								onValueChange={(v) => setBranchId(v)}
							>
								<SelectTrigger className="h-9 w-56">
									<SelectValue placeholder="Select branch…" />
								</SelectTrigger>
								<SelectContent>
									{branchOptions.map((node) => (
										<SelectItem key={node.id} value={node.id}>
											{node.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="flex flex-col gap-1.5">
						<Label className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Date
						</Label>
						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							className="h-9 rounded-xl border border-[#e5e5e5] bg-white px-3 py-1 text-sm text-[#0a0a0a] outline-none focus:border-[#0a0a0a] font-mono tabular-nums"
						/>
					</div>
				</div>
			</div>

			{/* ── KPI tiles ── */}
			{!branchId ? (
				<div className="rounded-2xl border border-[#e5e5e5] bg-white p-10 flex flex-col items-center justify-center text-center">
					<ClipboardCheck className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
					<p className="text-sm font-medium text-[#0a0a0a]">
						No branch selected
					</p>
					<p className="text-xs mt-1 text-[#737373]">
						Select a branch to load attendance data.
					</p>
				</div>
			) : (
				<>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
						{checkInsLoading ? (
							<>
								<KpiSkeleton />
								<KpiSkeleton />
								<KpiSkeleton />
								<KpiSkeleton />
							</>
						) : checkInsError ? null : (
							<>
								<KpiTile
									icon={ClipboardCheck}
									label="TOTAL CHECK-INS"
									value={kpiTotal}
								/>
								<KpiTile
									icon={UserCheck}
									label="ATTENDED"
									value={kpiAttended}
									valueClass="text-emerald-700"
								/>
								<KpiTile
									icon={Clock}
									label="DROP-INS"
									value={kpiDropIns}
									valueClass="text-blue-700"
								/>
								<KpiTile
									icon={XCircle}
									label="NO-SHOWS"
									value={kpiNoShows}
									valueClass="text-rose-600"
								/>
							</>
						)}
					</div>

					{/* ── Two-column content ── */}
					<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
						{/* Left: Today's Bookings */}
						<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
							<div className="px-5 py-4 border-b border-[#e5e5e5]">
								<h2 className="text-lg font-bold text-[#0a0a0a]">
									Today&apos;s Bookings
								</h2>
							</div>
							<div className="p-5">
								{bookingsLoading ? (
									<div className="flex flex-col gap-3">
										{[1, 2, 3].map((i) => (
											<div
												key={i}
												className="h-12 w-full rounded-xl bg-[#e5e5e5] animate-pulse"
											/>
										))}
									</div>
								) : bookingsError ? (
									<StatusCallout
										variant="error"
										onRetry={() => refetchBookings()}
									>
										Failed to load bookings. Please try again.
									</StatusCallout>
								) : bookings.length === 0 ? (
									<div className="flex flex-col items-center justify-center py-10 text-[#737373]">
										<ClipboardCheck className="h-8 w-8 mb-3 opacity-30" />
										<p className="text-sm font-medium text-[#0a0a0a]">
											No bookings today
										</p>
										<p className="text-xs mt-1">
											No appointments are scheduled for this date.
										</p>
									</div>
								) : (
									<TodayBookingsSection
										bookings={bookings}
										organizationId={organizationId}
										branchId={branchId}
									/>
								)}
							</div>
						</div>

						{/* Right: Drop-in form */}
						<div>
							<DropInForm
								organizationId={organizationId}
								branchId={branchId}
								queryKey={checkInsQueryKey}
							/>
						</div>
					</div>

					{/* ── Check-ins log ── */}
					<div className="mt-5 rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
						<div className="px-5 py-4 border-b border-[#e5e5e5] flex items-center gap-2">
							<h2 className="text-lg font-bold text-[#0a0a0a]">
								Today&apos;s Check-ins
							</h2>
							{!checkInsLoading && checkInsData?.total != null && checkInsData.total > 0 && (
								<span className="font-mono tabular-nums rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[11px] font-semibold text-[#737373]">
									{checkInsData.total}
								</span>
							)}
						</div>

						{checkInsLoading ? (
							<div className="p-5 flex flex-col gap-3">
								{[1, 2, 3, 4].map((i) => (
									<div
										key={i}
										className="h-12 w-full rounded-xl bg-[#e5e5e5] animate-pulse"
									/>
								))}
							</div>
						) : checkInsError ? (
							<div className="p-5">
								<StatusCallout
									variant="error"
									onRetry={() => refetchCheckIns()}
								>
									Failed to load check-ins. Please try again.
								</StatusCallout>
							</div>
						) : checkInRows.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
								<ClipboardCheck className="h-8 w-8 mb-3 opacity-30" />
								<p className="text-sm font-medium text-[#0a0a0a]">
									No check-ins yet today
								</p>
								<p className="text-xs mt-1">
									Walk-ins and bookings will appear here as members arrive.
								</p>
							</div>
						) : (
							<CheckInsLog
								rows={checkInRows}
								organizationId={organizationId}
								queryKey={checkInsQueryKey}
								canDelete={canDelete}
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
}
