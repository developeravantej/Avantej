import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Clock, UserCheck, XCircle } from "lucide-react";
import type { ElementType } from "react";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { CheckInRow } from "@/components/attendance/check-ins-log";
import { CheckInsLog } from "@/components/attendance/check-ins-log";
import { DropInForm } from "@/components/attendance/drop-in-form";
import type { TodaysBookingRow } from "@/components/attendance/today-bookings";
import { TodayBookingsSection } from "@/components/attendance/today-bookings";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageCard } from "@/components/ui/page-card";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/attendance/view",
)({
	component: AttendancePage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD local date string (no date-fns). */
function toLocalDateString(d: Date): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
	icon: ElementType;
	label: string;
	value: number;
	iconClass?: string;
}

function KpiCard({ icon: Icon, label, value, iconClass = "text-primary" }: KpiCardProps) {
	return (
		<div className="rounded-xl border bg-card p-3 shadow-sm flex items-center gap-3">
			<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
				<Icon className={`size-4 ${iconClass}`} />
			</div>
			<div>
				<p className="text-xl font-bold leading-none">{value}</p>
				<p className="mt-1 text-xs text-muted-foreground">{label}</p>
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function AttendancePage() {
	const { data: userContext, hasPermission } = useUserContext();

	const organizationId = userContext?.currentOrganizationId ?? null;

	// RBAC — checked in component (route-guard is a stub)
	const canRead = hasPermission("attendance_management:read");
	const canDelete = hasPermission("attendance_management:delete");

	// ── Derive accessible branches ─────────────────────────────────────────

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const accessibleNodeIds =
		currentOrg?.hierarchy?.member?.accessibleNodeIds ?? [];
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];

	// Prefer branch-type nodes; fall back to all accessible nodes
	const accessibleBranches = allNodes.filter(
		(n) => accessibleNodeIds.includes(n.id) && n.type === "branch",
	);
	const branchOptions =
		accessibleBranches.length > 0
			? accessibleBranches
			: allNodes.filter((n) => accessibleNodeIds.includes(n.id));

	// ── Filters ────────────────────────────────────────────────────────────

	const [branchId, setBranchId] = useState<string>(branchOptions[0]?.id ?? "");
	const [date, setDate] = useState<string>(() => toLocalDateString(new Date()));

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

	// ── KPI derivations (client-side from check-in rows) ──────────────────

	const kpiTotal = checkInRows.length;
	const kpiAttended = checkInRows.filter((r) => r.outcome === "attended").length;
	const kpiDropIns = checkInRows.filter((r) => r.source === "drop_in").length;
	const kpiNoShows = checkInRows.filter((r) => r.outcome === "no_show").length;

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
				<div className="flex shrink-0 items-center gap-3 px-6 pt-6 pb-4">
					<div className="p-2 rounded-lg bg-primary/10">
						<ClipboardCheck className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Attendance</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">Today's check-ins and drop-ins</p>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center text-muted-foreground">
					<p className="text-sm">Select an organization to view attendance.</p>
				</div>
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
				<div className="flex shrink-0 items-center gap-3 px-6 pt-6 pb-4">
					<div className="p-2 rounded-lg bg-primary/10">
						<ClipboardCheck className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Attendance</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">Today's check-ins and drop-ins</p>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center">
					<div className="space-y-2 text-center">
						<p className="font-medium">Permission Denied</p>
						<p className="text-sm text-muted-foreground">
							You don&apos;t have permission to view attendance.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<ClipboardCheck className="size-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Attendance</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Today's check-ins and drop-ins
						</p>
					</div>
				</div>
			</div>

			{/* Filters band */}
			<div className="shrink-0 border-b border-border/40 px-6 py-3">
				<div className="flex flex-wrap items-end gap-3">
					{/* Branch selector */}
					{branchOptions.length > 0 && (
						<div className="flex flex-col gap-1">
							<Label className="text-xs">Branch</Label>
							<Select
								value={branchId || ""}
								onValueChange={(v) => setBranchId(v)}
							>
								<SelectTrigger className="h-9 w-56">
									<SelectValue placeholder="Select branch..." />
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

					{/* Date picker */}
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Date</Label>
						<input
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
						/>
					</div>
				</div>
			</div>

			{/* Scroll region */}
			<div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
				{/* No branch selected */}
				{!branchId && (
					<div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
						<p className="text-sm">Select a branch to load attendance data.</p>
					</div>
				)}

				{branchId && (
					<>
						{/* KPI row — shown once check-in data resolves */}
						{!checkInsLoading && !checkInsError && (
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								<KpiCard icon={ClipboardCheck} label="Total check-ins" value={kpiTotal} />
								<KpiCard icon={UserCheck} label="Attended" value={kpiAttended} iconClass="text-green-600" />
								<KpiCard icon={Clock} label="Drop-ins" value={kpiDropIns} iconClass="text-blue-600" />
								<KpiCard icon={XCircle} label="No-shows" value={kpiNoShows} iconClass="text-destructive" />
							</div>
						)}

						<Separator />

						{/* Two-column layout */}
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
							{/* Left column: Today's Bookings */}
							<section className="space-y-3">
								<h2 className="font-semibold text-lg">Today&apos;s Bookings</h2>

								{bookingsLoading && (
									<div className="flex min-h-32 items-center justify-center">
										<LoadingSpinner size="md" />
									</div>
								)}

								{bookingsError && (
									<StatusCallout variant="error" onRetry={() => refetchBookings()}>
										Failed to load bookings. Please try again.
									</StatusCallout>
								)}

								{!bookingsLoading && !bookingsError && (
									<TodayBookingsSection
										bookings={bookings}
										organizationId={organizationId}
										branchId={branchId}
									/>
								)}
							</section>

							{/* Right column: Drop-in Check-in form */}
							<section>
								<DropInForm
									organizationId={organizationId}
									branchId={branchId}
									queryKey={checkInsQueryKey}
								/>
							</section>
						</div>

						<Separator />

						{/* Bottom: Today's Check-ins log */}
						<section className="space-y-3">
							<h2 className="font-semibold text-lg">
								Today&apos;s Check-ins
								{checkInsData?.total != null && checkInsData.total > 0 && (
									<span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-normal text-muted-foreground text-sm">
										{checkInsData.total}
									</span>
								)}
							</h2>

							{checkInsLoading && (
								<div className="flex min-h-24 items-center justify-center">
									<LoadingSpinner size="md" />
								</div>
							)}

							{checkInsError && (
								<StatusCallout variant="error" onRetry={() => refetchCheckIns()}>
									Failed to load check-ins. Please try again.
								</StatusCallout>
							)}

							{!checkInsLoading && !checkInsError && checkInRows.length === 0 && (
								<EmptyState
									icon={ClipboardCheck}
									title="No check-ins yet today"
									description="Walk-ins and bookings will appear here as members arrive."
								/>
							)}

							{!checkInsLoading && !checkInsError && checkInRows.length > 0 && (
								<PageCard padding="none">
									<CheckInsLog
										rows={checkInRows}
										organizationId={organizationId}
										queryKey={checkInsQueryKey}
										canDelete={canDelete}
									/>
								</PageCard>
							)}
						</section>
					</>
				)}
			</div>
		</div>
	);
}
