import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
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
	} = useQuery({
		queryKey: bookingsQueryKey,
		queryFn: async () => {
			if (!organizationId || !branchId) return [];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.listTodaysBookings({
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
	} = useQuery({
		queryKey: checkInsQueryKey,
		queryFn: async () => {
			if (!organizationId || !branchId) return { rows: [], total: 0 };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.list({
				organizationId,
				branchId,
				from: `${date}T00:00:00`,
				to: `${date}T23:59:59`,
			}) as Promise<{ rows: CheckInRow[]; total: number }>;
		},
		enabled: !!organizationId && !!branchId && canRead,
	});

	const checkInRows: CheckInRow[] = checkInsData?.rows ?? [];

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view attendance.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don&apos;t have permission to view attendance.
					</p>
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
					<ClipboardCheck className="h-6 w-6 text-primary" />
				</div>
				<div>
					<h1 className="font-bold font-heading text-2xl">Attendance</h1>
					<p className="text-muted-foreground text-sm">
						Check in members and walk-ins for today&apos;s sessions.
					</p>
				</div>
			</div>

			{/* Top-bar filters */}
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

			<Separator />

			{/* No branch selected warning */}
			{!branchId && (
				<div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
					<p className="text-sm">Select a branch to load attendance data.</p>
				</div>
			)}

			{branchId && (
				<>
					{/* Two-column layout */}
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
						{/* Left column: Today's Bookings */}
						<section className="space-y-3">
							<h2 className="font-semibold text-lg">Today&apos;s Bookings</h2>

							{bookingsLoading && (
								<div className="flex min-h-32 items-center justify-center">
									<div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-r-transparent" />
								</div>
							)}

							{bookingsError && (
								<div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
									Failed to load bookings. Please try again.
								</div>
							)}

							{!bookingsLoading && !bookingsError && (
								<TodayBookingsSection
									bookings={bookings}
									organizationId={organizationId}
									branchId={branchId}
								/>
							)}
						</section>

						{/* Right column: Drop-in Check-in */}
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
								<div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-r-transparent" />
							</div>
						)}

						{checkInsError && (
							<div className="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
								Failed to load check-ins. Please try again.
							</div>
						)}

						{!checkInsLoading && !checkInsError && (
							<CheckInsLog
								rows={checkInRows}
								organizationId={organizationId}
								queryKey={checkInsQueryKey}
								canDelete={canDelete}
							/>
						)}
					</section>
				</>
			)}
		</div>
	);
}
