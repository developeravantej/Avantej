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

// ── Time-band grouping ────────────────────────────────────────────────────────

type Band = "morning" | "afternoon" | "evening";

const BANDS: { key: Band; label: string; range: string; start: number; end: number }[] = [
	{ key: "morning", label: "Morning", range: "07:00 – 12:00", start: 0, end: 12 },
	{ key: "afternoon", label: "Afternoon", range: "12:00 – 18:00", start: 12, end: 18 },
	{ key: "evening", label: "Evening", range: "18:00 – 22:00", start: 18, end: 24 },
];

function getBand(date: Date): Band {
	const h = date.getHours();
	if (h < 12) return "morning";
	if (h < 18) return "afternoon";
	return "evening";
}

function groupByBand(appts: CalendarAppointment[]) {
	const map = new Map<Band, CalendarAppointment[]>();
	for (const band of BANDS) map.set(band.key, []);
	for (const appt of appts) {
		const b = getBand(new Date(appt.start));
		map.get(b)!.push(appt);
	}
	return map;
}

// ── Appointment row card ──────────────────────────────────────────────────────

function AppointmentRow({
	appt,
	onSelectAppt,
	onMarkAttendance,
}: {
	appt: CalendarAppointment;
	onSelectAppt: (appt: CalendarAppointment) => void;
	onMarkAttendance: (id: string) => void;
}) {
	const cfg = STATUS[appt.status];
	const start = new Date(appt.start);
	const end = new Date(appt.end);
	const trainerName = appt.assignedTo?.name;
	const durationMins = Math.round((end.getTime() - start.getTime()) / 60000);

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelectAppt(appt)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onSelectAppt(appt);
			}}
			className="flex cursor-pointer items-center gap-4 rounded-xl border border-[#edede4] bg-white p-4 transition-shadow hover:shadow-sm"
		>
			{/* Time column */}
			<div className="flex w-20 shrink-0 flex-col text-center">
				<span className="font-mono tabular-nums text-sm font-semibold text-[#0a0a0a]">
					{start.toLocaleTimeString("en-US", {
						hour: "2-digit",
						minute: "2-digit",
						hour12: false,
					})}
				</span>
				<span className="text-[10px] text-[#8a8f91]">{durationMins} min</span>
			</div>

			{/* Client info */}
			<div className="flex flex-1 min-w-0 items-center gap-3">
				<span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] text-[11px] font-semibold text-white">
					{getInitials(appt.clientName)}
				</span>
				<div className="min-w-0">
					<p className="text-sm font-medium text-[#0a0a0a] truncate">{appt.clientName}</p>
					<p className="text-xs text-[#6b7170] truncate">
						{appt.service && appt.service !== "—" ? appt.service : "—"}
						{trainerName ? ` · with ${trainerName}` : ""}
					</p>
				</div>
			</div>

			{/* Status badge */}
			{cfg.label && (
				<Badge
					variant="outline"
					className={cn("shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-md border", cfg.badge)}
				>
					{cfg.label}
				</Badge>
			)}

			{/* Attendance CTA for pending */}
			{appt.status === "pending" && (
				<Button
					size="sm"
					variant="outline"
					className="h-7 shrink-0 px-2.5 text-xs rounded-lg gap-1.5"
					onClick={(e) => {
						e.stopPropagation();
						onMarkAttendance(appt.id);
					}}
				>
					<ClipboardCheck className="h-3.5 w-3.5" />
					Attendance
				</Button>
			)}
		</div>
	);
}

// ── Day Agenda view with Morning / Afternoon / Evening bands ──────────────────

export function DayAgendaView({ dayAppts, onSelectAppt, onMarkAttendance }: DayViewProps) {
	const byBand = groupByBand(dayAppts);

	const activeBands = BANDS.filter((b) => (byBand.get(b.key)?.length ?? 0) > 0);

	if (activeBands.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-sm text-[#8a8f91]">No appointments for this day.</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{activeBands.map((band, i) => {
				const appts = byBand.get(band.key)!;
				return (
					<div key={band.key}>
						{/* Band header */}
						<div className={cn("mb-3 flex items-center justify-between", i > 0 && "mt-2")}>
							<p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#8a8f91]">
								{band.label} · {band.range}
							</p>
							<span className="font-mono tabular-nums text-xs text-[#6b7170]">
								{appts.length} booking{appts.length !== 1 ? "s" : ""}
							</span>
						</div>
						<div className="space-y-2">
							{appts.map((appt) => (
								<AppointmentRow
									key={appt.id}
									appt={appt}
									onSelectAppt={onSelectAppt}
									onMarkAttendance={onMarkAttendance}
								/>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}

// ── Legacy list view (kept for week/list modes) ───────────────────────────────

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
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onSelectAppt(appt);
						}}
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

							<div className="min-w-0">
								<p className="text-sm font-bold text-zinc-900 leading-snug line-clamp-2">{appt.title}</p>
								{appt.service && appt.service !== "—" && (
									<p className="text-xs text-muted-foreground mt-0.5 truncate">{appt.service}</p>
								)}
							</div>

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
