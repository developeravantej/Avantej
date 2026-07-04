import { Fragment, useState, useRef, useEffect } from "react";
import {
	Plus,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	SlidersHorizontal,
	Download,
	CheckCircle2,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";
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
import { RescheduleDialog } from "@/features/appointments/components/RescheduleDialog";
import { NoShowFollowupDialog } from "@/features/appointments/components/NoShowFollowupDialog";
import { ScheduleSessionsPanel } from "@/features/approvals/components/ScheduleSessionsPanel";
import {
	EditAppointmentDialog,
	type EditForm,
} from "@/features/appointments/components/EditAppointmentDialog";
import {
	DayAgendaView,
	DayListView,
	DayCardView,
} from "@/features/appointments/components/DayAppointmentViews";

type ViewMode = "today" | "day" | "week" | "month" | "list";

const VIEW_MODES: ViewMode[] = ["today", "day", "week", "month", "list"];

// Status filter values. "completed" / "no-show" match the *raw* API status
// (CalendarAppointment collapses those into confirmed/cancelled), so the filter
// reads CalendarAppointment.rawStatus.
const STATUS_FILTERS: { value: string; label: string }[] = [
	{ value: "all", label: "All statuses" },
	{ value: "pending", label: "Pending" },
	{ value: "confirmed", label: "Confirmed" },
	{ value: "completed", label: "Completed" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "no-show", label: "No-show" },
];

function isVirtualId(id: string) {
	return id.startsWith("virtual__");
}

interface AppointmentListProps {
	appointments: CalendarAppointment[];
	isLoading?: boolean;
	defaultTrainerId?: string | null;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toDateKey(d: Date) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey() {
	return toDateKey(new Date());
}

function formatDayLabel(d: Date) {
	return d.toLocaleDateString("en-US", {
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function isSameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

// ── component ─────────────────────────────────────────────────────────────────

export function AppointmentList({
	appointments,
	isLoading,
	defaultTrainerId,
}: AppointmentListProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("day");
	// Bulk multi-select: only ever holds NON-virtual, uuid ids.
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	// In-memory status filter over the already-loaded appointments window.
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [showAddModal, setShowAddModal] = useState(false);
	const [attendanceApptId, setAttendanceApptId] = useState<string | null>(null);
	const [selectedAppt, setSelectedAppt] = useState<CalendarAppointment | null>(
		null,
	);
	const [editAppt, setEditAppt] = useState<CalendarAppointment | null>(null);
	const [rescheduleAppt, setRescheduleAppt] =
		useState<CalendarAppointment | null>(null);
	const [noShowFollowupId, setNoShowFollowupId] = useState<string | null>(null);
	const [replacementPkgId, setReplacementPkgId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<EditForm | null>(null);

	// Day mode: currently viewed date
	const [currentDay, setCurrentDay] = useState<Date>(new Date());
	// Week/list mode: currently viewed month
	const [currentMonth, setCurrentMonth] = useState(new Date());

	const scrollRef = useRef<HTMLDivElement>(null);
	const todayRef = useRef<HTMLDivElement>(null);

	const { data: userCtx, hasPermission } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";
	const org = userCtx?.organizations.find((o) => o.id === organizationId);
	const branchId = org?.hierarchy.member?.hierarchyScopeId ?? "";
	// Defensive `?.` — some test mocks stub useUserContext without hasPermission.
	const canBulkUpdate =
		hasPermission?.("appointment_management:update") ?? false;

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
		errorMessage: (err) => {
			const msg = err.message || "Failed to create appointment";
			if (msg.startsWith("Conflict:")) return msg;
			return msg;
		},
		invalidate: [orpc.appointments.list.key()],
		onSuccess: () => {
			setShowAddModal(false);
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: (params: {
			id: string;
			status: "confirmed" | "cancelled" | "no-show";
		}) =>
			client.appointments.update({
				organizationId,
				id: params.id,
				status: params.status,
			}),
		errorMessage: (err) => err.message || "Failed to update appointment",
		invalidate: [orpc.appointments.list.key()],
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
		invalidate: [orpc.appointments.list.key()],
		onSuccess: () => {
			setEditAppt(null);
			setEditForm(null);
		},
	});

	// WS4 (MOVE parity) — bulk status transition for the multi-select toolbar.
	const bulkMutation = useApiMutation({
		mutationFn: (vars: {
			appointmentIds: string[];
			status: "completed" | "cancelled";
			cancellationReason?: string;
		}) => client.appointments.updateStatusBulk({ organizationId, ...vars }),
		successMessage: (res) =>
			`${res.completed} updated${res.failed ? `, ${res.failed} failed` : ""}`,
		errorMessage: (err) => err.message || "Bulk update failed",
		invalidate: [orpc.appointments.list.key()],
		onSuccess: () => setSelectedIds(new Set()),
	});

	useEffect(() => {
		if (isLoading) return;
		if (todayRef.current && scrollRef.current) {
			const offset = todayRef.current.offsetTop - 16;
			scrollRef.current.scrollTop = Math.max(0, offset);
		}
	}, [isLoading]);

	function openEdit(appt: CalendarAppointment) {
		const s = new Date(appt.start);
		const pad = (n: number) => String(n).padStart(2, "0");
		setEditForm({
			date: `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`,
			time: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
			duration: Math.round(
				(new Date(appt.end).getTime() - s.getTime()) / 60000,
			),
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
		editMutation.mutate({
			id: editAppt.id,
			startTime,
			duration: editForm.duration,
			notes: editForm.notes,
			description: editForm.description,
		});
	}

	// ── Status filter (client-side, over the loaded window) ───────────────────
	const filteredAppointments =
		statusFilter === "all"
			? appointments
			: appointments.filter((a) => (a.rawStatus ?? a.status) === statusFilter);

	// ── View style ────────────────────────────────────────────────────────────
	// "today"/"day" render a single day agenda; "week"/"month"/"list" render the
	// month grouped by date (cards for week/month, rows for list).
	const isDayStyle = viewMode === "today" || viewMode === "day";
	const showCards = viewMode === "week" || viewMode === "month";
	// "today" is pinned to now and ignores currentDay navigation.
	const effectiveDay = viewMode === "today" ? new Date() : currentDay;

	// ── Day mode data ─────────────────────────────────────────────────────────
	const dayKey = toDateKey(effectiveDay);
	const dayAppts = filteredAppointments.filter(
		(a) => toDateKey(new Date(a.start)) === dayKey,
	);
	const isCurrentDayToday = isSameDay(effectiveDay, new Date());

	function prevDay() {
		setCurrentDay((d) => {
			const n = new Date(d);
			n.setDate(n.getDate() - 1);
			return n;
		});
	}
	function nextDay() {
		setCurrentDay((d) => {
			const n = new Date(d);
			n.setDate(n.getDate() + 1);
			return n;
		});
	}
	function goToday() {
		setCurrentDay(new Date());
	}

	// ── Week/list mode data ───────────────────────────────────────────────────
	const monthStart = new Date(
		currentMonth.getFullYear(),
		currentMonth.getMonth(),
		1,
	);
	const monthEnd = new Date(
		currentMonth.getFullYear(),
		currentMonth.getMonth() + 1,
		0,
		23,
		59,
		59,
		999,
	);
	const filteredMonth = filteredAppointments.filter((a) => {
		const d = new Date(a.start);
		return d >= monthStart && d <= monthEnd;
	});
	const grouped = groupByDate(filteredMonth);
	const dateKeys = Array.from(grouped.keys());
	const monthLabel = currentMonth.toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});

	const _tnow = new Date();
	const _tk = todayKey();
	const _isCurrMonth =
		currentMonth.getFullYear() === _tnow.getFullYear() &&
		currentMonth.getMonth() === _tnow.getMonth();
	const _todayInList = dateKeys.includes(_tk);
	const _insertBeforeKey =
		_isCurrMonth && !_todayInList
			? (dateKeys.find((k) => k > _tk) ?? null)
			: null;
	const _anchorAtEnd =
		_isCurrMonth &&
		!_todayInList &&
		_insertBeforeKey === null &&
		dateKeys.length > 0;

	// ── Toolbar label ─────────────────────────────────────────────────────────
	const toolbarLabel = isDayStyle ? formatDayLabel(effectiveDay) : monthLabel;

	const toolbarSub = isDayStyle
		? isCurrentDayToday
			? `Today · ${dayAppts.length} booking${dayAppts.length !== 1 ? "s" : ""}`
			: `${dayAppts.length} booking${dayAppts.length !== 1 ? "s" : ""}`
		: `${filteredMonth.length} booking${filteredMonth.length !== 1 ? "s" : ""}`;

	// ── Bulk selection helpers ────────────────────────────────────────────────
	// Rows visible in the current view that are eligible for bulk actions.
	const visibleAppointments = isDayStyle ? dayAppts : filteredMonth;
	const selectableVisible = visibleAppointments.filter(
		(a) => !isVirtualId(a.id),
	);
	const selectableVisibleIds = new Set(selectableVisible.map((a) => a.id));
	const allVisibleSelected =
		selectableVisible.length > 0 &&
		selectableVisible.every((a) => selectedIds.has(a.id));

	// Guard against acting on off-screen rows: whenever the eligible window
	// changes (view / navigated date / status filter), drop the selection so
	// the toolbar count and the ids we mutate always match what's on screen.
	// A scope (branch) change swaps the `appointments` prop; the mutate-time
	// intersect below covers that case defensively.
	useEffect(() => {
		setSelectedIds(new Set());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [viewMode, statusFilter, currentDay, currentMonth]);

	function toggleSelect(id: string) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function toggleSelectAll() {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (allVisibleSelected) {
				for (const a of selectableVisible) next.delete(a.id);
			} else {
				for (const a of selectableVisible) next.add(a.id);
			}
			return next;
		});
	}
	function clearSelection() {
		setSelectedIds(new Set());
	}
	// Only ever mutate rows that are BOTH selected AND currently visible — never
	// an off-screen id left over from a prior view/branch.
	function selectedVisibleIds(): string[] {
		return [...selectedIds].filter((id) => selectableVisibleIds.has(id));
	}
	function handleBulkComplete() {
		const ids = selectedVisibleIds();
		if (ids.length === 0) return;
		bulkMutation.mutate({ appointmentIds: ids, status: "completed" });
	}
	function handleBulkCancel() {
		const ids = selectedVisibleIds();
		if (ids.length === 0) return;
		const n = ids.length;
		const ok = window.confirm(
			`Cancel ${n} appointment${n !== 1 ? "s" : ""}? Package credits will be restored where applicable.`,
		);
		if (!ok) return;
		const reason = window.prompt("Cancellation reason (optional):", "");
		bulkMutation.mutate({
			appointmentIds: ids,
			status: "cancelled",
			cancellationReason: reason?.trim() ? reason.trim() : undefined,
		});
	}

	// ── Prev/Next handlers ────────────────────────────────────────────────────
	// "today" is pinned to now, so its nav is hidden and these are no-ops; "day"
	// steps by day; "week"/"month"/"list" step by month.
	const navDisabled = viewMode === "today";
	function handlePrev() {
		if (viewMode === "today") return;
		if (viewMode === "day") {
			prevDay();
		} else {
			setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1));
		}
	}
	function handleNext() {
		if (viewMode === "today") return;
		if (viewMode === "day") {
			nextDay();
		} else {
			setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1));
		}
	}
	function handleToday() {
		goToday();
		setCurrentMonth(new Date());
		setTimeout(() => {
			if (todayRef.current && scrollRef.current) {
				scrollRef.current.scrollTop = Math.max(
					0,
					todayRef.current.offsetTop - 16,
				);
			}
		}, 0);
	}

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<>
			{/* ── Toolbar ── */}
			<div className="flex items-center justify-between border-b border-[#e5e5e5] bg-white px-6 py-3 shrink-0">
				{/* Left: date nav */}
				<div className="flex items-center gap-2">
					{!navDisabled && (
						<button
							type="button"
							onClick={handlePrev}
							aria-label="Previous"
							className="inline-flex items-center justify-center rounded-[10px] border border-[#e5e5e5] bg-white p-2 text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
						>
							<ChevronLeft className="h-3.5 w-3.5" />
						</button>
					)}

					<div className="flex flex-col px-2 text-center">
						<span className="text-base font-bold leading-tight text-[#0a0a0a]">
							{toolbarLabel}
						</span>
						<span className="font-mono tabular-nums text-[11px] text-[#737373]">
							{toolbarSub}
						</span>
					</div>

					{!navDisabled && (
						<button
							type="button"
							onClick={handleNext}
							aria-label="Next"
							className="inline-flex items-center justify-center rounded-[10px] border border-[#e5e5e5] bg-white p-2 text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
						>
							<ChevronRight className="h-3.5 w-3.5" />
						</button>
					)}

					{!navDisabled && (
						<button
							type="button"
							onClick={handleToday}
							className="ml-1 inline-flex items-center rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
						>
							Today
						</button>
					)}

					<span className="mx-2 h-5 w-px bg-[#e5e5e5]" />

					{/* View-mode pill toggle */}
					<div className="inline-flex rounded-[10px] border border-[#e5e5e5] bg-white p-0.5">
						{VIEW_MODES.map((m) => (
							<button
								key={m}
								type="button"
								onClick={() => setViewMode(m)}
								className={cn(
									"rounded-[8px] px-3 py-1 text-[13px] font-medium capitalize transition",
									viewMode === m
										? "bg-[#0a0a0a] text-white font-semibold"
										: "text-[#737373] hover:text-[#0a0a0a]",
								)}
							>
								{m.charAt(0).toUpperCase() + m.slice(1)}
							</button>
						))}
					</div>
				</div>

				{/* Right: actions */}
				<div className="flex items-center gap-2">
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
						aria-label="Filter by status"
						className="rounded-[10px] border border-[#e5e5e5] bg-white px-3 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3] focus:outline-none"
					>
						{STATUS_FILTERS.map((s) => (
							<option key={s.value} value={s.value}>
								{s.label}
							</option>
						))}
					</select>
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
					>
						<SlidersHorizontal className="h-3.5 w-3.5" />
						Filters
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
					>
						<Download className="h-3.5 w-3.5" />
						Export
					</button>
					<button
						type="button"
						onClick={() => setShowAddModal(true)}
						className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#262626]"
					>
						<Plus className="h-3.5 w-3.5" />
						New Booking
					</button>
				</div>
			</div>

			{/* ── Bulk action bar (sticky) ── */}
			{canBulkUpdate && selectedIds.size > 0 && (
				<div className="flex items-center justify-between border-b border-[#e5e5e5] bg-[#0a0a0a] px-6 py-2.5 shrink-0">
					<div className="flex items-center gap-3">
						<span className="text-[13px] font-semibold text-white">
							{selectedIds.size} selected
						</span>
						<button
							type="button"
							onClick={clearSelection}
							className="text-[12px] font-medium text-[#a3a3a3] transition hover:text-white"
						>
							Clear
						</button>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={bulkMutation.isPending}
							onClick={handleBulkComplete}
							className="inline-flex items-center gap-1.5 rounded-[10px] bg-white px-3.5 py-1.5 text-[13px] font-semibold text-[#0a0a0a] transition hover:bg-[#f3f3f3] disabled:opacity-50"
						>
							<CheckCircle2 className="h-3.5 w-3.5" />
							Mark Completed
						</button>
						<button
							type="button"
							disabled={bulkMutation.isPending}
							onClick={handleBulkCancel}
							className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#525252] bg-transparent px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[#262626] disabled:opacity-50"
						>
							<XCircle className="h-3.5 w-3.5" />
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* ── Content ── */}
			<div
				ref={scrollRef}
				className="flex-1 overflow-y-auto bg-[#f3f3f3]/40 px-6 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#d1d1d1] [&::-webkit-scrollbar-thumb]:rounded-full"
			>
				{/* Select-all (visible, non-virtual) affordance */}
				{!isLoading && canBulkUpdate && selectableVisible.length > 0 && (
					<label className="mb-4 inline-flex cursor-pointer select-none items-center gap-2 text-[12px] font-medium text-[#737373]">
						<input
							type="checkbox"
							checked={allVisibleSelected}
							onChange={toggleSelectAll}
							className="size-4 cursor-pointer accent-[#0a0a0a]"
						/>
						Select all {selectableVisible.length} visible
					</label>
				)}
				{isLoading ? (
					<div className="space-y-2">
						{[1, 2, 3, 4].map((i) => (
							<div
								key={i}
								className="h-16 animate-pulse rounded-xl bg-white border border-[#e5e5e5]"
							/>
						))}
					</div>
				) : isDayStyle ? (
					/* ── Day Agenda ── */
					dayAppts.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20">
							<CalendarDays className="h-8 w-8 mb-3 text-[#d1d1d1]" />
							<p className="text-sm font-medium text-[#0a0a0a]">
								No appointments{" "}
								{isCurrentDayToday
									? "today"
									: `on ${formatDayLabel(effectiveDay)}`}
							</p>
							<p className="text-xs mt-1 text-[#737373]">
								Schedule a new booking to get started.
							</p>
							<button
								type="button"
								onClick={() => setShowAddModal(true)}
								className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#262626]"
							>
								<Plus className="h-3.5 w-3.5" />
								New Booking
							</button>
						</div>
					) : (
						<DayAgendaView
							dayAppts={dayAppts}
							onSelectAppt={setSelectedAppt}
							onMarkAttendance={(id) => setAttendanceApptId(id)}
							selectedIds={selectedIds}
							onToggleSelect={canBulkUpdate ? toggleSelect : undefined}
						/>
					)
				) : /* ── Week / Month / List ── */
				dateKeys.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20">
						<CalendarDays className="h-8 w-8 mb-3 text-[#d1d1d1]" />
						<p className="text-sm font-medium text-[#0a0a0a]">
							No appointments in {monthLabel}
						</p>
						<p className="text-xs mt-1 text-[#737373]">
							Try a different month or schedule a new booking.
						</p>
						<button
							type="button"
							onClick={() => setShowAddModal(true)}
							className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#262626]"
						>
							<Plus className="h-3.5 w-3.5" />
							New Booking
						</button>
					</div>
				) : (
					<div className="space-y-10">
						{dateKeys.map((key) => {
							const dayAppts2 = grouped.get(key)!;
							const dateObj = new Date(dayAppts2[0].start);
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
													"flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full text-center",
													todayDate
														? "bg-[#0a0a0a] text-white"
														: "bg-[#f3f3f3] text-[#0a0a0a]",
												)}
											>
												<span className="text-[10px] font-semibold leading-none tracking-wide">
													{dateObj
														.toLocaleDateString("en-US", { month: "short" })
														.toUpperCase()}
												</span>
												<span className="font-mono tabular-nums text-lg font-bold leading-none mt-1">
													{dateObj.getDate()}
												</span>
											</div>
											<div>
												<p className="text-sm font-semibold text-[#0a0a0a]">
													{label}
												</p>
												<p className="text-xs text-[#737373]">{sub}</p>
											</div>
											<div className="flex-1 h-px bg-[#e5e5e5] ml-1" />
											<span className="font-mono tabular-nums text-xs text-[#737373] shrink-0">
												{dayAppts2.length} appointment
												{dayAppts2.length !== 1 ? "s" : ""}
											</span>
										</div>

										{/* Sub-view rows */}
										{showCards ? (
											<DayCardView
												dayAppts={dayAppts2}
												onSelectAppt={setSelectedAppt}
												onMarkAttendance={(id) => setAttendanceApptId(id)}
												selectedIds={selectedIds}
												onToggleSelect={
													canBulkUpdate ? toggleSelect : undefined
												}
											/>
										) : (
											<DayListView
												dayAppts={dayAppts2}
												onSelectAppt={setSelectedAppt}
												onMarkAttendance={(id) => setAttendanceApptId(id)}
												selectedIds={selectedIds}
												onToggleSelect={
													canBulkUpdate ? toggleSelect : undefined
												}
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

			{/* ── Dialogs (unchanged) ── */}
			<AppointmentDetailDialog
				appt={selectedAppt}
				organizationId={organizationId}
				onClose={() => setSelectedAppt(null)}
				onEdit={openEdit}
				onMarkAttendance={(id) => setAttendanceApptId(id)}
				onReschedule={(appt) => {
					setSelectedAppt(null);
					setRescheduleAppt(appt);
				}}
			/>

			<RescheduleDialog
				appt={rescheduleAppt}
				organizationId={organizationId}
				onClose={() => setRescheduleAppt(null)}
			/>

			<AttendanceDialog
				apptId={attendanceApptId}
				appointments={appointments}
				isPending={updateMutation.isPending}
				onClose={() => setAttendanceApptId(null)}
				onConfirm={(id) => {
					updateMutation.mutate(
						{ id, status: "confirmed" },
						{
							onSuccess: () => {
								toast.success("Marked as Attended");
								setAttendanceApptId(null);
							},
						},
					);
				}}
				onCancel={(id) => {
					updateMutation.mutate(
						{ id, status: "no-show" },
						{
							onSuccess: () => {
								toast.success("Marked as No-show");
								setAttendanceApptId(null);
								// Journey D: offer to reinstate the credit + book a replacement.
								setNoShowFollowupId(id);
							},
						},
					);
				}}
			/>

			<NoShowFollowupDialog
				appointmentId={noShowFollowupId}
				organizationId={organizationId}
				onClose={() => setNoShowFollowupId(null)}
				onReinstated={(packageInstanceId) => {
					setNoShowFollowupId(null);
					setReplacementPkgId(packageInstanceId);
				}}
			/>

			<ScheduleSessionsPanel
				open={replacementPkgId !== null}
				onClose={() => setReplacementPkgId(null)}
				organizationId={organizationId}
				packageInstanceId={replacementPkgId}
				mode="single"
			/>

			<EditAppointmentDialog
				appt={editAppt}
				editForm={editForm}
				isPending={editMutation.isPending}
				onFormChange={setEditForm}
				onClose={() => {
					setEditAppt(null);
					setEditForm(null);
				}}
				onSave={handleSaveEdit}
			/>

			<AddAppointmentModal
				isOpen={showAddModal}
				onClose={() => setShowAddModal(false)}
				onSubmit={(appt) => {
					if (!organizationId) {
						toast.error("No organization selected.");
						return;
					}
					if (!branchId) {
						toast.error("Your account is not scoped to a branch.");
						return;
					}
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
