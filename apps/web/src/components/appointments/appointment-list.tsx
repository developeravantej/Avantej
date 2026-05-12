"use client";

import { Fragment, useState, useRef, useEffect } from "react";
import { Plus, CalendarDays, ChevronLeft, ChevronRight, LayoutList, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { AddAppointmentModal } from "@/components/calendar/add-appointment-modal";
import type { CalendarAppointment } from "@/lib/appointment-mapper";
import {
	isToday,
	formatDateHeader,
	groupByDate,
} from "@/features/appointments/utils";
import { AppointmentDetailDialog } from "@/features/appointments/components/AppointmentDetailDialog";
import { AttendanceDialog } from "@/features/appointments/components/AttendanceDialog";
import { EditAppointmentDialog, type EditForm } from "@/features/appointments/components/EditAppointmentDialog";
import { DayListView, DayCardView } from "@/features/appointments/components/DayAppointmentViews";

interface AppointmentListProps {
	appointments: CalendarAppointment[];
	isLoading?: boolean;
	defaultTrainerId?: string | null;
}

export function AppointmentList({ appointments, isLoading, defaultTrainerId }: AppointmentListProps) {
	const [view, setView] = useState<"list" | "card">("list");
	const [showAddModal, setShowAddModal] = useState(false);
	const [attendanceApptId, setAttendanceApptId] = useState<string | null>(null);
	const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(null);
	const [editAppt, setEditAppt] = useState<CalendarAppointment | null>(null);
	const [editForm, setEditForm] = useState<EditForm | null>(null);
	const [currentMonth, setCurrentMonth] = useState(new Date());
	const scrollRef = useRef<HTMLDivElement>(null);
	const todayRef = useRef<HTMLDivElement>(null);

	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";
	const org = userCtx?.organizations.find((o) => o.id === organizationId);
	const branchId = org?.hierarchy.member?.hierarchyScopeId ?? "";

	const createMutation = useApiMutation({
		mutationFn: (params: {
			start: Date;
			duration: number;
			notes?: string;
			userId?: string | null;
			staffAssignments?: { staffId: string; slotIndex: number }[];
		}) =>
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
				staffAssignments: params.staffAssignments,
			}),
		successMessage: "Appointment created",
		// J3 — DB exclusion constraint surfaces overlap conflicts as a typed
		// CONFLICT error from the oRPC mapper. We detect it by message prefix
		// (the oRPC client serialises the code into the error message envelope
		// in some paths) so the user sees the precise reason instead of a
		// generic "failed to create" toast.
		errorMessage: (err) => {
			const msg = err.message || "Failed to create appointment";
			if (msg.startsWith("Conflict:")) return msg;
			return msg;
		},
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

	function handleSaveEdit() {
		if (!editAppt || !editForm) return;
		const [y, mo, d] = editForm.date.split("-").map(Number);
		const [h, min] = editForm.time.split(":").map(Number);
		const startTime = new Date(y!, mo! - 1, d!, h!, min!, 0, 0).toISOString();
		editMutation.mutate({ id: editAppt.id, startTime, duration: editForm.duration, notes: editForm.notes, description: editForm.description });
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
								className="size-8 p-0 rounded-full"
								onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
							>
								<ChevronLeft className="size-4" />
							</Button>
							<span className="text-base font-semibold min-w-[140px] text-center">{monthLabel}</span>
							<Button
								variant="ghost"
								size="sm"
								className="size-8 p-0 rounded-full"
								onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
							>
								<ChevronRight className="size-4" />
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
									"flex size-7 items-center justify-center rounded-lg transition-colors",
									view === "list" ? "bg-white shadow-sm text-gray-800" : "text-gray-400 hover:text-gray-600",
								)}
							>
								<LayoutList className="size-3.5" />
							</button>
							<button
								type="button"
								onClick={() => setView("card")}
								className={cn(
									"flex size-7 items-center justify-center rounded-lg transition-colors",
									view === "card" ? "bg-white shadow-sm text-gray-800" : "text-gray-400 hover:text-gray-600",
								)}
							>
								<LayoutGrid className="size-3.5" />
							</button>
						</div>
						<Button size="sm" onClick={() => setShowAddModal(true)} className="gap-2 rounded-xl">
							<Plus className="size-4" />
							Add Appointment
						</Button>
					</div>
				</CardHeader>

				<CardContent className="flex-1 overflow-hidden p-0">
					<div
						ref={scrollRef}
						className="h-full overflow-y-auto p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full"
					>
						{isLoading ? (
							<div className="space-y-3">
								{[1, 2, 3, 4].map((i) => (
									<div key={i} className="h-16 rounded-xl animate-pulse bg-gray-50" />
								))}
							</div>
						) : dateKeys.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
								<CalendarDays className="size-12 text-gray-200" />
								<p className="text-sm font-medium text-gray-500">No appointments in {monthLabel}</p>
								<Button size="sm" variant="outline" onClick={() => setShowAddModal(true)}>
									<Plus className="size-4 mr-1.5" />
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
										<Fragment key={key}>
										{_insertBeforeKey === key && <div ref={todayRef} />}
										<div ref={todayDate ? todayRef : undefined}>
											{/* Date group header */}
											<div className="flex items-center gap-3 mb-4">
												<div
													className={cn(
														"flex size-14 shrink-0 flex-col items-center justify-center rounded-full text-center",
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
												<DayListView
													dayAppts={dayAppts}
													onSelectAppt={setSelectedAppt}
													onMarkAttendance={(id) => setAttendanceApptId(id)}
												/>
											)}

											{/* ── Card view ── */}
											{view === "card" && (
												<DayCardView
													dayAppts={dayAppts}
													onSelectAppt={setSelectedAppt}
													onMarkAttendance={(id) => setAttendanceApptId(id)}
												/>
											)}
										</div>
										</Fragment>
									);
								})}
								{_anchorAtEnd && <div ref={todayRef} />}
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			<AppointmentDetailDialog
				appt={selectedAppt}
				organizationId={organizationId}
				onClose={() => setSelectedAppt(null)}
				onEdit={openEdit}
				onMarkAttendance={(id) => setAttendanceApptId(id)}
			/>

			<AttendanceDialog
				apptId={attendanceApptId}
				appointments={appointments}
				isPending={updateMutation.isPending}
				onClose={() => setAttendanceApptId(null)}
				onConfirm={(id) => {
					updateMutation.mutate(
						{ id, status: "confirmed" },
						{ onSuccess: () => { toast.success("Marked as Attended"); setAttendanceApptId(null); } },
					);
				}}
				onCancel={(id) => {
					updateMutation.mutate(
						{ id, status: "cancelled" },
						{ onSuccess: () => { toast.success("Marked as No-show"); setAttendanceApptId(null); } },
					);
				}}
			/>

			<EditAppointmentDialog
				appt={editAppt}
				editForm={editForm}
				isPending={editMutation.isPending}
				onFormChange={setEditForm}
				onClose={() => { setEditAppt(null); setEditForm(null); }}
				onSave={handleSaveEdit}
			/>

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
						userId: appt.client?.userId ?? null,
						staffAssignments: appt.staffAssignments,
					});
				}}
				teamMembers={[]}
				defaultTrainerId={defaultTrainerId}
			/>
		</>
	);
}
