import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	DateTimeSlotPicker,
	assembleIso,
} from "@/components/appointments/DateTimeSlotPicker";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import type { CalendarAppointment } from "@/lib/appointment-mapper";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/**
 * Move an existing, not-yet-happened appointment to a new time. Credit-neutral
 * (the backend reschedule never re-debits or reinstates). Pre-fills with the
 * appointment's current start.
 */
export function RescheduleDialog({
	appt,
	organizationId,
	onClose,
	onRescheduled,
}: {
	appt: CalendarAppointment | null;
	organizationId: string;
	onClose: () => void;
	onRescheduled?: () => void;
}) {
	const [date, setDate] = useState("");
	const [time, setTime] = useState("");
	const [reason, setReason] = useState("");

	const start = appt ? new Date(appt.start) : null;
	const durationMin =
		appt && start
			? Math.max(
					1,
					Math.round((new Date(appt.end).getTime() - start.getTime()) / 60000),
				)
			: 60;

	// Seed the pickers from the appointment's current start whenever it changes.
	useEffect(() => {
		if (!start) return;
		setDate(
			`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
		);
		setTime(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
		setReason("");
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [appt?.id]);

	const mutation = useApiMutation({
		mutationFn: () =>
			client.appointments.reschedule({
				organizationId,
				appointmentId: appt!.id,
				newStartTime: assembleIso(date, time),
				newDuration: durationMin,
				reason: reason.trim() || undefined,
			}),
		successMessage: "Session moved.",
		errorMessage: (err) => err.message || "Failed to reschedule",
		invalidate: [orpc.appointments.list.key()],
		onSuccess: () => {
			onRescheduled?.();
			onClose();
		},
	});

	return (
		<Dialog open={appt !== null} onOpenChange={(o) => !o && onClose()}>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						APPOINTMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Reschedule session
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Move this session to a new time. The package credit is unaffected.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-1">
						<DateTimeSlotPicker
							date={date}
							time={time}
							onDateChange={setDate}
							onTimeChange={setTime}
							disabled={mutation.isPending}
							dateLabel="New date"
							timeLabel="New time"
						/>
						<label className="block">
							<span className="mb-1 block text-[11px] font-medium text-[#737373]">
								Reason (optional)
							</span>
							<Textarea
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="e.g. trainer unavailable"
								rows={2}
								disabled={mutation.isPending}
							/>
						</label>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending || !date || !time}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{mutation.isPending && (
							<Loader2 className="mr-1.5 size-4 animate-spin" />
						)}
						Move session
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
