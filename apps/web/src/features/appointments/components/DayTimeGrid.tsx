import type { Ref } from "react";
import { Clock, Calendar, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Appointment } from "../types";
import { PX_PER_HOUR, PX_PER_MIN, statusStyle, assignColumns } from "../utils";

interface DayTimeGridProps {
	appts: Appointment[];
	currentDate: Date;
	defaultTrainerId?: string | null;
	onAppointmentClick: (appt: Appointment) => void;
	onAddAppointment: () => void;
	ref?: Ref<HTMLDivElement>;
}

function formatTime(date: Date) {
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

function isToday(date: Date) {
	const today = new Date();
	return (
		date.getDate() === today.getDate() &&
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear()
	);
}

function computeGridBounds(appts: Appointment[]) {
	let gridStart = 6;
	let gridEnd = 22;
	if (appts.length > 0) {
		const minHour = Math.min(...appts.map((a) => new Date(a.start).getHours()));
		const maxHour = Math.max(
			...appts.map((a) => {
				const e = new Date(a.end);
				return e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
			}),
		);
		gridStart = Math.min(gridStart, minHour - 1);
		gridEnd = Math.max(gridEnd, maxHour + 1);
	}
	return { gridStart: Math.max(0, gridStart), gridEnd: Math.min(24, gridEnd) };
}

function formatHour(h: number) {
	return h === 0
		? "12 AM"
		: h < 12
			? `${h} AM`
			: h === 12
				? "12 PM"
				: `${h - 12} PM`;
}

function HourLines({
	hours,
	gridStart,
}: {
	hours: number[];
	gridStart: number;
}) {
	return (
		<>
			{hours.map((h) => (
				<div
					key={h}
					className="absolute left-0 right-0 border-t border-zinc-100"
					style={{ top: (h - gridStart) * PX_PER_HOUR }}
				/>
			))}
		</>
	);
}

function NowLine({
	nowTop,
	gridHeight,
}: {
	nowTop: number | null;
	gridHeight: number;
}) {
	if (nowTop === null || nowTop < 0 || nowTop > gridHeight) return null;
	return (
		<div
			className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
			style={{ top: nowTop }}
		>
			<div className="size-2 rounded-full bg-red-500 -ml-1 shrink-0" />
			<div className="flex-1 border-t-2 border-red-500" />
		</div>
	);
}

function AppointmentCard({
	appt,
	col,
	totalCols,
	gridStart,
	onClick,
}: {
	appt: Appointment;
	col: number;
	totalCols: number;
	gridStart: number;
	onClick: (appt: Appointment) => void;
}) {
	const start = new Date(appt.start);
	const end = new Date(appt.end);
	const startMins = (start.getHours() - gridStart) * 60 + start.getMinutes();
	const durationMins = Math.max(
		15,
		Math.round((end.getTime() - start.getTime()) / 60000),
	);
	const top = startMins * PX_PER_MIN;
	const height = Math.max(28, durationMins * PX_PER_MIN);
	const colWidth = 100 / totalCols;
	const s = statusStyle(appt.status);
	const isVirtualOccurrence =
		appt.isVirtual === true || (appt.id?.startsWith("virtual__") ?? false);
	return (
		<div
			key={appt.id}
			role="button"
			tabIndex={0}
			className={cn(
				"absolute z-10 rounded border-l-[3px] px-2 py-1 cursor-pointer hover:brightness-95 transition-all overflow-hidden",
				s.bg,
				s.border,
				s.text,
				isVirtualOccurrence && "border border-dashed",
			)}
			style={{
				top,
				height,
				left: `calc(${col * colWidth}% + 2px)`,
				width: `calc(${colWidth}% - 4px)`,
			}}
			onClick={() => onClick(appt)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick(appt);
				}
			}}
		>
			<div className="font-semibold text-xs truncate leading-tight flex items-center gap-1">
				{isVirtualOccurrence && (
					<RefreshCw
						className="size-2.5 shrink-0 opacity-60"
						aria-label="Recurring occurrence"
					/>
				)}
				<span className="truncate">{appt.title}</span>
			</div>
			<div className="text-xs opacity-80 truncate">{appt.clientName}</div>
			{height > 44 && (
				<div className="text-xs opacity-60 truncate">
					{formatTime(start)} – {formatTime(end)}
				</div>
			)}
			{height > 60 && (
				<span
					className={cn(
						"inline-block mt-0.5 rounded text-[10px] px-1 py-0.5",
						s.badge,
					)}
				>
					{s.label}
				</span>
			)}
		</div>
	);
}

function BufferBlocks({
	sortedAppts,
	gridStart,
}: {
	sortedAppts: Appointment[];
	gridStart: number;
}) {
	return (
		<>
			{sortedAppts.slice(0, -1).map((appt, i) => {
				const end = new Date(appt.end);
				const nextStart = new Date(sortedAppts[i + 1]!.start);
				const bufferMins = Math.round(
					(nextStart.getTime() - end.getTime()) / 60000,
				);
				if (bufferMins < 5) return null;
				const top =
					((end.getHours() - gridStart) * 60 + end.getMinutes()) * PX_PER_MIN;
				const height = bufferMins * PX_PER_MIN;
				if (height < 14) return null;
				const label =
					bufferMins >= 60
						? `${Math.floor(bufferMins / 60)}h${bufferMins % 60 > 0 ? ` ${bufferMins % 60}m` : ""} buffer`
						: `${bufferMins}m buffer`;
				return (
					<div
						key={`buf-${appt.id}`}
						className="absolute left-0 right-0 z-0 flex items-center justify-center"
						style={{ top, height }}
					>
						<div className="w-full h-full border-y border-dashed border-zinc-300 bg-zinc-50/60 flex items-center justify-center gap-1 text-[11px] text-zinc-400 pointer-events-none">
							<Clock className="size-3 shrink-0" />
							{label}
						</div>
					</div>
				);
			})}
		</>
	);
}

export function DayTimeGrid({
	appts,
	currentDate,
	defaultTrainerId,
	onAppointmentClick,
	onAddAppointment,
	ref,
}: DayTimeGridProps) {
	if (appts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
				<Calendar className="size-12 text-zinc-300" />
				<p className="text-base font-medium">No appointments this day</p>
				<Button size="sm" onClick={onAddAppointment}>
					<Plus className="size-4 mr-2" />
					Add Appointment
				</Button>
			</div>
		);
	}

	const { gridStart, gridEnd } = computeGridBounds(appts);
	const totalHours = gridEnd - gridStart;
	const gridHeight = totalHours * PX_PER_HOUR;
	const hours = Array.from({ length: totalHours }, (_, i) => gridStart + i);

	const now = new Date();
	const showNowLine = isToday(currentDate);
	const nowTop = showNowLine
		? (now.getHours() - gridStart) * PX_PER_HOUR + now.getMinutes() * PX_PER_MIN
		: null;

	const isMultiTrainer =
		defaultTrainerId === null && appts.some((a) => a.assignedTo);

	if (isMultiTrainer) {
		const TRAINER_COL_WIDTH = 200;
		const trainerMap = new Map<
			string,
			{ name: string; color?: string; appts: Appointment[] }
		>();
		for (const appt of appts) {
			const id = appt.assignedTo?.id ?? "__unassigned__";
			const name = appt.assignedTo?.name ?? "Unassigned";
			if (!trainerMap.has(id))
				trainerMap.set(id, { name, color: appt.assignedTo?.color, appts: [] });
			trainerMap.get(id)!.appts.push(appt);
		}
		const trainers = Array.from(trainerMap.entries()).sort(([, a], [, b]) =>
			a.name.localeCompare(b.name),
		);

		return (
			<div
				ref={ref}
				className="overflow-auto rounded-lg border border-zinc-200"
				style={{ maxHeight: 600 }}
			>
				<div className="sticky top-0 z-30 flex border-b border-zinc-200 bg-white">
					<div className="shrink-0 w-16 border-r border-zinc-200 bg-zinc-50" />
					{trainers.map(([id, { name, color }]) => (
						<div
							key={id}
							className="flex items-center gap-1.5 border-r border-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white"
							style={{ minWidth: TRAINER_COL_WIDTH }}
						>
							{color && (
								<div
									className="size-2.5 rounded-full shrink-0"
									style={{ backgroundColor: color }}
								/>
							)}
							<span className="truncate">{name}</span>
						</div>
					))}
				</div>
				<div className="relative flex" style={{ height: gridHeight }}>
					<div className="sticky left-0 z-20 shrink-0 w-16 border-r border-zinc-200 bg-zinc-50">
						{hours.map((h) => (
							<div
								key={h}
								className="flex items-start justify-end pr-2 text-xs text-zinc-400"
								style={{ height: PX_PER_HOUR, paddingTop: 2 }}
							>
								{formatHour(h)}
							</div>
						))}
					</div>
					{trainers.map(([id, { appts: trainerAppts }]) => {
						const sorted = trainerAppts.toSorted(
							(a, b) =>
								new Date(a.start).getTime() - new Date(b.start).getTime(),
						);
						const withCols = assignColumns(sorted);
						return (
							<div
								key={id}
								className="relative border-r border-zinc-100"
								style={{ minWidth: TRAINER_COL_WIDTH }}
							>
								<HourLines hours={hours} gridStart={gridStart} />
								<NowLine nowTop={nowTop} gridHeight={gridHeight} />
								{withCols.map(({ appt, col, totalCols }) => (
									<AppointmentCard
										key={appt.id}
										appt={appt}
										col={col}
										totalCols={totalCols}
										gridStart={gridStart}
										onClick={onAppointmentClick}
									/>
								))}
								<BufferBlocks sortedAppts={sorted} gridStart={gridStart} />
							</div>
						);
					})}
				</div>
			</div>
		);
	}

	const withCols = assignColumns(appts);
	return (
		<div
			ref={ref}
			className="relative overflow-y-auto rounded-lg border border-zinc-200"
			style={{ maxHeight: 600 }}
		>
			<div className="relative flex" style={{ height: gridHeight }}>
				<div className="shrink-0 w-16 border-r border-zinc-200 bg-zinc-50">
					{hours.map((h) => (
						<div
							key={h}
							className="flex items-start justify-end pr-2 text-xs text-zinc-400"
							style={{ height: PX_PER_HOUR, paddingTop: 2 }}
						>
							{formatHour(h)}
						</div>
					))}
				</div>
				<div className="relative flex-1">
					<HourLines hours={hours} gridStart={gridStart} />
					<NowLine nowTop={nowTop} gridHeight={gridHeight} />
					{withCols.map(({ appt, col, totalCols }) => (
						<AppointmentCard
							key={appt.id}
							appt={appt}
							col={col}
							totalCols={totalCols}
							gridStart={gridStart}
							onClick={onAppointmentClick}
						/>
					))}
					<BufferBlocks sortedAppts={appts} gridStart={gridStart} />
				</div>
			</div>
		</div>
	);
}
