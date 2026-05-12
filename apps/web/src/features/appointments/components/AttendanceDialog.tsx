import { ClipboardCheck, CheckCircle2, XCircle } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import type { CalendarAppointment } from "@/lib/appointment-mapper";
import { formatTime, formatDuration } from "../utils";

interface AttendanceDialogProps {
	apptId: string | null;
	appointments: CalendarAppointment[];
	isPending: boolean;
	onClose: () => void;
	onConfirm: (id: string) => void;
	onCancel: (id: string) => void;
}

export function AttendanceDialog({
	apptId,
	appointments,
	isPending,
	onClose,
	onConfirm,
	onCancel,
}: AttendanceDialogProps) {
	const appt = appointments.find((a) => a.id === apptId);
	const start = appt ? new Date(appt.start) : null;
	const end = appt ? new Date(appt.end) : null;

	return (
		<Dialog open={apptId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-sm p-0 overflow-hidden rounded-2xl gap-0">
				{(() => {
					return (
						<>
							{/* Header */}
							<div className="px-6 pt-6 pb-5 border-b border-zinc-100">
								<div className="flex items-start gap-4">
									<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
										<ClipboardCheck className="size-4.5 text-zinc-500" />
									</div>
									<div className="flex-1 min-w-0">
										<DialogHeader className="p-0 space-y-0">
											<DialogTitle className="text-base font-bold text-zinc-900">
												{appt ? appt.title : "Mark Attendance"}
											</DialogTitle>
											{appt && start && end && (
												<DialogDescription className="text-xs text-muted-foreground mt-0.5">{appt.clientName}</DialogDescription>
											)}
										</DialogHeader>
										{start && end && (
											<div className="flex items-center gap-1.5 mt-1.5">
												<span className="text-xs font-medium text-zinc-600">
													{start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
												</span>
												<span className="text-xs text-zinc-400">·</span>
												<span className="text-xs text-zinc-500">{formatTime(start)}</span>
												<span className="text-xs text-zinc-400">·</span>
												<span className="text-xs text-zinc-500">{formatDuration(start, end)}</span>
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Options */}
							<div className="p-4 flex flex-col gap-2 bg-white">
								<button
									type="button"
									disabled={isPending}
									onClick={() => {
										if (!apptId) return;
										onConfirm(apptId);
									}}
									className="group flex items-center gap-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left transition-all hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
								>
									<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 group-hover:bg-emerald-100 transition-colors">
										<CheckCircle2 className="size-4.5 text-zinc-400 group-hover:text-emerald-600 transition-colors" />
									</div>
									<div>
										<p className="text-sm font-semibold text-zinc-900">Attended</p>
										<p className="text-xs text-zinc-400 mt-0.5">Client showed up on time</p>
									</div>
								</button>

								<button
									type="button"
									disabled={isPending}
									onClick={() => {
										if (!apptId) return;
										onCancel(apptId);
									}}
									className="group flex items-center gap-4 w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-left transition-all hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
								>
									<div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 group-hover:bg-rose-100 transition-colors">
										<XCircle className="size-4.5 text-zinc-400 group-hover:text-rose-500 transition-colors" />
									</div>
									<div>
										<p className="text-sm font-semibold text-zinc-900">No-show</p>
										<p className="text-xs text-zinc-400 mt-0.5">Client did not attend</p>
									</div>
								</button>
							</div>

							{/* Cancel */}
							<div className="px-4 pb-4 pt-0 bg-white">
								<button
									type="button"
									onClick={onClose}
									className="w-full rounded-xl border border-zinc-100 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
								>
									Cancel
								</button>
							</div>
						</>
					);
				})()}
			</DialogContent>
		</Dialog>
	);
}
