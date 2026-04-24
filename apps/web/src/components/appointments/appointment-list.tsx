"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, CalendarDays, Clock, ChevronLeft, ChevronRight, ClipboardCheck, CheckCircle2, XCircle, User, CalendarDays as CalendarIcon, Pencil, LayoutList, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { AddAppointmentModal } from "@/components/calendar/add-appointment-modal";
import type { CalendarAppointment } from "@/lib/appointment-mapper";

interface AppointmentListProps {
	appointments: CalendarAppointment[];
	isLoading?: boolean;
	defaultTrainerId?: string | null;
}

const STATUS = {
	confirmed: {
		label: "Came",
		badge: "border-gray-200 bg-gray-100 text-gray-600",
		stripe: "bg-emerald-400",
		dot: "bg-emerald-400",
	},
	pending: {
		label: null,
		badge: "",
		stripe: "bg-amber-400",
		dot: "bg-amber-400",
	},
	cancelled: {
		label: "No-show",
		badge: "border-gray-200 bg-gray-100 text-gray-600",
		stripe: "bg-rose-400",
		dot: "bg-rose-400",
	},
} satisfies Record<CalendarAppointment["status"], { label: string | null; badge: string; stripe: string; dot: string }>;

function formatTime(date: Date) {
	return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDuration(start: Date, end: Date) {
	const mins = Math.round((end.getTime() - start.getTime()) / 60000);
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getInitials(name: string) {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function isToday(date: Date) {
	const t = new Date();
	return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

function isTomorrow(date: Date) {
	const t = new Date();
	t.setDate(t.getDate() + 1);
	return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

function formatDateHeader(date: Date) {
	if (isToday(date)) return { label: "Today", sub: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
	if (isTomorrow(date)) return { label: "Tomorrow", sub: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
	return {
		label: date.toLocaleDateString("en-US", { weekday: "long" }),
		sub: date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
	};
}

function groupByDate(appointments: CalendarAppointment[]): Map<string, CalendarAppointment[]> {
	const map = new Map<string, CalendarAppointment[]>();
	const sorted = [...appointments].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
	for (const appt of sorted) {
		const d = new Date(appt.start);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(appt);
	}
	return map;
}

export function AppointmentList({ appointments, isLoading, defaultTrainerId }: AppointmentListProps) {
	const [view, setView] = useState<"list" | "card">("list");
	const [showAddModal, setShowAddModal] = useState(false);
	const [attendanceApptId, setAttendanceApptId] = useState<string | null>(null);
	const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
	const [editAppt, setEditAppt] = useState<CalendarAppointment | null>(null);
	const [editForm, setEditForm] = useState<{ date: string; time: string; duration: number; notes: string; description: string } | null>(null);
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const scrollRef = useRef<HTMLDivElement>(null);
	const todayRef = useRef<HTMLDivElement>(null);

	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";
	const org = userCtx?.organizations.find((o) => o.id === organizationId);
	const branchId = org?.hierarchy.member?.hierarchyScopeId ?? "";

	const createMutation = useApiMutation({
		mutationFn: (params: { start: Date; duration: number; notes?: string; userId?: string | null }) =>
			client.appointments.create({
				organizationId,
				type: "private",
				startTime: params.start.toISOString(),
				duration: params.duration,
				branchId,
				sessionTotal: 1,
				pricePerClient: 0,
				notes: params.notes ?? null,
				userId: params.userId ?? null,
			}),
		successMessage: "Appointment created",
		errorMessage: (err) => err.message || "Failed to create appointment",
		invalidate: [["appointments"]],
		onSuccess: () => {
			setShowAddModal(false);
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: (params: { id: string; status: "confirmed" | "cancelled" }) =>
			client.appointments.update({ organizationId, id: params.id, status: params.status }),
		errorMessage: (err) => err.message || "Failed to update appointment",
		invalidate: [["appointments"]],
	});

	const editMutation = useApiMutation({
		mutationFn: (params: {
			id: string;
			startTime: string;
			duration: number;
			notes: string;
			description: string;
		}) =>
			client.appointments.update({
				organizationId,
				id: params.id,
				startTime: params.startTime,
				duration: params.duration,
				notes: params.notes || null,
				description: params.description || null,
			}),
		successMessage: "Appointment updated",
		errorMessage: (err) => err.message || "Failed to update appointment",
		invalidate: [["appointments"]],
		onSuccess: () => {
			setEditAppt(null);
			setEditForm(null);
		},
	});

	useEffect(() => {
		if (isLoading) return;
		if (todayRef.current && scrollRef.current) {
			const offset = todayRef.current.offsetTop - 16;
			scrollRef.current.scrollTop = Math.max(0, offset);
		}
	}, [isLoading]);

	const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
	const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);

	const filtered = appointments.filter((a) => {
		const d = new Date(a.start);
		return d >= monthStart && d <= monthEnd;
	});

	const grouped = groupByDate(filtered);
	const dateKeys = Array.from(grouped.keys());

	const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

	const _tnow = new Date();
	const _todayKey = `${_tnow.getFullYear()}-${String(_tnow.getMonth() + 1).padStart(2, "0")}-${String(_tnow.getDate()).padStart(2, "0")}`;
	const _isCurrMonth = currentMonth.getFullYear() === _tnow.getFullYear() && currentMonth.getMonth() === _tnow.getMonth();
	const _todayInList = dateKeys.includes(_todayKey);
	const _insertBeforeKey = (_isCurrMonth && !_todayInList)
		? (dateKeys.find((k) => k > _todayKey) ?? null)
		: null;
	const _anchorAtEnd = _isCurrMonth && !_todayInList && _insertBeforeKey === null && dateKeys.length > 0;

	function openEdit(appt: CalendarAppointment) {
		const s = new Date(appt.start);
		const pad = (n: number) => String(n).padStart(2, "0");
		setEditForm({
			date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
			time: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
			duration: Math.round((new Date(appt.end).getTime() - s.getTime()) / 60000),
			notes: "",
			description: "",
		});
		setSelectedAppt(null);
		setEditAppt(appt);
	}

	return (
		<>
			<Card className="h-full flex flex-col shadow-sm border-gray-100 rounded-2xl overflow-hidden">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 px-6 py-4 border-b border-gray-100 shrink-0 bg-white">
					<div className="flex items-center gap-4">
						<CardTitle className="text-xl font-semibold">Appointments</CardTitle>
						<div className="flex items-center gap-1.5">
							<Button
								variant="ghost"
								size="sm"
								className="h-8 w-8 p-0 rounded-full"
								onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<span className="text-base font-semibold min-w-[140px] text-center">{monthLabel}</span>
							<Button
								variant="ghost"
								size="sm"
								className="h-8 w-8 p-0 rounded-full"
								onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
							<button
								type="button"
								className="ml-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-full hover:bg-blue-50 border border-blue-100 transition-colors"
								onClick={() => {
									setCurrentMonth(new Date());
									setTimeout(() => {
										if (todayRef.current && scrollRef.current) {
											scrollRef.current.scrollTop = Math.max(0, todayRef.current.offsetTop - 16);
										}
									}, 0);
								}}
							>
								Today
							</button>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{/* View toggle */}
						<div className="flex items-center rounded-xl border border-gray-200 p-0.5 bg-gray-50">
							<button
								type="button"
								onClick={() => setView("list")}
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
									view === "list" ? "bg-white shadow-sm text-gray-800" : "text-gray-400 hover:text-gray-600",
								)}
							>
								<LayoutList className="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								onClick={() => setView("card")}
								className={cn(
									"flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
									view === "card" ? "bg-white shadow-sm text-gray-800" : "text-gray-400 hover:text-gray-600",
								)}
							>
								<LayoutGrid className="h-3.5 w-3.5" />
							</button>
						</div>
						<Button size="sm" onClick={() => setShowAddModal(true)} className="gap-2 rounded-xl">
							<Plus className="h-4 w-4" />
							Add Appointment
						</Button>
					</div>
				</CardHeader>

				<CardContent className="flex-1 overflow-hidden p-0">
					<div
						ref={scrollRef}
						className="h-full overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full"
					>
						{isLoading ? (
							<div className="space-y-3">
								{[1, 2, 3, 4].map((i) => (
									<div key={i} className="h-16 rounded-xl animate-pulse bg-gray-50" />
								))}
							</div>
						) : dateKeys.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
								<CalendarDays className="h-12 w-12 text-gray-200" />
								<p className="text-sm font-medium text-gray-500">No appointments in {monthLabel}</p>
								<Button size="sm" variant="outline" onClick={() => setShowAddModal(true)}>
									<Plus className="h-4 w-4 mr-1.5" />
									Add Appointment
								</Button>
							</div>
						) : (
							<div className="space-y-10">
								{dateKeys.map((key) => {
									const dayAppts = grouped.get(key)!;
									const dateObj = new Date(dayAppts[0].start);
									const { label, sub } = formatDateHeader(dateObj);
									const todayDate = isToday(dateObj);

									return (
										<>
										{_insertBeforeKey === key && <div key="today-anchor" ref={todayRef} />}
										<div key={key} ref={todayDate ? todayRef : undefined}>
											{/* Date group header */}
											<div className="flex items-center gap-3 mb-4">
												<div
													className={cn(
														"flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full text-center",
														todayDate ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700",
													)}
												>
													<span className="text-[10px] font-semibold leading-none tracking-wide">
														{dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
													</span>
													<span className="text-lg font-bold leading-none mt-1">{dateObj.getDate()}</span>
												</div>
												<div>
													<p className={cn("text-sm font-semibold", todayDate ? "text-blue-600" : "text-gray-800")}>{label}</p>
													<p className="text-xs text-muted-foreground">{sub}</p>
												</div>
												<div className="flex-1 h-px bg-gray-100 ml-1" />
												<span className="text-xs text-muted-foreground shrink-0">
													{dayAppts.length} appointment{dayAppts.length !== 1 ? "s" : ""}
												</span>
											</div>

											{/* ── List view ── */}
											{view === "list" && (
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
																onClick={() => setSelectedAppt(appt)}
																onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedAppt(appt); }}
																className="flex flex-col rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer"
															>
																<div className="flex items-stretch">
																	<div className="flex flex-col items-center justify-center px-5 py-4 min-w-[88px] shrink-0 bg-gray-50/60">
																		<span className="text-sm font-bold text-gray-800">{formatTime(start)}</span>
																		<span className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
																			<Clock className="h-3 w-3" />
																			{formatDuration(start, end)}
																		</span>
																	</div>

																	<div className="w-px self-stretch bg-gray-100 shrink-0" />

																	<div className="flex flex-1 min-w-0 items-center gap-4 px-5 py-4">
																		<div className="flex-1 min-w-0">
																			<p className="text-sm font-semibold text-gray-900 truncate">{appt.title}</p>
																			{appt.service && appt.service !== "—" && (
																				<p className="text-xs text-muted-foreground truncate mt-0.5">{appt.service}</p>
																			)}
																		</div>

																		<div className="hidden sm:flex flex-col w-32 shrink-0">
																			<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Client</span>
																			<span className="text-xs text-gray-700 truncate mt-0.5">{appt.clientName}</span>
																		</div>

																		<div className="hidden md:flex flex-col w-36 shrink-0">
																			<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Trainer</span>
																			{trainerName ? (
																				<div className="flex items-center gap-1.5 mt-0.5">
																					<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold">
																						{getInitials(trainerName)}
																					</span>
																					<span className="text-xs text-gray-700 truncate">{trainerName}</span>
																				</div>
																			) : (
																				<span className="text-xs text-muted-foreground mt-0.5">—</span>
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
																				onClick={(e) => { e.stopPropagation(); setAttendanceApptId(appt.id); }}
																			>
																				<ClipboardCheck className="h-3.5 w-3.5" />
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
											)}

											{/* ── Card view ── */}
											{view === "card" && (
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
																onClick={() => setSelectedAppt(appt)}
																onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedAppt(appt); }}
																className="flex flex-col rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer"
															>
																<div className="flex flex-col flex-1 px-4 pt-4 pb-3 gap-3">
																	{/* Time row */}
																	<div className="flex items-center justify-between gap-2">
																		<div className="flex items-center gap-1.5 text-xs text-gray-500">
																			<Clock className="h-3 w-3 shrink-0" />
																			<span className="font-semibold text-gray-800">{formatTime(start)}</span>
																			<span>·</span>
																			<span>{formatDuration(start, end)}</span>
																		</div>
																		{cfg.label ? (
																			<Badge variant="outline" className={cn("text-xs font-medium px-2 py-0 rounded-full border", cfg.badge)}>
																				{cfg.label}
																			</Badge>
																		) : (
																			<span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-400" />
																		)}
																	</div>

																	{/* Title + service */}
																	<div className="min-w-0">
																		<p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{appt.title}</p>
																		{appt.service && appt.service !== "—" && (
																			<p className="text-xs text-muted-foreground mt-0.5 truncate">{appt.service}</p>
																		)}
																	</div>

																	{/* Client + Trainer */}
																	<div className="flex flex-col gap-1.5">
																		{appt.clientName && (
																			<div className="flex items-center gap-1.5">
																				<User className="h-3 w-3 text-gray-400 shrink-0" />
																				<span className="text-xs text-gray-600 truncate">{appt.clientName}</span>
																			</div>
																		)}
																		{trainerName && (
																			<div className="flex items-center gap-1.5">
																				<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[8px] font-bold">
																					{getInitials(trainerName)}
																				</span>
																				<span className="text-xs text-gray-600 truncate">{trainerName}</span>
																			</div>
																		)}
																	</div>

																	{appt.status === "pending" && (
																		<Button
																			size="sm"
																			variant="outline"
																			className="w-full h-7 text-xs rounded-lg gap-1.5 mt-auto"
																			onClick={(e) => { e.stopPropagation(); setAttendanceApptId(appt.id); }}
																		>
																			<ClipboardCheck className="h-3.5 w-3.5" />
																			Mark Attendance
																		</Button>
																	)}
																</div>
																<div className={cn("h-0.5 w-full shrink-0", cfg.stripe)} />
															</div>
														);
													})}
												</div>
											)}
										</div>
										</>
									);
								})}
								{_anchorAtEnd && <div ref={todayRef} />}
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{/* ── Appointment Detail Dialog ── */}
			<Dialog open={selectedAppt !== null} onOpenChange={(open) => { if (!open) setSelectedAppt(null); }}>
				<DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl gap-0">
					{selectedAppt && (() => {
						const appt = selectedAppt;
						const cfg = STATUS[appt.status];
						const start = new Date(appt.start);
						const end = new Date(appt.end);
						const trainerName = appt.assignedTo?.name;
						const weekday = start.toLocaleDateString("en-US", { weekday: "long" });
						const dateStr = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
						return (
							<>
								{/* Header */}
								<div className="px-6 pt-6 pb-5 border-b border-gray-100">
									<div className="flex items-start gap-4">
										<div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gray-100 text-gray-700 text-center">
											<span className="text-[10px] font-semibold leading-none tracking-wide">
												{start.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}
											</span>
											<span className="text-xl font-bold leading-none mt-0.5">{start.getDate()}</span>
										</div>
										<div className="flex-1 min-w-0 pt-0.5">
											<DialogHeader className="p-0 space-y-0">
												<DialogTitle className="text-base font-bold text-gray-900 leading-snug">{appt.title}</DialogTitle>
												{appt.service && appt.service !== "—" && (
													<DialogDescription className="text-xs text-muted-foreground mt-0.5">{appt.service}</DialogDescription>
												)}
											</DialogHeader>
											<div className="flex items-center gap-1.5 mt-2 flex-wrap">
												<span className="text-xs font-semibold text-gray-700">{weekday}</span>
												<span className="text-xs text-gray-400">·</span>
												<span className="text-xs text-gray-500">{formatTime(start)}</span>
												<span className="text-xs text-gray-400">·</span>
												<span className="text-xs text-gray-500">{formatDuration(start, end)}</span>
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
									<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
											<CalendarIcon className="h-3.5 w-3.5 text-gray-500" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[11px] text-gray-400 font-medium">Date</p>
											<p className="text-sm text-gray-800 font-medium">{dateStr}</p>
										</div>
									</div>
									<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
										<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
											<Clock className="h-3.5 w-3.5 text-gray-500" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-[11px] text-gray-400 font-medium">Time</p>
											<p className="text-sm text-gray-800 font-medium">{formatTime(start)} – {formatTime(end)} <span className="text-gray-400 font-normal">({formatDuration(start, end)})</span></p>
										</div>
									</div>
									{appt.clientName && (
										<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
												<User className="h-3.5 w-3.5 text-gray-500" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-[11px] text-gray-400 font-medium">Client</p>
												<p className="text-sm text-gray-800 font-medium">{appt.clientName}</p>
											</div>
										</div>
									)}
									{trainerName && (
										<div className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold">
												{getInitials(trainerName)}
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-[11px] text-gray-400 font-medium">Trainer</p>
												<p className="text-sm text-gray-800 font-medium">{trainerName}</p>
											</div>
										</div>
									)}
								</div>

								{/* Footer actions */}
								<div className="px-5 pb-5 pt-0 bg-white flex flex-col gap-2">
									<button
										type="button"
										onClick={() => openEdit(appt)}
										className="flex items-center justify-center gap-2 w-full rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
									>
										<Pencil className="h-3.5 w-3.5" />
										Edit Appointment
									</button>
									{appt.status === "pending" && (
										<Button
											className="w-full gap-2 rounded-xl h-10"
											onClick={() => { setSelectedAppt(null); setAttendanceApptId(appt.id); }}
										>
											<ClipboardCheck className="h-4 w-4" />
											Mark Attendance
										</Button>
									)}
								</div>
							</>
						);
					})()}
				</DialogContent>
			</Dialog>

			{/* ── Attendance Dialog ── */}
			<Dialog open={attendanceApptId !== null} onOpenChange={(open) => { if (!open) setAttendanceApptId(null); }}>
				<DialogContent className="sm:max-w-sm p-0 overflow-hidden rounded-2xl gap-0">
					{(() => {
						const appt = appointments.find((a) => a.id === attendanceApptId);
						const start = appt ? new Date(appt.start) : null;
						const end = appt ? new Date(appt.end) : null;
						return (
							<>
								{/* Header */}
								<div className="px-6 pt-6 pb-5 border-b border-gray-100">
									<div className="flex items-start gap-4">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
											<ClipboardCheck className="h-4.5 w-4.5 text-gray-500" />
										</div>
										<div className="flex-1 min-w-0">
											<DialogHeader className="p-0 space-y-0">
												<DialogTitle className="text-base font-bold text-gray-900">
													{appt ? appt.title : "Mark Attendance"}
												</DialogTitle>
												{appt && start && end && (
													<DialogDescription className="text-xs text-muted-foreground mt-0.5">{appt.clientName}</DialogDescription>
												)}
											</DialogHeader>
											{start && end && (
												<div className="flex items-center gap-1.5 mt-1.5">
													<span className="text-xs font-medium text-gray-600">
														{start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
													</span>
													<span className="text-xs text-gray-400">·</span>
													<span className="text-xs text-gray-500">{formatTime(start)}</span>
													<span className="text-xs text-gray-400">·</span>
													<span className="text-xs text-gray-500">{formatDuration(start, end)}</span>
												</div>
											)}
										</div>
									</div>
								</div>

								{/* Options */}
								<div className="px-4 py-4 flex flex-col gap-2 bg-white">
									<button
										type="button"
										disabled={updateMutation.isPending}
										onClick={() => {
											if (!attendanceApptId) return;
											updateMutation.mutate(
												{ id: attendanceApptId, status: "confirmed" },
												{ onSuccess: () => { toast.success("Marked as Attended"); setAttendanceApptId(null); } },
											);
										}}
										className="group flex items-center gap-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-all hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
									>
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-emerald-100 transition-colors">
											<CheckCircle2 className="h-4.5 w-4.5 text-gray-400 group-hover:text-emerald-600 transition-colors" />
										</div>
										<div>
											<p className="text-sm font-semibold text-gray-900">Attended</p>
											<p className="text-xs text-gray-400 mt-0.5">Client showed up on time</p>
										</div>
									</button>

									<button
										type="button"
										disabled={updateMutation.isPending}
										onClick={() => {
											if (!attendanceApptId) return;
											updateMutation.mutate(
												{ id: attendanceApptId, status: "cancelled" },
												{ onSuccess: () => { toast.success("Marked as No-show"); setAttendanceApptId(null); } },
											);
										}}
										className="group flex items-center gap-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-all hover:bg-gray-50 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
									>
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 group-hover:bg-rose-100 transition-colors">
											<XCircle className="h-4.5 w-4.5 text-gray-400 group-hover:text-rose-500 transition-colors" />
										</div>
										<div>
											<p className="text-sm font-semibold text-gray-900">No-show</p>
											<p className="text-xs text-gray-400 mt-0.5">Client did not attend</p>
										</div>
									</button>
								</div>

								{/* Cancel */}
								<div className="px-4 pb-4 pt-0 bg-white">
									<button
										type="button"
										onClick={() => setAttendanceApptId(null)}
										className="w-full rounded-xl border border-gray-100 py-2.5 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
									>
										Cancel
									</button>
								</div>
							</>
						);
					})()}
				</DialogContent>
			</Dialog>

			{/* ── Edit Appointment Dialog ── */}
			<Dialog
				open={editAppt !== null}
				onOpenChange={(open) => { if (!open) { setEditAppt(null); setEditForm(null); } }}
			>
				<DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl gap-0">
					{editAppt && editForm && (() => {
						const DURATIONS = [15, 30, 45, 60, 75, 90, 120] as const;
						return (
							<>
								{/* Header */}
								<div className="px-6 pt-6 pb-5 border-b border-gray-100">
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
											<Pencil className="h-4 w-4 text-gray-500" />
										</div>
										<DialogHeader className="p-0 space-y-0">
											<DialogTitle className="text-base font-bold text-gray-900">Edit Appointment</DialogTitle>
											<DialogDescription className="text-xs text-muted-foreground mt-0.5">{editAppt.title}</DialogDescription>
										</DialogHeader>
									</div>
								</div>

								{/* Form */}
								<div className="px-6 py-5 space-y-4 bg-white">
									<div className="grid grid-cols-2 gap-3">
										<div className="space-y-1.5">
											<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
											<input
												type="date"
												value={editForm.date}
												onChange={(e) => setEditForm((f) => f ? { ...f, date: e.target.value } : f)}
												className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors"
											/>
										</div>
										<div className="space-y-1.5">
											<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</label>
											<input
												type="time"
												value={editForm.time}
												onChange={(e) => setEditForm((f) => f ? { ...f, time: e.target.value } : f)}
												className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors"
											/>
										</div>
									</div>

									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</label>
										<div className="flex flex-wrap gap-2">
											{DURATIONS.map((d) => (
												<button
													key={d}
													type="button"
													onClick={() => setEditForm((f) => f ? { ...f, duration: d } : f)}
													className={cn(
														"rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
														editForm.duration === d
															? "border-blue-500 bg-blue-500 text-white"
															: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
													)}
												>
													{d < 60 ? `${d}m` : d === 60 ? "1h" : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`}
												</button>
											))}
										</div>
									</div>

									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
										<textarea
											value={editForm.notes}
											onChange={(e) => setEditForm((f) => f ? { ...f, notes: e.target.value } : f)}
											placeholder="Internal notes..."
											rows={2}
											className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors resize-none"
										/>
									</div>

									<div className="space-y-1.5">
										<label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</label>
										<textarea
											value={editForm.description}
											onChange={(e) => setEditForm((f) => f ? { ...f, description: e.target.value } : f)}
											placeholder="Visible to client..."
											rows={2}
											className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors resize-none"
										/>
									</div>
								</div>

								{/* Actions */}
								<div className="px-6 pb-6 pt-0 bg-white flex gap-2.5">
									<button
										type="button"
										onClick={() => { setEditAppt(null); setEditForm(null); }}
										className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 font-medium hover:bg-gray-50 transition-colors"
									>
										Cancel
									</button>
									<Button
										className="flex-1 rounded-xl h-10 gap-2"
										disabled={editMutation.isPending || !editForm.date || !editForm.time}
										onClick={() => {
											if (!editAppt || !editForm) return;
											const [y, mo, d] = editForm.date.split("-").map(Number);
											const [h, min] = editForm.time.split(":").map(Number);
											const startTime = new Date(y!, mo! - 1, d!, h!, min!, 0, 0).toISOString();
											editMutation.mutate({ id: editAppt.id, startTime, duration: editForm.duration, notes: editForm.notes, description: editForm.description });
										}}
									>
										{editMutation.isPending ? "Saving..." : "Save Changes"}
									</Button>
								</div>
							</>
						);
					})()}
				</DialogContent>
			</Dialog>

			<AddAppointmentModal
				isOpen={showAddModal}
				onClose={() => setShowAddModal(false)}
				onSubmit={(appt) => {
					if (!organizationId) { toast.error("No organization selected."); return; }
					if (!branchId) { toast.error("Your account is not scoped to a branch."); return; }
					createMutation.mutate({
						start: new Date(appt.start),
						duration: appt.duration,
						notes: appt.remarks,
						userId: (appt as any).client?.userId ?? null,
					});
				}}
				teamMembers={[]}
				defaultTrainerId={defaultTrainerId}
			/>
		</>
	);
}
