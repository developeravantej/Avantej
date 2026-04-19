import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, UserX, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({
	status,
}: {
	status: TodaysBookingRow["attendanceStatus"];
}) {
	if (status === "checked_in") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 text-xs">
				<CheckCircle2 className="h-3 w-3" />
				Checked In
			</span>
		);
	}
	if (status === "no_show") {
		return (
			<span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
				<XCircle className="h-3 w-3" />
				No-Show
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 text-xs">
			<Clock className="h-3 w-3" />
			Pending
		</span>
	);
}

// ─── Pure display component ───────────────────────────────────────────────────

export function TodayBookings({
	bookings,
	onCheckIn,
	onNoShow,
	isCheckingIn,
}: {
	bookings: TodaysBookingRow[];
	onCheckIn: (appointmentClientId: string) => void;
	onNoShow: (appointmentClientId: string) => void;
	isCheckingIn: Record<string, boolean>;
}) {
	const grouped = groupByTimeBucket(bookings);

	if (bookings.length === 0) {
		return (
			<div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
				<UserX className="h-8 w-8 text-muted-foreground/50" />
				<p className="text-muted-foreground text-sm">
					No bookings for today at this branch.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{Array.from(grouped.entries()).map(([bucketLabel, rows]) => (
				<div key={bucketLabel} className="rounded-lg border bg-card shadow-sm">
					{/* Time bucket header */}
					<div className="border-b bg-muted/40 px-4 py-2">
						<p className="font-medium text-sm">{bucketLabel}</p>
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
									{/* Name */}
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">
											{booking.clientName || "Unknown client"}
										</p>
										<p className="text-muted-foreground text-xs capitalize">
											{booking.clientType === "walk_in" ? "Walk-in" : "Member"}
										</p>
									</div>

									{/* Status */}
									<StatusBadge status={booking.attendanceStatus} />

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
			))}
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
	const queryClient = useQueryClient();
	const [isCheckingIn, setIsCheckingIn] = useState<Record<string, boolean>>({});

	function markInFlight(id: string, v: boolean) {
		setIsCheckingIn((prev) => ({ ...prev, [id]: v }));
	}

	const checkInMutation = useMutation({
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
		onSuccess: (_, vars) => {
			markInFlight(vars.appointmentClientId, false);
			const label =
				vars.outcome === "attended" ? "Checked in" : "Marked no-show";
			toast.success(label);
			// Invalidate both bookings + check-ins log — both share the "attendance" prefix
			queryClient.invalidateQueries({ queryKey: ["attendance"] });
		},
		onError: (err: unknown, vars) => {
			markInFlight(vars.appointmentClientId, false);
			const msg = err instanceof Error ? err.message : "Unknown error";
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

	return (
		<TodayBookings
			bookings={bookings}
			onCheckIn={handleCheckIn}
			onNoShow={handleNoShow}
			isCheckingIn={isCheckingIn}
		/>
	);
}
