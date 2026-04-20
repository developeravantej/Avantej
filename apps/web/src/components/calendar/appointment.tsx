import React, { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Calendar, CalendarDays, Clock, X, User, Calendar as CalendarIcon, MapPin, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AddAppointmentModal } from "./add-appointment-modal";
import { useUserContext } from "@/hooks/useUserContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";

interface Appointment {
	id: string;
	title: string;
	start: Date;
	end: Date;
	status: "confirmed" | "pending" | "cancelled";
	clientName: string;
	service: string;
	assignedTo?: {
		id: string;
		name: string;
		email?: string;
		avatar?: string;
		color?: string;
	};
	clientEmail?: string;
	clientPhone?: string;
	location?: string;
	notes?: string;
	duration?: number;
}

type CalendarView = "monthly" | "weekly" | "daily";

interface AppointmentCalendarProps {
	appointments?: Appointment[];
	onDateSelect?: (date: Date) => void;
	onAppointmentClick?: (appointment: Appointment) => void;
	onAddAppointment?: () => void;
	initialView?: CalendarView;
	defaultTrainerId?: string | null;
}

const PX_PER_HOUR = 64;
const PX_PER_MIN = PX_PER_HOUR / 60;

function statusStyle(status: Appointment["status"]) {
	switch (status) {
		case "confirmed":
			return { border: "border-l-green-500", bg: "bg-green-50", text: "text-green-900", badge: "bg-green-100 text-green-800", label: "Came" };
		case "pending":
			return { border: "border-l-yellow-500", bg: "bg-yellow-50", text: "text-yellow-900", badge: "bg-yellow-100 text-yellow-800", label: "Upcoming" };
		case "cancelled":
			return { border: "border-l-red-500", bg: "bg-red-50", text: "text-red-900", badge: "bg-red-100 text-red-800", label: "No-show" };
	}
}

function assignColumns(appts: Appointment[]): Array<{ appt: Appointment; col: number; totalCols: number }> {
	const sorted = [...appts].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
	const colEnds: Date[] = [];

	const assigned = sorted.map((appt) => {
		const start = new Date(appt.start);
		const end = new Date(appt.end);
		let col = colEnds.findIndex((colEnd) => colEnd <= start);
		if (col === -1) {
			col = colEnds.length;
			colEnds.push(end);
		} else {
			colEnds[col] = end;
		}
		return { appt, col };
	});

	const totalCols = colEnds.length || 1;
	return assigned.map((item) => ({ ...item, totalCols }));
}

export function AppointmentCalendar({
	appointments = [],
	onDateSelect,
	onAppointmentClick,
	onAddAppointment,
	initialView = "monthly",
	defaultTrainerId,
}: AppointmentCalendarProps) {
	const [currentDate, setCurrentDate] = useState(new Date());
	const [view, setView] = useState<CalendarView>(initialView);
	const [selectedDate, setSelectedDate] = useState<Date | null>(null);
	const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
	const [selectedAppointments, setSelectedAppointments] = useState<Set<string>>(new Set());
	const [isGroupSelectMode, setIsGroupSelectMode] = useState(false);
	const [showConfirmed, setShowConfirmed] = useState(true);
	const [showCancelled, setShowCancelled] = useState(true);
	const [showAddModal, setShowAddModal] = useState(false);
	const [_editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

	const gridContainerRef = useRef<HTMLDivElement>(null);

	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";
	const org = userCtx?.organizations.find((o) => o.id === organizationId);
	const branchId = org?.hierarchy.member?.hierarchyScopeId ?? "";
	const queryClient = useQueryClient();

	const updateMutation = useMutation({
		mutationFn: (params: { id: string; status: "confirmed" | "cancelled" }) =>
			client.appointments.update({
				organizationId,
				id: params.id,
				status: params.status,
			}),
	});

	const createMutation = useMutation({
		mutationFn: (params: { start: Date; duration: number; notes?: string }) =>
			client.appointments.create({
				organizationId,
				type: "private",
				startTime: params.start.toISOString(),
				duration: params.duration,
				branchId,
				sessionTotal: 1,
				pricePerClient: 0,
				notes: params.notes ?? null,
			}),
		onSuccess: () => {
			toast.success("Appointment created");
			closeAddModal();
			queryClient.invalidateQueries({ queryKey: ["appointments"] });
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to create appointment");
		},
	});

	const { startDate, endDate, dateDisplay, prevPeriod, nextPeriod } = useMemo(() => {
		if (view === "monthly") {
			const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
			const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
			const sd = new Date(monthStart);
			sd.setDate(sd.getDate() - sd.getDay());
			const ed = new Date(monthEnd);
			ed.setDate(ed.getDate() + (6 - ed.getDay()));
			return {
				startDate: sd,
				endDate: ed,
				dateDisplay: currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
				prevPeriod: () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)),
				nextPeriod: () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)),
			};
		} else if (view === "weekly") {
			const weekStart = new Date(currentDate);
			weekStart.setDate(currentDate.getDate() - currentDate.getDay());
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekStart.getDate() + 6);
			return {
				startDate: weekStart,
				endDate: weekEnd,
				dateDisplay: `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
				prevPeriod: () => { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); },
				nextPeriod: () => { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); },
			};
		} else {
			return {
				startDate: currentDate,
				endDate: currentDate,
				dateDisplay: currentDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
				prevPeriod: () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d); },
				nextPeriod: () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d); },
			};
		}
	}, [currentDate, view]);

	const calendarDays = useMemo(() => {
		const days: Date[] = [];
		const day = new Date(startDate);
		while (day <= endDate) {
			days.push(new Date(day));
			day.setDate(day.getDate() + 1);
		}
		return days;
	}, [startDate, endDate]);

	const getFilteredAppointments = () =>
		appointments.filter((a) => {
			if (a.status === "confirmed" && !showConfirmed) return false;
			if (a.status === "cancelled" && !showCancelled) return false;
			return true;
		});

	const getAppointmentsForDate = (date: Date) =>
		getFilteredAppointments().filter((a) => {
			const d = new Date(a.start);
			return d.getDate() === date.getDate() && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
		});

	const getSortedAppointmentsForDate = (date: Date) =>
		getAppointmentsForDate(date).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

	const isToday = (date: Date) => {
		const today = new Date();
		return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
	};

	const isCurrentPeriod = (date: Date) => {
		if (view === "monthly") return date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();
		return date >= startDate && date <= endDate;
	};

	const formatTime = (date: Date) =>
		date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

	const handleDayCellClick = (date: Date) => {
		setCurrentDate(date);
		setView("daily");
		onDateSelect?.(date);
	};

	const closeAppointmentModal = () => setSelectedAppointment(null);
	const openAddModal = () => { setShowAddModal(true); onAddAppointment?.(); };
	const closeAddModal = () => { setShowAddModal(false); setEditingAppointment(null); };

	const handleSubmitAppointment = (appointment: any) => {
		if (!organizationId) { toast.error("No organization selected."); return; }
		if (!branchId) { toast.error("Your account is not scoped to a branch. Please contact your administrator."); return; }
		createMutation.mutate({ start: new Date(appointment.start), duration: appointment.duration, notes: appointment.remarks });
	};

	const handleAppointmentClick = (appointment: Appointment) => {
		if (isGroupSelectMode && appointment.status === "pending") {
			const next = new Set(selectedAppointments);
			next.has(appointment.id) ? next.delete(appointment.id) : next.add(appointment.id);
			setSelectedAppointments(next);
		} else {
			setSelectedAppointment(appointment);
			onAppointmentClick?.(appointment);
		}
	};

	const handleBulkStatusChange = (_newStatus: "confirmed" | "cancelled") => {
		setSelectedAppointments(new Set());
		setIsGroupSelectMode(false);
	};

	// Auto-scroll Day view to current time / first appointment
	useEffect(() => {
		if (view !== "daily" || !gridContainerRef.current) return;
		const dayAppts = getSortedAppointmentsForDate(currentDate);
		const container = gridContainerRef.current;

		if (isToday(currentDate)) {
			const now = new Date();
			const gridStart = dayAppts.length > 0 ? Math.min(6, new Date(dayAppts[0].start).getHours() - 1) : 6;
			const nowTop = (now.getHours() - gridStart) * PX_PER_HOUR + now.getMinutes() * PX_PER_MIN - 80;
			container.scrollTop = Math.max(0, nowTop);
		} else if (dayAppts.length > 0) {
			const firstAppt = new Date(dayAppts[0].start);
			const gridStart = Math.min(6, firstAppt.getHours() - 1);
			const top = (firstAppt.getHours() - gridStart) * PX_PER_HOUR + firstAppt.getMinutes() * PX_PER_MIN - 40;
			container.scrollTop = Math.max(0, top);
		} else {
			container.scrollTop = 2 * PX_PER_HOUR;
		}
	}, [view, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

	// ── Simplified cell for month/week ──────────────────────────────────────
	const renderSimpleCell = (date: Date, minHeight: string) => {
		const appts = getSortedAppointmentsForDate(date);
		const isTodayDate = isToday(date);
		const inPeriod = view === "monthly" ? isCurrentPeriod(date) : true;
		const preview =
			appts.find((a) => a.status === "pending") ??
			appts.find((a) => a.status === "confirmed") ??
			appts[0] ??
			null;

		return (
			<div
				className={cn(
					"bg-white p-2 cursor-pointer transition-colors hover:bg-blue-50/40 flex flex-col gap-1",
					minHeight,
					!inPeriod && "bg-gray-50 text-gray-400",
					isTodayDate && "bg-blue-50 ring-2 ring-inset ring-blue-300",
				)}
				onClick={() => handleDayCellClick(date)}
			>
				<div className="flex items-center justify-between">
					<span className={cn("text-sm font-medium", isTodayDate && "text-blue-600 font-bold")}>{date.getDate()}</span>
					{appts.length > 0 && (
						<span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
							{appts.length}
						</span>
					)}
				</div>

				{preview && (() => {
					const s = statusStyle(preview.status);
					return (
						<div
							className={cn("rounded border-l-[3px] px-1.5 py-1 text-xs leading-tight", s.bg, s.border, s.text)}
							onClick={(e) => { e.stopPropagation(); handleDayCellClick(date); }}
						>
							<div className="font-medium truncate">{preview.title}</div>
							<div className="opacity-75 truncate">{formatTime(new Date(preview.start))}</div>
						</div>
					);
				})()}

				{appts.length > 1 && (
					<div className="text-xs text-gray-400 text-right">+{appts.length - 1} more</div>
				)}
			</div>
		);
	};

	// ── Day time-grid view ───────────────────────────────────────────────────
	const renderDayView = () => {
		const appts = getSortedAppointmentsForDate(currentDate);

		// Shared grid bounds across all appointments
		let gridStart = 6;
		let gridEnd = 22;
		if (appts.length > 0) {
			const minHour = Math.min(...appts.map((a) => new Date(a.start).getHours()));
			const maxHour = Math.max(...appts.map((a) => {
				const e = new Date(a.end);
				return e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
			}));
			gridStart = Math.min(gridStart, minHour - 1);
			gridEnd = Math.max(gridEnd, maxHour + 1);
		}
		gridStart = Math.max(0, gridStart);
		gridEnd = Math.min(24, gridEnd);

		const totalHours = gridEnd - gridStart;
		const gridHeight = totalHours * PX_PER_HOUR;
		const hours = Array.from({ length: totalHours }, (_, i) => gridStart + i);

		const now = new Date();
		const showNowLine = isToday(currentDate);
		const nowTop = showNowLine
			? (now.getHours() - gridStart) * PX_PER_HOUR + now.getMinutes() * PX_PER_MIN
			: null;

		const formatHour = (h: number) =>
			h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

		// Shared sub-renderers used by both single and multi-trainer layouts
		const renderHourLines = () =>
			hours.map((h) => (
				<div key={h} className="absolute left-0 right-0 border-t border-gray-100" style={{ top: (h - gridStart) * PX_PER_HOUR }} />
			));

		const renderNowLine = () =>
			showNowLine && nowTop !== null && nowTop >= 0 && nowTop <= gridHeight ? (
				<div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: nowTop }}>
					<div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
					<div className="flex-1 border-t-2 border-red-500" />
				</div>
			) : null;

		const renderCard = (appt: Appointment, col: number, totalCols: number) => {
			const start = new Date(appt.start);
			const end = new Date(appt.end);
			const startMins = (start.getHours() - gridStart) * 60 + start.getMinutes();
			const durationMins = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
			const top = startMins * PX_PER_MIN;
			const height = Math.max(28, durationMins * PX_PER_MIN);
			const colWidth = 100 / totalCols;
			const s = statusStyle(appt.status);
			return (
				<div
					key={appt.id}
					className={cn("absolute z-10 rounded border-l-[3px] px-2 py-1 cursor-pointer hover:brightness-95 transition-all overflow-hidden", s.bg, s.border, s.text)}
					style={{ top, height, left: `calc(${col * colWidth}% + 2px)`, width: `calc(${colWidth}% - 4px)` }}
					onClick={() => handleAppointmentClick(appt)}
				>
					<div className="font-semibold text-xs truncate leading-tight">{appt.title}</div>
					<div className="text-xs opacity-80 truncate">{appt.clientName}</div>
					{height > 44 && <div className="text-xs opacity-60 truncate">{formatTime(start)} – {formatTime(end)}</div>}
					{height > 60 && <span className={cn("inline-block mt-0.5 rounded text-[10px] px-1 py-0.5", s.badge)}>{s.label}</span>}
				</div>
			);
		};

		const renderBuffers = (sortedAppts: Appointment[]) =>
			sortedAppts.slice(0, -1).map((appt, i) => {
				const end = new Date(appt.end);
				const nextStart = new Date(sortedAppts[i + 1].start);
				const bufferMins = Math.round((nextStart.getTime() - end.getTime()) / 60000);
				if (bufferMins < 5) return null;
				const top = ((end.getHours() - gridStart) * 60 + end.getMinutes()) * PX_PER_MIN;
				const height = bufferMins * PX_PER_MIN;
				if (height < 14) return null;
				const label = bufferMins >= 60
					? `${Math.floor(bufferMins / 60)}h${bufferMins % 60 > 0 ? ` ${bufferMins % 60}m` : ""} buffer`
					: `${bufferMins}m buffer`;
				return (
					<div key={`buf-${i}`} className="absolute left-0 right-0 z-0 flex items-center justify-center" style={{ top, height }}>
						<div className="w-full h-full border-y border-dashed border-gray-300 bg-gray-50/60 flex items-center justify-center gap-1 text-[11px] text-gray-400 pointer-events-none">
							<Clock className="h-3 w-3 shrink-0" />{label}
						</div>
					</div>
				);
			});

		// ── Empty state ──
		if (appts.length === 0) {
			return (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
					<Calendar className="h-12 w-12 text-gray-300" />
					<p className="text-base font-medium">No appointments this day</p>
					<Button size="sm" onClick={openAddModal}><Plus className="h-4 w-4 mr-2" />Add Appointment</Button>
				</div>
			);
		}

		// ── Multi-trainer columns mode (admin viewing all trainers) ──
		const isMultiTrainer = defaultTrainerId === null && appts.some((a) => a.assignedTo);
		if (isMultiTrainer) {
			const TRAINER_COL_WIDTH = 200;

			// Group appointments by trainer
			const trainerMap = new Map<string, { name: string; color?: string; appts: Appointment[] }>();
			for (const appt of appts) {
				const id = appt.assignedTo?.id ?? "__unassigned__";
				const name = appt.assignedTo?.name ?? "Unassigned";
				if (!trainerMap.has(id)) trainerMap.set(id, { name, color: appt.assignedTo?.color, appts: [] });
				trainerMap.get(id)!.appts.push(appt);
			}
			const trainers = Array.from(trainerMap.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name));

			return (
				<div ref={gridContainerRef} className="overflow-auto rounded-lg border border-gray-200" style={{ maxHeight: 600 }}>
					{/* Sticky trainer name headers */}
					<div className="sticky top-0 z-30 flex border-b border-gray-200 bg-white">
						<div className="shrink-0 w-16 border-r border-gray-200 bg-gray-50" />
						{trainers.map(([id, { name, color }]) => (
							<div
								key={id}
								className="flex items-center gap-1.5 border-r border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 bg-white"
								style={{ minWidth: TRAINER_COL_WIDTH }}
							>
								{color && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
								<span className="truncate">{name}</span>
							</div>
						))}
					</div>

					{/* Grid rows */}
					<div className="relative flex" style={{ height: gridHeight }}>
						{/* Sticky hour labels */}
						<div className="sticky left-0 z-20 shrink-0 w-16 border-r border-gray-200 bg-gray-50">
							{hours.map((h) => (
								<div key={h} className="flex items-start justify-end pr-2 text-xs text-gray-400" style={{ height: PX_PER_HOUR, paddingTop: 2 }}>
									{formatHour(h)}
								</div>
							))}
						</div>

						{/* One column per trainer */}
						{trainers.map(([id, { appts: trainerAppts }]) => {
							const sorted = [...trainerAppts].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
							const withCols = assignColumns(sorted);
							return (
								<div key={id} className="relative border-r border-gray-100" style={{ minWidth: TRAINER_COL_WIDTH }}>
									{renderHourLines()}
									{renderNowLine()}
									{withCols.map(({ appt, col, totalCols }) => renderCard(appt, col, totalCols))}
									{renderBuffers(sorted)}
								</div>
							);
						})}
					</div>
				</div>
			);
		}

		// ── Single-column mode (specific trainer selected, or trainer viewing own schedule) ──
		const withCols = assignColumns(appts);
		return (
			<div ref={gridContainerRef} className="relative overflow-y-auto rounded-lg border border-gray-200" style={{ maxHeight: 600 }}>
				<div className="relative flex" style={{ height: gridHeight }}>
					<div className="shrink-0 w-16 border-r border-gray-200 bg-gray-50">
						{hours.map((h) => (
							<div key={h} className="flex items-start justify-end pr-2 text-xs text-gray-400" style={{ height: PX_PER_HOUR, paddingTop: 2 }}>
								{formatHour(h)}
							</div>
						))}
					</div>
					<div className="relative flex-1">
						{renderHourLines()}
						{renderNowLine()}
						{withCols.map(({ appt, col, totalCols }) => renderCard(appt, col, totalCols))}
						{renderBuffers(appts)}
					</div>
				</div>
			</div>
		);
	};

	// ── Month / Week grid ────────────────────────────────────────────────────
	const renderCalendarGrid = () => {
		if (view === "daily") return renderDayView();

		const minHeight = view === "monthly" ? "min-h-[120px]" : "min-h-[150px]";

		return (
			<div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
				{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
					<div key={day} className="bg-gray-50 p-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
						{day}
					</div>
				))}
				{calendarDays.map((date, i) => (
					<React.Fragment key={i}>{renderSimpleCell(date, minHeight)}</React.Fragment>
				))}
			</div>
		);
	};

	// ── Appointment detail modal ─────────────────────────────────────────────
	const renderAppointmentDetailModal = () => {
		if (!selectedAppointment) return null;

		const formatDate = (date: Date) =>
			date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

		const formatDuration = (start: Date, end: Date) => {
			const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
			const h = Math.floor(mins / 60);
			const m = mins % 60;
			return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
		};

		const s = statusStyle(selectedAppointment.status);

		return (
			<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
				<Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
						<div className="flex items-center gap-2">
							<CalendarIcon className="h-5 w-5 text-muted-foreground" />
							<CardTitle className="text-xl font-semibold">Appointment Details</CardTitle>
						</div>
						<Button variant="ghost" size="sm" onClick={closeAppointmentModal} className="h-8 w-8 p-0">
							<X className="h-4 w-4" />
						</Button>
					</CardHeader>
					<CardContent className="overflow-y-auto max-h-[70vh] space-y-6">
						<div className="flex justify-between items-start">
							<Badge variant="secondary" className={cn("text-sm px-3 py-1", s.badge)}>{s.label}</Badge>
							{selectedAppointment.status === "pending" && (
								<div className="flex gap-2">
									<Button size="sm" disabled={updateMutation.isPending}
										onClick={() => updateMutation.mutate({ id: selectedAppointment.id, status: "confirmed" }, {
											onSuccess: () => { toast.success("Marked as Came"); queryClient.invalidateQueries({ queryKey: ["appointments"] }); closeAppointmentModal(); },
											onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"),
										})}
										className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
									>
										Mark as Came
									</Button>
									<Button size="sm" variant="outline" disabled={updateMutation.isPending}
										onClick={() => updateMutation.mutate({ id: selectedAppointment.id, status: "cancelled" }, {
											onSuccess: () => { toast.success("Marked as No-show"); queryClient.invalidateQueries({ queryKey: ["appointments"] }); closeAppointmentModal(); },
											onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"),
										})}
										className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
									>
										Mark as No-show
									</Button>
								</div>
							)}
						</div>

						<div>
							<h2 className="text-2xl font-bold mb-1">{selectedAppointment.title}</h2>
							<p className="text-muted-foreground">{selectedAppointment.service}</p>
						</div>

						<div className="space-y-2">
							<h3 className="text-sm font-semibold flex items-center gap-2"><CalendarIcon className="h-4 w-4" />Date & Time</h3>
							<div className="bg-muted/30 rounded-lg p-4 text-sm space-y-1.5">
								<div className="flex justify-between"><span className="font-medium">Date</span><span>{formatDate(new Date(selectedAppointment.start))}</span></div>
								<div className="flex justify-between"><span className="font-medium">Start</span><span>{formatTime(new Date(selectedAppointment.start))}</span></div>
								<div className="flex justify-between"><span className="font-medium">End</span><span>{formatTime(new Date(selectedAppointment.end))}</span></div>
								<div className="flex justify-between"><span className="font-medium">Duration</span><span>{formatDuration(new Date(selectedAppointment.start), new Date(selectedAppointment.end))}</span></div>
							</div>
						</div>

						<div className="space-y-2">
							<h3 className="text-sm font-semibold flex items-center gap-2"><User className="h-4 w-4" />Client</h3>
							<div className="bg-muted/30 rounded-lg p-4 text-sm space-y-1.5">
								<div className="flex justify-between"><span className="font-medium">Name</span><span>{selectedAppointment.clientName}</span></div>
								{selectedAppointment.clientEmail && (
									<div className="flex justify-between">
										<span className="font-medium flex items-center gap-1"><Mail className="h-3 w-3" />Email</span>
										<span>{selectedAppointment.clientEmail}</span>
									</div>
								)}
								{selectedAppointment.clientPhone && (
									<div className="flex justify-between">
										<span className="font-medium flex items-center gap-1"><Phone className="h-3 w-3" />Phone</span>
										<span>{selectedAppointment.clientPhone}</span>
									</div>
								)}
							</div>
						</div>

						{selectedAppointment.location && (
							<div className="space-y-2">
								<h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" />Location</h3>
								<div className="bg-muted/30 rounded-lg p-4 text-sm">{selectedAppointment.location}</div>
							</div>
						)}

						{selectedAppointment.notes && (
							<div className="space-y-2">
								<h3 className="text-sm font-semibold">Notes</h3>
								<div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap">{selectedAppointment.notes}</div>
							</div>
						)}

						<div className="flex gap-3 pt-4 border-t">
							<Button variant="outline" onClick={closeAppointmentModal} className="flex-1">Close</Button>
							<Button onClick={() => { setEditingAppointment(selectedAppointment); closeAppointmentModal(); setShowAddModal(true); }} className="flex-1">
								Edit
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	};

	return (
		<>
			<Card className="w-full">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
					<CardTitle className="text-xl font-semibold">Appointments</CardTitle>
					<div className="flex items-center gap-2">
						{isGroupSelectMode && selectedAppointments.size > 0 && (
							<div className="flex gap-2">
								<Button size="sm" onClick={() => handleBulkStatusChange("confirmed")} className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">
									Came ({selectedAppointments.size})
								</Button>
								<Button size="sm" variant="outline" onClick={() => handleBulkStatusChange("cancelled")} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
									No-show ({selectedAppointments.size})
								</Button>
							</div>
						)}
						<Button variant="outline" size="sm" onClick={openAddModal}>
							<Plus className="h-4 w-4 mr-2" />
							Add Appointment
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{/* View switcher + Status filters */}
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center bg-gray-100 rounded-lg p-1 gap-0.5">
							<button
								onClick={() => setView("monthly")}
								className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all", view === "monthly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900")}
							>
								<Calendar className="h-4 w-4" />Month
							</button>
							<button
								onClick={() => setView("weekly")}
								className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all", view === "weekly" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900")}
							>
								<CalendarDays className="h-4 w-4" />Week
							</button>
							<button
								onClick={() => setView("daily")}
								className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all", view === "daily" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900")}
							>
								<Clock className="h-4 w-4" />Day
							</button>
						</div>

						<div className="flex items-center gap-2 text-sm">
							<button
								onClick={() => setShowConfirmed(!showConfirmed)}
								className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors", showConfirmed ? "bg-green-50 border-green-200 text-green-700" : "border-gray-200 text-gray-400")}
							>
								<div className={cn("h-2.5 w-2.5 rounded-full", showConfirmed ? "bg-green-500" : "bg-gray-300")} />
								Came
							</button>
							<button
								onClick={() => setShowCancelled(!showCancelled)}
								className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors", showCancelled ? "bg-red-50 border-red-200 text-red-700" : "border-gray-200 text-gray-400")}
							>
								<div className={cn("h-2.5 w-2.5 rounded-full", showCancelled ? "bg-red-500" : "bg-gray-300")} />
								No-show
							</button>
						</div>
					</div>

					{/* Navigation */}
					<div className="flex items-center justify-between mb-4">
						<Button variant="outline" size="sm" onClick={prevPeriod} className="h-8 w-8 p-0">
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<div className="flex items-center gap-2">
							<h2 className="text-base font-semibold">{dateDisplay}</h2>
							<button
								className="text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50"
								onClick={() => setCurrentDate(new Date())}
							>
								Today
							</button>
						</div>
						<Button variant="outline" size="sm" onClick={nextPeriod} className="h-8 w-8 p-0">
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>

					{renderCalendarGrid()}

					<div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
						<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Came (confirmed)</span>
						<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400 inline-block" />Upcoming (pending)</span>
						<span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />No-show (cancelled)</span>
					</div>
				</CardContent>
			</Card>

			{renderAppointmentDetailModal()}

			<AddAppointmentModal
				isOpen={showAddModal}
				onClose={closeAddModal}
				onSubmit={handleSubmitAppointment}
				teamMembers={[]}
				selectedDate={selectedDate || undefined}
				defaultTrainerId={defaultTrainerId}
			/>
		</>
	);
}

export default AppointmentCalendar;
