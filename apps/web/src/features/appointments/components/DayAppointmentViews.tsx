import { ClipboardCheck, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/appointment-mapper";
import { STATUS, formatTime, formatDuration, getInitials } from "../utils";

interface DayViewProps {
	dayAppts: CalendarAppointment[];
	onSelectAppt: (appt: CalendarAppointment) => void;
	onMarkAttendance: (apptId: string) => void;
}

export function DayListView({ dayAppts, onSelectAppt, onMarkAttendance }: DayViewProps) {
	return (
		<div className="space-y-2.5 pl-1">
			{dayAppts.map((appt) => {
				const cfg = STATUS[appt.status];
				const start = new Date(appt.start);
				const end = new Date(appt.end);
				const trainerName = appt.assignedTo?.name;

				return (
					<div
						key={appt.id}
						role="button"
						tabIndex={0}
						onClick={() => onSelectAppt(appt)}
						onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectAppt(appt); }}
						className="flex flex-col rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer"
					>
						<div className="flex items-stretch">
							<div className="flex flex-col items-center justify-center px-5 py-4 min-w-[88px] shrink-0 bg-zinc-50/60">
								<span className="text-sm font-bold text-zinc-800">{formatTime(start)}</span>
								<span className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
									<Clock className="size-3" />
									{formatDuration(start, end)}
								</span>
							</div>

							<div className="w-px self-stretch bg-zinc-100 shrink-0" />

							<div className="flex flex-1 min-w-0 items-center gap-4 px-5 py-4">
								<div className="flex-1 min-w-0">
									<p className="text-sm font-semibold text-zinc-900 truncate">{appt.title}</p>
									{appt.service && appt.service !== "—" && (
										<p className="text-xs text-muted-foreground truncate mt-0.5">{appt.service}</p>
									)}
								</div>

								<div className="hidden sm:flex flex-col w-32 shrink-0">
									<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Client</span>
									<span className="text-xs text-zinc-700 truncate mt-0.5">{appt.clientName}</span>
								</div>

								<div className="hidden md:flex flex-col w-36 shrink-0">
									<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trainer</span>
									{trainerName ? (
										<div className="flex items-center gap-1.5 mt-0.5">
											<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 text-[9px] font-bold">
												{getInitials(trainerName)}
											</span>
											<span className="text-xs text-zinc-700 truncate">{trainerName}</span>
										</div>
									) : (
										<span className="text-xs text-muted-foreground mt-0.5">-</span>
									)}
								</div>

								{cfg.label && (
									<Badge
										variant="outline"
										className={cn("shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full border", cfg.badge)}
									>
										{cfg.label}
									</Badge>
								)}

								{appt.status === "pending" && (
									<Button
										size="sm"
										variant="outline"
										className="h-7 px-2.5 text-xs rounded-full gap-1.5 shrink-0"
										onClick={(e) => { e.stopPropagation(); onMarkAttendance(appt.id); }}
									>
										<ClipboardCheck className="size-3.5" />
										Attendance
									</Button>
								)}
							</div>
						</div>
						<div className={cn("h-0.5 w-full shrink-0", cfg.stripe)} />
					</div>
				);
			})}
		</div>
	);
}

export function DayCardView({ dayAppts, onSelectAppt, onMarkAttendance }: DayViewProps) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pl-1">
			{dayAppts.map((appt) => {
				const cfg = STATUS[appt.status];
				const start = new Date(appt.start);
				const end = new Date(appt.end);
				const trainerName = appt.assignedTo?.name;

				return (
					<div
						key={appt.id}
						role="button"
						tabIndex={0}
						onClick={() => onSelectAppt(appt)}
						onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectAppt(appt); }}
						className="flex flex-col rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer"
					>
						<div className="flex flex-col flex-1 px-4 pt-4 pb-3 gap-3">
							{/* Time row */}
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-1.5 text-xs text-zinc-500">
									<Clock className="size-3 shrink-0" />
									<span className="font-semibold text-zinc-800">{formatTime(start)}</span>
									<span>·</span>
									<span>{formatDuration(start, end)}</span>
								</div>
								{cfg.label ? (
									<Badge variant="outline" className={cn("text-xs font-medium px-2 py-0 rounded-full border", cfg.badge)}>
										{cfg.label}
									</Badge>
								) : (
									<span className="flex size-2 shrink-0 rounded-full bg-amber-400" />
								)}
							</div>

							{/* Title + service */}
							<div className="min-w-0">
								<p className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">{appt.title}</p>
								{appt.service && appt.service !== "—" && (
									<p className="text-xs text-muted-foreground mt-0.5 truncate">{appt.service}</p>
								)}
							</div>

							{/* Client + Trainer */}
							<div className="flex flex-col gap-1.5">
								{appt.clientName && (
									<div className="flex items-center gap-1.5">
										<User className="size-3 text-zinc-400 shrink-0" />
										<span className="text-xs text-zinc-600 truncate">{appt.clientName}</span>
									</div>
								)}
								{trainerName && (
									<div className="flex items-center gap-1.5">
										<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 text-[8px] font-bold">
											{getInitials(trainerName)}
										</span>
										<span className="text-xs text-zinc-600 truncate">{trainerName}</span>
									</div>
								)}
							</div>

							{appt.status === "pending" && (
								<Button
									size="sm"
									variant="outline"
									className="w-full h-7 text-xs rounded-lg gap-1.5 mt-auto"
									onClick={(e) => { e.stopPropagation(); onMarkAttendance(appt.id); }}
								>
									<ClipboardCheck className="size-3.5" />
									Mark Attendance
								</Button>
							)}
						</div>
						<div className={cn("h-0.5 w-full shrink-0", cfg.stripe)} />
					</div>
				);
			})}
		</div>
	);
}
