import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Loader2, AlertTriangle } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
	SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
	DateTimeSlotPicker,
	assembleIso,
} from "@/components/appointments/DateTimeSlotPicker";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { cn } from "@/lib/utils";

type EditableSlot = {
	date: string;
	time: string;
	duration: number;
	sourcePriority: number | null;
	status: "ok" | "conflict" | "outside_availability" | "after_expiry";
	conflictReason?: string;
	edited: boolean;
};

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

const STATUS_META: Record<
	EditableSlot["status"],
	{ label: string; cls: string }
> = {
	ok: { label: "OK", cls: "bg-emerald-100 text-emerald-700" },
	conflict: { label: "Conflict", cls: "bg-rose-100 text-rose-700" },
	outside_availability: {
		label: "Outside hours",
		cls: "bg-amber-100 text-amber-700",
	},
	after_expiry: { label: "After expiry", cls: "bg-rose-100 text-rose-700" },
};

export function ScheduleSessionsPanel({
	open,
	onClose,
	organizationId,
	packageInstanceId,
	mode = "full",
	onScheduled,
}: {
	open: boolean;
	onClose: () => void;
	organizationId: string;
	packageInstanceId: string | null;
	/** "full" = one slot per remaining credit; "single" = book one replacement session. */
	mode?: "full" | "single";
	onScheduled?: () => void;
}) {
	const [slots, setSlots] = useState<EditableSlot[] | null>(null);

	const proposalQuery = useQuery({
		...orpc.appointments.proposeSchedule.queryOptions({
			input: { organizationId, packageInstanceId: packageInstanceId ?? "" },
		}),
		enabled: open && !!packageInstanceId,
	});

	// Seed editable slots from the server proposal (once per open/proposal).
	const proposal = proposalQuery.data;
	const seededSlots = useMemo<EditableSlot[]>(() => {
		if (!proposal) return [];
		const target =
			mode === "single"
				? Math.min(1, proposal.creditsRemaining)
				: proposal.creditsRemaining;
		const fromProposed: EditableSlot[] = proposal.proposed
			.slice(0, target)
			.map((p) => ({
				date: p.date,
				time: p.time,
				duration: p.duration,
				sourcePriority: p.sourcePriority,
				status: p.status,
				conflictReason: p.conflictReason,
				edited: false,
			}));
		// Pad to the remaining-credit count with default rows so the actor can
		// always fill sessions manually — e.g. when the trainer has no availability
		// configured or the member gave no preferred times (plan risk R1).
		const now = new Date();
		const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
			now.getDate(),
		)}`;
		const padded: EditableSlot[] = [];
		for (let i = fromProposed.length; i < target; i++) {
			padded.push({
				date: todayStr,
				time: "09:00",
				duration: proposal.duration,
				sourcePriority: null,
				status: "ok",
				edited: true,
			});
		}
		return [...fromProposed, ...padded];
	}, [proposal, mode]);

	const effectiveSlots = slots ?? seededSlots;

	const createMutation = useApiMutation({
		mutationFn: (payload: {
			slots: { startTime: string; duration: number }[];
		}) =>
			client.appointments.bulkCreateFromSchedule({
				organizationId,
				packageInstanceId: packageInstanceId ?? "",
				slots: payload.slots,
			}),
		successMessage: (res) =>
			res.failedCount > 0
				? `${res.createdCount} session(s) scheduled, ${res.failedCount} failed.`
				: `${res.createdCount} session(s) scheduled.`,
		errorMessage: (err) => err.message || "Failed to schedule sessions",
		invalidate: [orpc.appointments.list.key(), orpc.packageInstances.key()],
		onSuccess: () => {
			setSlots(null);
			onScheduled?.();
			onClose();
		},
	});

	function updateSlot(index: number, patch: Partial<EditableSlot>) {
		setSlots(
			effectiveSlots.map((s, i) =>
				i === index ? { ...s, ...patch, edited: true } : s,
			),
		);
	}

	function handleClose() {
		setSlots(null);
		onClose();
	}

	function handleCreate() {
		const payload = effectiveSlots.map((s) => ({
			startTime: assembleIso(s.date, s.time),
			duration: s.duration,
		}));
		createMutation.mutate({ slots: payload });
	}

	const title =
		mode === "single" ? "Book replacement session" : "Schedule sessions";
	const count = effectiveSlots.length;

	return (
		<Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
			<SheetContent
				side="right"
				className="flex w-full flex-col gap-0 sm:max-w-lg"
			>
				<SheetHeader className="border-b">
					<SheetTitle className="flex items-center gap-2">
						<CalendarClock className="size-4" />
						{title}
					</SheetTitle>
					<SheetDescription>
						{mode === "single"
							? "Pick a date and time for the replacement session. One credit will be used."
							: "Review the proposed sessions — one per remaining credit — and adjust any before creating them."}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-4 py-4">
					{proposalQuery.isLoading ? (
						<div className="flex items-center justify-center py-16 text-muted-foreground">
							<Loader2 className="mr-2 size-4 animate-spin" /> Loading proposal…
						</div>
					) : proposalQuery.isError ? (
						<div className="flex items-center gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-900">
							<AlertTriangle className="size-4 shrink-0" />
							{proposalQuery.error instanceof Error
								? proposalQuery.error.message
								: "Failed to load proposal."}
						</div>
					) : count === 0 ? (
						<div className="py-16 text-center text-sm text-muted-foreground">
							No remaining credits on this package — nothing to schedule.
						</div>
					) : (
						<div className="space-y-2">
							{proposal && proposal.creditsRemaining > 0 && mode === "full" && (
								<p className="mb-3 text-xs text-muted-foreground">
									{proposal.creditsRemaining} credit(s) remaining ·{" "}
									{proposal.duration} min each
								</p>
							)}
							{effectiveSlots.map((slot, i) => {
								const meta = slot.edited
									? { label: "Custom", cls: "bg-zinc-100 text-zinc-600" }
									: STATUS_META[slot.status];
								return (
									<div
										key={i}
										className="rounded-lg border border-[#e5e5e5] bg-white p-3"
									>
										<div className="mb-2 flex items-center justify-between">
											<span className="text-xs font-medium text-muted-foreground">
												Session {i + 1}
												{slot.sourcePriority != null && (
													<span className="ml-1.5 text-[10px]">
														(preference {slot.sourcePriority})
													</span>
												)}
											</span>
											<span
												className={cn(
													"rounded-full px-2 py-0.5 text-[10px] font-semibold",
													meta.cls,
												)}
												title={slot.conflictReason}
											>
												{meta.label}
											</span>
										</div>
										<DateTimeSlotPicker
											date={slot.date}
											time={slot.time}
											onDateChange={(date) => updateSlot(i, { date })}
											onTimeChange={(time) => updateSlot(i, { time })}
											disabled={createMutation.isPending}
										/>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<SheetFooter className="border-t">
					<div className="flex w-full items-center gap-2">
						<Button
							variant="outline"
							className="flex-1"
							onClick={handleClose}
							disabled={createMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							className="flex-1"
							onClick={handleCreate}
							disabled={createMutation.isPending || count === 0}
						>
							{createMutation.isPending && (
								<Loader2 className="mr-1.5 size-4 animate-spin" />
							)}
							{mode === "single"
								? "Book session"
								: `Create ${count} session${count === 1 ? "" : "s"}`}
						</Button>
					</div>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
