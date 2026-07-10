import React, { useState, useMemo, useRef, useEffect } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Plus,
	Calendar,
	CalendarDays,
	Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AddAppointmentModal } from "./add-appointment-modal";
import { EditAppointmentModal } from "./edit-appointment-modal";
import { useUserContext } from "@/hooks/useUserContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";
import type { OnSubmitPayload } from "@/types/appointments";
import type {
	Appointment,
	CalendarView,
	CreateAppointmentParams,
} from "@/features/appointments/types";
import {
	PX_PER_HOUR,
	PX_PER_MIN,
	buildRecurrenceParams,
} from "@/features/appointments/utils";
import { CalendarDetailModal } from "@/features/appointments/components/CalendarDetailModal";
import { OccurrenceActionDialog } from "@/features/appointments/components/OccurrenceActionDialog";
import { DayTimeGrid } from "@/features/appointments/components/DayTimeGrid";
import { CalendarCell } from "@/features/appointments/components/CalendarCell";
import { useOccurrenceActions } from "@/features/appointments/hooks/useOccurrenceActions";

export type { Appointment, CalendarView };

const EMPTY_APPOINTMENTS: Appointment[] = [];

interface AppointmentCalendarProps {
	appointments?: Appointment[];
	onDateSelect?: (date: Date) => void;
	onAppointmentClick?: (appointment: Appointment) => void;
	onAddAppointment?: () => void;
	initialView?: CalendarView;
	defaultTrainerId?: string | null;
}

interface CalendarGridProps {
	view: CalendarView;
	currentDate: Date;
	calendarDays: Date[];
	defaultTrainerId?: string | null;
	gridContainerRef: React.RefObject<HTMLDivElement | null>;
	getSortedAppointmentsForDate: (date: Date) => Appointment[];
	isTodayDate: (date: Date) => boolean;
	isCurrentPeriod: (date: Date) => boolean;
	handleAppointmentClick: (appointment: Appointment) => void;
	handleDayCellClick: (date: Date) => void;
	openAddModal: () => void;
}

function CalendarGrid({
	view,
	currentDate,
	calendarDays,
	defaultTrainerId,
	gridContainerRef,
	getSortedAppointmentsForDate,
	isTodayDate,
	isCurrentPeriod,
	handleAppointmentClick,
	handleDayCellClick,
	openAddModal,
}: CalendarGridProps) {
	if (view === "daily") {
		return (
			<DayTimeGrid
				ref={gridContainerRef}
				appts={getSortedAppointmentsForDate(currentDate)}
				currentDate={currentDate}
				defaultTrainerId={defaultTrainerId}
				onAppointmentClick={handleAppointmentClick}
				onAddAppointment={openAddModal}
			/>
		);
	}
	const minHeight = view === "monthly" ? "min-h-[120px]" : "min-h-[150px]";
	return (
		<div className="grid grid-cols-7 gap-px bg-zinc-200 rounded-lg overflow-hidden">
			{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
				<div
					key={day}
					className="bg-zinc-50 p-2 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wide"
				>
					{day}
				</div>
			))}
			{calendarDays.map((date) => (
				<React.Fragment key={date.toISOString()}>
					<CalendarCell
						date={date}
						appts={getSortedAppointmentsForDate(date)}
						isTodayDate={isTodayDate(date)}
						inPeriod={view === "monthly" ? isCurrentPeriod(date) : true}
						minHeight={minHeight}
						onCellClick={handleDayCellClick}
					/>
				</React.Fragment>
			))}
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
export function AppointmentCalendar({
	appointments = EMPTY_APPOINTMENTS,
	onDateSelect,
	onAppointmentClick,
	onAddAppointment,
	initialView = "monthly",
	defaultTrainerId,
	// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}: AppointmentCalendarProps) {
	const [currentDate, setCurrentDate] = useState(new Date());
	// react-doctor-disable-next-line react-doctor/no-derived-useState -- uncontrolled view: initialView seeds initial state, user toggles thereafter
	const [view, setView] = useState<CalendarView>(initialView);
	const [selectedDate, _setSelectedDate] = useState<Date | null>(null);
	const [selectedAppointment, setSelectedAppointment] =
		useState<Appointment | null>(null);
	const [selectedAppointments, setSelectedAppointments] = useState<Set<string>>(
		new Set(),
	);
	const [isGroupSelectMode, setIsGroupSelectMode] = useState(false);
	const [showConfirmed, setShowConfirmed] = useState(true);
	const [showCancelled, setShowCancelled] = useState(true);
	const [showAddModal, setShowAddModal] = useState(false);
	const [editStaffAppointmentId, setEditStaffAppointmentId] = useState<
		string | null
	>(null);
	const [occurrenceDialogAppt, setOccurrenceDialogAppt] =
		useState<Appointment | null>(null);

	const gridContainerRef = useRef<HTMLDivElement>(null);

	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";
	const org = userCtx?.organizations.find((o) => o.id === organizationId);
	const branchId = org?.hierarchy.member?.hierarchyScopeId ?? "";
	const queryClient = useQueryClient();

	const { handleOccurrenceAction } = useOccurrenceActions({
		organizationId,
		onEditAll: (parentId) => setEditStaffAppointmentId(parentId),
		onDialogClose: () => setOccurrenceDialogAppt(null),
	});

	const updateMutation = useMutation({
		mutationFn: (params: { id: string; status: "confirmed" | "cancelled" }) =>
			client.appointments.update({
				organizationId,
				id: params.id,
				status: params.status,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: orpc.appointments.list.key() });
		},
	});

	const createMutation = useApiMutation({
		mutationFn: (params: CreateAppointmentParams) =>
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
				// AVANTEJ-5: persist the selected service (Schedule Service column).
				serviceId: params.serviceId ?? null,
				staffAssignments: params.staffAssignments ?? undefined,
				recurrence: params.recurrence,
			}),
		successMessage: "Appointment created",
		errorMessage: (err) => err.message || "Failed to create appointment",
		invalidate: [orpc.appointments.list.key()],
		onSuccess: () => closeAddModal(),
	});

	const { startDate, endDate, dateDisplay, prevPeriod, nextPeriod } =
		useMemo(() => {
			if (view === "monthly") {
				const monthStart = new Date(
					currentDate.getFullYear(),
					currentDate.getMonth(),
					1,
				);
				const monthEnd = new Date(
					currentDate.getFullYear(),
					currentDate.getMonth() + 1,
					0,
				);
				const sd = new Date(monthStart);
				sd.setDate(sd.getDate() - sd.getDay());
				const ed = new Date(monthEnd);
				ed.setDate(ed.getDate() + (6 - ed.getDay()));
				return {
					startDate: sd,
					endDate: ed,
					dateDisplay: currentDate.toLocaleDateString("en-US", {
						month: "long",
						year: "numeric",
					}),
					prevPeriod: () =>
						setCurrentDate(
							new Date(currentDate.getFullYear(), currentDate.getMonth() - 1),
						),
					nextPeriod: () =>
						setCurrentDate(
							new Date(currentDate.getFullYear(), currentDate.getMonth() + 1),
						),
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
					prevPeriod: () => {
						const d = new Date(currentDate);
						d.setDate(d.getDate() - 7);
						setCurrentDate(d);
					},
					nextPeriod: () => {
						const d = new Date(currentDate);
						d.setDate(d.getDate() + 7);
						setCurrentDate(d);
					},
				};
			} else {
				return {
					startDate: currentDate,
					endDate: currentDate,
					dateDisplay: currentDate.toLocaleDateString("en-US", {
						weekday: "long",
						year: "numeric",
						month: "long",
						day: "numeric",
					}),
					prevPeriod: () => {
						const d = new Date(currentDate);
						d.setDate(d.getDate() - 1);
						setCurrentDate(d);
					},
					nextPeriod: () => {
						const d = new Date(currentDate);
						d.setDate(d.getDate() + 1);
						setCurrentDate(d);
					},
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
			return (
				d.getDate() === date.getDate() &&
				d.getMonth() === date.getMonth() &&
				d.getFullYear() === date.getFullYear()
			);
		});

	const getSortedAppointmentsForDate = (date: Date) =>
		getAppointmentsForDate(date).sort(
			(a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
		);

	const isToday = (date: Date) => {
		const today = new Date();
		return (
			date.getDate() === today.getDate() &&
			date.getMonth() === today.getMonth() &&
			date.getFullYear() === today.getFullYear()
		);
	};

	const isCurrentPeriod = (date: Date) => {
		if (view === "monthly")
			return (
				date.getMonth() === currentDate.getMonth() &&
				date.getFullYear() === currentDate.getFullYear()
			);
		return date >= startDate && date <= endDate;
	};

	const handleDayCellClick = (date: Date) => {
		setCurrentDate(date);
		setView("daily");
		onDateSelect?.(date);
	};

	const closeAppointmentModal = () => setSelectedAppointment(null);
	const openAddModal = () => {
		setShowAddModal(true);
		onAddAppointment?.();
	};
	const closeAddModal = () => {
		setShowAddModal(false);
	};

	const handleSubmitAppointment = (appointment: OnSubmitPayload) => {
		if (!organizationId) {
			toast.error("No organization selected.");
			return;
		}
		if (!branchId) {
			toast.error(
				"Your account is not scoped to a branch. Please contact your administrator.",
			);
			return;
		}
		createMutation.mutate({
			start: new Date(appointment.start),
			duration: appointment.duration,
			notes: appointment.remarks,
			userId: appointment.client?.userId ?? null,
			// AVANTEJ-5: forward the selected service so the row stores serviceId.
			serviceId: appointment.serviceId ?? null,
			staffAssignments: appointment.staffAssignments ?? undefined,
			recurrence: buildRecurrenceParams(appointment),
		});
	};

	const handleAppointmentClick = (appointment: Appointment) => {
		if (isGroupSelectMode && appointment.status === "pending") {
			const next = new Set(selectedAppointments);
			if (next.has(appointment.id)) {
				next.delete(appointment.id);
			} else {
				next.add(appointment.id);
			}
			setSelectedAppointments(next);
		} else if (appointment.isVirtual || appointment.parentId) {
			setOccurrenceDialogAppt(appointment);
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
			const gridStart =
				dayAppts.length > 0
					? Math.min(6, new Date(dayAppts[0].start).getHours() - 1)
					: 6;
			const nowTop =
				(now.getHours() - gridStart) * PX_PER_HOUR +
				now.getMinutes() * PX_PER_MIN -
				80;
			container.scrollTop = Math.max(0, nowTop);
		} else if (dayAppts.length > 0) {
			const firstAppt = new Date(dayAppts[0].start);
			const gridStart = Math.min(6, firstAppt.getHours() - 1);
			const top =
				(firstAppt.getHours() - gridStart) * PX_PER_HOUR +
				firstAppt.getMinutes() * PX_PER_MIN -
				40;
			container.scrollTop = Math.max(0, top);
		} else {
			container.scrollTop = 2 * PX_PER_HOUR;
		}
		// intentional: appointments in deps causes scroll-jump UX regression on every background refetch
	}, [view, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<>
			<Card className="w-full">
				<CardHeader className="flex flex-row items-center justify-between gap-y-0 pb-4">
					<CardTitle className="text-xl font-semibold">Appointments</CardTitle>
					<div className="flex items-center gap-2">
						{isGroupSelectMode && selectedAppointments.size > 0 && (
							<div className="flex gap-2">
								<Button
									size="sm"
									onClick={() => handleBulkStatusChange("confirmed")}
									className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
								>
									Came ({selectedAppointments.size})
								</Button>
								<Button
									size="sm"
									variant="outline"
									onClick={() => handleBulkStatusChange("cancelled")}
									className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
								>
									No-show ({selectedAppointments.size})
								</Button>
							</div>
						)}
						<Button variant="outline" size="sm" onClick={openAddModal}>
							<Plus className="size-4 mr-2" />
							Add Appointment
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center bg-zinc-100 rounded-lg p-1 gap-0.5">
							<button
								onClick={() => setView("monthly")}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
									view === "monthly"
										? "bg-white text-zinc-900 shadow-sm"
										: "text-zinc-500 hover:text-zinc-900",
								)}
							>
								<Calendar className="size-4" />
								Month
							</button>
							<button
								onClick={() => setView("weekly")}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
									view === "weekly"
										? "bg-white text-zinc-900 shadow-sm"
										: "text-zinc-500 hover:text-zinc-900",
								)}
							>
								<CalendarDays className="size-4" />
								Week
							</button>
							<button
								onClick={() => setView("daily")}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
									view === "daily"
										? "bg-white text-zinc-900 shadow-sm"
										: "text-zinc-500 hover:text-zinc-900",
								)}
							>
								<Clock className="size-4" />
								Day
							</button>
						</div>

						<div className="flex items-center gap-2 text-sm">
							<button
								onClick={() => setShowConfirmed(!showConfirmed)}
								className={cn(
									"flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors",
									showConfirmed
										? "bg-green-50 border-green-200 text-green-700"
										: "border-zinc-200 text-zinc-400",
								)}
							>
								<div
									className={cn(
										"size-2.5 rounded-full",
										showConfirmed ? "bg-green-500" : "bg-zinc-300",
									)}
								/>
								Came
							</button>
							<button
								onClick={() => setShowCancelled(!showCancelled)}
								className={cn(
									"flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors",
									showCancelled
										? "bg-red-50 border-red-200 text-red-700"
										: "border-zinc-200 text-zinc-400",
								)}
							>
								<div
									className={cn(
										"size-2.5 rounded-full",
										showCancelled ? "bg-red-500" : "bg-zinc-300",
									)}
								/>
								No-show
							</button>
						</div>
					</div>

					<div className="flex items-center justify-between mb-4">
						<Button
							variant="outline"
							size="sm"
							onClick={prevPeriod}
							className="size-8 p-0"
						>
							<ChevronLeft className="size-4" />
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
						<Button
							variant="outline"
							size="sm"
							onClick={nextPeriod}
							className="size-8 p-0"
						>
							<ChevronRight className="size-4" />
						</Button>
					</div>

					<CalendarGrid
						view={view}
						currentDate={currentDate}
						calendarDays={calendarDays}
						defaultTrainerId={defaultTrainerId}
						gridContainerRef={gridContainerRef}
						getSortedAppointmentsForDate={getSortedAppointmentsForDate}
						isTodayDate={isToday}
						isCurrentPeriod={isCurrentPeriod}
						handleAppointmentClick={handleAppointmentClick}
						handleDayCellClick={handleDayCellClick}
						openAddModal={openAddModal}
					/>

					<div className="mt-4 flex items-center justify-center gap-4 text-xs text-zinc-500">
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-green-500 inline-block" />
							Came (confirmed)
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-yellow-400 inline-block" />
							Upcoming (pending)
						</span>
						<span className="flex items-center gap-1">
							<span className="size-2 rounded-full bg-red-500 inline-block" />
							No-show (cancelled)
						</span>
					</div>
				</CardContent>
			</Card>

			{selectedAppointment && (
				<CalendarDetailModal
					appointment={selectedAppointment}
					updateMutation={updateMutation}
					onClose={closeAppointmentModal}
					onEditStaff={(id) => setEditStaffAppointmentId(id)}
					onInvalidate={() =>
						queryClient.invalidateQueries({
							queryKey: orpc.appointments.list.key(),
						})
					}
				/>
			)}

			<AddAppointmentModal
				isOpen={showAddModal}
				onClose={closeAddModal}
				onSubmit={handleSubmitAppointment}
				teamMembers={[]}
				selectedDate={selectedDate || undefined}
				defaultTrainerId={defaultTrainerId}
			/>

			{editStaffAppointmentId && (
				<EditAppointmentModal
					appointmentId={editStaffAppointmentId}
					organizationId={organizationId}
					isOpen={!!editStaffAppointmentId}
					onClose={() => setEditStaffAppointmentId(null)}
					onSuccess={() =>
						queryClient.invalidateQueries({
							queryKey: orpc.appointments.list.key(),
						})
					}
				/>
			)}

			{occurrenceDialogAppt && (
				<OccurrenceActionDialog
					appt={occurrenceDialogAppt}
					onAction={handleOccurrenceAction}
					onClose={() => setOccurrenceDialogAppt(null)}
				/>
			)}
		</>
	);
}
