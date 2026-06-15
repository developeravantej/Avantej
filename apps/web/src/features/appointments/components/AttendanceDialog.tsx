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
		<Dialog
			open={apptId !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				{(() => {
					return (
						<>
							{/* Header */}
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									ATTENDANCE
								</p>
								<div className="flex items-start gap-4">
									<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f3f3]">
										<ClipboardCheck className="h-4.5 w-4.5 text-[#737373]" />
									</div>
									<div className="flex-1 min-w-0">
										<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
											{appt ? appt.title : "Mark Attendance"}
										</DialogTitle>
										{appt && start && end && (
											<DialogDescription className="text-sm text-[#737373] mt-0.5">
												{appt.clientName}
											</DialogDescription>
										)}
										{start && end && (
											<div className="flex items-center gap-1.5 mt-1.5">
												<span className="text-xs font-medium text-[#737373]">
													{start.toLocaleDateString("en-US", {
														weekday: "short",
														month: "short",
														day: "numeric",
													})}
												</span>
												<span className="text-xs text-[#a3a3a3]">·</span>
												<span className="text-xs text-[#737373]">
													{formatTime(start)}
												</span>
												<span className="text-xs text-[#a3a3a3]">·</span>
												<span className="text-xs text-[#737373]">
													{formatDuration(start, end)}
												</span>
											</div>
										)}
									</div>
								</div>
							</DialogHeader>

							{/* Body */}
							<div className="px-6 pt-4 pb-2 overflow-y-auto">
								{/* Options */}
								<div className="flex flex-col gap-2">
									<button
										type="button"
										disabled={isPending}
										onClick={() => {
											if (!apptId) return;
											onConfirm(apptId);
										}}
										className="group flex items-center gap-4 w-full rounded-xl border border-[#e5e5e5] bg-white px-4 py-3.5 text-left transition-all hover:bg-[#f3f3f3] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
										data-testid="appointment-complete-button"
									>
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f3f3] group-hover:bg-emerald-100 transition-colors">
											<CheckCircle2 className="h-4.5 w-4.5 text-[#737373] group-hover:text-emerald-600 transition-colors" />
										</div>
										<div>
											<p className="text-sm font-semibold text-[#0a0a0a]">
												Attended
											</p>
											<p className="text-xs text-[#737373] mt-0.5">
												Client showed up on time
											</p>
										</div>
									</button>

									<button
										type="button"
										disabled={isPending}
										onClick={() => {
											if (!apptId) return;
											onCancel(apptId);
										}}
										className="group flex items-center gap-4 w-full rounded-xl border border-[#e5e5e5] bg-white px-4 py-3.5 text-left transition-all hover:bg-[#f3f3f3] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
										data-testid="appointment-cancel-confirm-button"
									>
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f3f3] group-hover:bg-rose-100 transition-colors">
											<XCircle className="h-4.5 w-4.5 text-[#737373] group-hover:text-rose-500 transition-colors" />
										</div>
										<div>
											<p className="text-sm font-semibold text-[#0a0a0a]">
												No-show
											</p>
											<p className="text-xs text-[#737373] mt-0.5">
												Client did not attend
											</p>
										</div>
									</button>
								</div>
							</div>

							{/* Footer */}
							<div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<button
									type="button"
									onClick={onClose}
									className="rounded-xl border border-[#e5e5e5] px-4 py-2 text-sm text-[#737373] hover:bg-[#f3f3f3] transition-colors"
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
