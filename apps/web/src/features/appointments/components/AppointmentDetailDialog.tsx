import { ClipboardCheck, Pencil, Clock, User, CalendarDays as CalendarIcon, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/appointment-mapper";
import { STATUS, formatTime, formatDuration, getInitials } from "../utils";
import { AppointmentStatusHistory } from "./AppointmentStatusHistory";
import { PaymentSection } from "./PaymentSection";

interface AppointmentDetailDialogProps {
	appt: CalendarAppointment | null;
	organizationId: string;
	onClose: () => void;
	onEdit: (appt: CalendarAppointment) => void;
	onMarkAttendance: (apptId: string) => void;
}

export function AppointmentDetailDialog({
	appt,
	organizationId,
	onClose,
	onEdit,
	onMarkAttendance,
}: AppointmentDetailDialogProps) {
	return (
		<Dialog open={appt !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl gap-0">
				{appt && (() => {
					const cfg = STATUS[appt.status];
					const start = new Date(appt.start);
					const end = new Date(appt.end);
					const trainerName = appt.assignedTo?.name;
					const weekday = start.toLocaleDateString("en-US", { weekday: "long" });
					const dateStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
					return (
						<>
							{/* Header */}
							<div className="px-6 pt-6 pb-5 border-b border-zinc-100">
								<div className="flex items-start gap-4">
									<div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 text-center">
										<span className="text-[10px] font-semibold leading-none tracking-wide">
											{start.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
										</span>
										<span className="text-xl font-bold leading-none mt-0.5">{start.getDate()}</span>
									</div>
									<div className="flex-1 min-w-0 pt-0.5">
										<DialogHeader className="p-0 space-y-0">
											<DialogTitle className="text-base font-bold text-zinc-900 leading-snug">{appt.title}</DialogTitle>
											{appt.service && appt.service !== "—" && (
												<DialogDescription className="text-xs text-muted-foreground mt-0.5">{appt.service}</DialogDescription>
											)}
										</DialogHeader>
										<div className="flex items-center gap-1.5 mt-2 flex-wrap">
											<span className="text-xs font-semibold text-zinc-700">{weekday}</span>
											<span className="text-xs text-zinc-400">·</span>
											<span className="text-xs text-zinc-500">{formatTime(start)}</span>
											<span className="text-xs text-zinc-400">·</span>
											<span className="text-xs text-zinc-500">{formatDuration(start, end)}</span>
										</div>
									</div>
									{cfg.label && (
										<Badge variant="outline" className={cn("shrink-0 self-start text-xs font-medium px-2.5 py-1 rounded-full border mt-0.5", cfg.badge)}>
											{cfg.label}
										</Badge>
									)}
								</div>
							</div>

							{/* Detail rows */}
							<div className="px-5 py-4 space-y-1 bg-white">
								<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50 transition-colors">
									<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
										<CalendarIcon className="size-3.5 text-zinc-500" />
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-[11px] text-zinc-400 font-medium">Date</p>
										<p className="text-sm text-zinc-800 font-medium">{dateStr}</p>
									</div>
								</div>
								<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50 transition-colors">
									<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
										<Clock className="size-3.5 text-zinc-500" />
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-[11px] text-zinc-400 font-medium">Time</p>
										<p className="text-sm text-zinc-800 font-medium">{formatTime(start)} – {formatTime(end)} <span className="text-zinc-400 font-normal">({formatDuration(start, end)})</span></p>
									</div>
								</div>
								{appt.clientName && (
									<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50 transition-colors">
										<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
											<User className="size-3.5 text-zinc-500" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[11px] text-zinc-400 font-medium">Client</p>
											<p className="text-sm text-zinc-800 font-medium">{appt.clientName}</p>
										</div>
									</div>
								)}
								{trainerName && (
									<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50 transition-colors">
										<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-600 text-xs font-bold">
											{getInitials(trainerName)}
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[11px] text-zinc-400 font-medium">Trainer</p>
											<p className="text-sm text-zinc-800 font-medium">{trainerName}</p>
										</div>
									</div>
								)}
							</div>

							{/* Payment */}
							{organizationId && (
								<PaymentSection
									organizationId={organizationId}
									appointmentId={appt.id}
								/>
							)}

							{/* Status History */}
							{organizationId && (
								<div className="px-5 pt-3 pb-3 border-t border-zinc-100 bg-white">
									<p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wide">
										<History className="size-3.5" />
										Status History
									</p>
									<AppointmentStatusHistory
										organizationId={organizationId}
										appointmentId={appt.id}
									/>
								</div>
							)}

							{/* Footer actions */}
							<div className="px-5 pb-5 pt-0 bg-white flex flex-col gap-2">
								<button
									type="button"
									onClick={() => onEdit(appt)}
									className="flex items-center justify-center gap-2 w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
								>
									<Pencil className="size-3.5" />
									Edit Appointment
								</button>
								{appt.status === "pending" && (
									<Button
										className="w-full gap-2 rounded-xl h-10"
										onClick={() => { onClose(); onMarkAttendance(appt.id); }}
									>
										<ClipboardCheck className="size-4" />
										Mark Attendance
									</Button>
								)}
							</div>
						</>
					);
				})()}
			</DialogContent>
		</Dialog>
	);
}
