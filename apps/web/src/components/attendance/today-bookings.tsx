import { UserX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TodaysBookingRow = {
	appointmentClientId: string;
	appointmentId: string;
	startTime: Date | string;
	endTime: Date | string;
	serviceName: string;
	classSlotId: string | null;
	clientType: "member" | "walk_in";
	clientId: string;
	clientName: string;
	attendanceStatus: "pending" | "checked_in" | "no_show";
	checkInId: string | null;
	// New fields from Phase 2 backend
	capacity: number | null;
	creditsRemaining: number | null;
	activePackageInstanceId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(date: Date | string): string {
	const d = date instanceof Date ? date : new Date(date);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleTimeString("en-MY", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: true,
	});
}

function groupByTimeBucket(
	bookings: TodaysBookingRow[],
): Map<string, TodaysBookingRow[]> {
	const buckets = new Map<string, TodaysBookingRow[]>();
	for (const booking of bookings) {
		const time = formatTime(booking.startTime);
		const key = `${time} — ${booking.serviceName}`;
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key)!.push(booking);
	}
	return buckets;
}

// ─── Pure display component ───────────────────────────────────────────────────

export function TodayBookings({
	bookings,
	onCheckIn,
	onNoShow,
	isCheckingIn,
	onBulkCheckIn,
	isBulkInFlight,
}: {
	bookings: TodaysBookingRow[];
	onCheckIn: (appointmentClientId: string) => void;
	onNoShow: (appointmentClientId: string) => void;
	isCheckingIn: Record<string, boolean>;
	onBulkCheckIn: (bucketLabel: string) => void;
	isBulkInFlight: boolean;
}) {
	const grouped = groupByTimeBucket(bookings);

	if (bookings.length === 0) {
		return (
			<EmptyState
				icon={UserX}
				title="No bookings today"
				description="No bookings for today at this branch."
			/>
		);
	}

	return (
		<div className="space-y-4">
			{Array.from(grouped.entries()).map(([bucketLabel, rows]) => {
				const capacity = rows[0]?.capacity ?? null;
				const checkedInCount = rows.filter(
					(r) => r.attendanceStatus === "checked_in",
				).length;
				const remainingCount = rows.filter(
					(r) => r.attendanceStatus === "pending",
				).length;

				return (
					<div key={bucketLabel} className="rounded-lg border bg-card shadow-sm">
						{/* Time bucket header */}
						<div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
							<div>
								<p className="font-medium text-sm">{bucketLabel}</p>
								<p className="text-muted-foreground text-xs">
									{checkedInCount} of {capacity ?? rows.length} checked in
								</p>
							</div>
							{remainingCount > 0 && (
								<Button
									size="sm"
									variant="outline"
									className="h-8"
									disabled={isBulkInFlight}
									onClick={() => onBulkCheckIn(bucketLabel)}
								>
									Check in all remaining ({remainingCount})
								</Button>
							)}
						</div>

						{/* Booking rows */}
						<div className="divide-y">
							{rows.map((booking) => {
								const inFlight =
									isCheckingIn[booking.appointmentClientId] ?? false;
								return (
									<div
										key={booking.appointmentClientId}
										className="flex items-center gap-3 px-4 py-3"
									>
										{/* Name + credits */}
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">
												{booking.clientName || "Unknown client"}
											</p>
											<p className="text-muted-foreground text-xs capitalize">
												{booking.clientType === "walk_in" ? "Walk-in" : "Member"}
											</p>
											{booking.clientType === "member" &&
												booking.creditsRemaining != null && (
													<p className="text-muted-foreground text-xs">
														· {booking.creditsRemaining} credits remaining
													</p>
												)}
										</div>

										{/* Status */}
										{booking.attendanceStatus === "no_show" ? (
											<StatusBadge status="no-show" label="No-Show" />
										) : (
											<StatusBadge status={booking.attendanceStatus} />
										)}

										{/* Action buttons — only visible when pending */}
										{booking.attendanceStatus === "pending" && (
											<div className="flex gap-2">
												<Button
													size="sm"
													variant="outline"
													className="h-8 border-green-300 text-green-700 hover:bg-green-50 hover:text-green-800"
													disabled={inFlight}
													onClick={() => onCheckIn(booking.appointmentClientId)}
												>
													Check In
												</Button>
												<Button
													size="sm"
													variant="outline"
													className="h-8 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
													disabled={inFlight}
													onClick={() => onNoShow(booking.appointmentClientId)}
												>
													No-Show
												</Button>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ─── Section wrapper — handles mutations and in-flight state ──────────────────

export function TodayBookingsSection({
	bookings,
	organizationId,
	branchId,
}: {
	bookings: TodaysBookingRow[];
	organizationId: string;
	branchId: string;
}) {
	const [isCheckingIn, setIsCheckingIn] = useState<Record<string, boolean>>({});
	// Bulk check-in: holds the bucket label of the pending confirmation dialog, or null
	const [bulkDialogForBucket, setBulkDialogForBucket] = useState<string | null>(
		null,
	);

	function markInFlight(id: string, v: boolean) {
		setIsCheckingIn((prev) => ({ ...prev, [id]: v }));
	}

	const checkInMutation = useApiMutation({
		mutationFn: async (vars: {
			appointmentClientId: string;
			clientType: "member" | "walk_in";
			clientId: string;
			outcome: "attended" | "no_show";
		}) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.recordCheckIn({
				organizationId,
				clientType: vars.clientType,
				clientId: vars.clientId,
				branchId,
				appointmentClientId: vars.appointmentClientId,
				source: "booking",
				outcome: vars.outcome,
			});
		},
		successMessage: (_, vars) =>
			vars.outcome === "attended" ? "Checked in" : "Marked no-show",
		errorMessage: false,
		invalidate: [["attendance"]],
		onSuccess: (_, vars) => {
			markInFlight(vars.appointmentClientId, false);
		},
		onError: (err, vars) => {
			markInFlight(vars.appointmentClientId, false);
			const msg = err.message || "Unknown error";
			// Detect duplicate check-in error from backend
			if (
				msg.toLowerCase().includes("already_checked_in") ||
				msg.toLowerCase().includes("already checked in")
			) {
				const mins = msg.match(/\d+/)?.[0];
				toast.warning(
					mins
						? `Already checked in ${mins} minutes ago`
						: "Already checked in recently",
				);
			} else {
				toast.error(`Failed: ${msg}`);
			}
		},
	});

	const bulkCheckInMutation = useApiMutation({
		mutationFn: async (vars: { bookingIds: string[] }) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return (client as any).checkIns.recordBulkCheckIn({
				organizationId,
				branchId,
				bookingIds: vars.bookingIds,
			});
		},
		successMessage: (result: any) => {
			const { totalChecked, totalSkipped, totalError } = result;
			let message = `Checked in ${totalChecked}`;
			if (totalSkipped > 0) message += ` · ${totalSkipped} already checked in`;
			if (totalError > 0) message += ` · ${totalError} failed`;
			return message;
		},
		errorMessage: (err) => `Bulk check-in failed: ${err.message || "Unknown error"}`,
		invalidate: [["attendance"]],
		onSuccess: () => {
			setBulkDialogForBucket(null);
		},
	});

	function handleCheckIn(appointmentClientId: string) {
		const booking = bookings.find(
			(b) => b.appointmentClientId === appointmentClientId,
		);
		if (!booking) return;
		markInFlight(appointmentClientId, true);
		checkInMutation.mutate({
			appointmentClientId,
			clientType: booking.clientType,
			clientId: booking.clientId,
			outcome: "attended",
		});
	}

	function handleNoShow(appointmentClientId: string) {
		const booking = bookings.find(
			(b) => b.appointmentClientId === appointmentClientId,
		);
		if (!booking) return;
		markInFlight(appointmentClientId, true);
		checkInMutation.mutate({
			appointmentClientId,
			clientType: booking.clientType,
			clientId: booking.clientId,
			outcome: "no_show",
		});
	}

	function handleConfirmBulkCheckIn() {
		if (!bulkDialogForBucket) return;
		const grouped = groupByTimeBucket(bookings);
		const bucketRows = grouped.get(bulkDialogForBucket) ?? [];
		const bookingIds = bucketRows
			.filter((r) => r.attendanceStatus === "pending")
			.map((r) => r.appointmentClientId);
		if (bookingIds.length === 0) {
			setBulkDialogForBucket(null);
			return;
		}
		bulkCheckInMutation.mutate({ bookingIds });
	}

	// Derive dialog display data
	const dialogBucketRows = bulkDialogForBucket
		? (groupByTimeBucket(bookings).get(bulkDialogForBucket) ?? [])
		: [];
	const dialogRemainingCount = dialogBucketRows.filter(
		(r) => r.attendanceStatus === "pending",
	).length;

	return (
		<>
			<TodayBookings
				bookings={bookings}
				onCheckIn={handleCheckIn}
				onNoShow={handleNoShow}
				isCheckingIn={isCheckingIn}
				onBulkCheckIn={setBulkDialogForBucket}
				isBulkInFlight={bulkCheckInMutation.isPending}
			/>

			{/* Bulk check-in confirmation dialog */}
			<Dialog
				open={!!bulkDialogForBucket}
				onOpenChange={(open) => {
					if (!open) setBulkDialogForBucket(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Check in all remaining?</DialogTitle>
						<DialogDescription>
							This will check in {dialogRemainingCount} attendee
							{dialogRemainingCount !== 1 ? "s" : ""} in{" "}
							<span className="font-medium">{bulkDialogForBucket}</span>.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setBulkDialogForBucket(null)}
							disabled={bulkCheckInMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleConfirmBulkCheckIn}
							disabled={bulkCheckInMutation.isPending}
						>
							{bulkCheckInMutation.isPending
								? "Checking in..."
								: `Check in ${dialogRemainingCount}`}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
