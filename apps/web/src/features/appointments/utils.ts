/**
 * Pure helpers shared by AppointmentCalendar and AppointmentList.
 * No React imports — safe to use in server components too.
 */

import type { Appointment } from "./types";
import type { CalendarAppointment } from "@/lib/appointment-mapper";
import type { OnSubmitPayload } from "@/types/appointments";

// ── Calendar constants ────────────────────────────────────────────────────────

export const PX_PER_HOUR = 64;
export const PX_PER_MIN = PX_PER_HOUR / 60;

// ── Calendar helpers ──────────────────────────────────────────────────────────

export function statusStyle(status: Appointment["status"]) {
	switch (status) {
		case "confirmed":
			return { border: "border-l-green-500", bg: "bg-green-50", text: "text-green-900", badge: "bg-green-100 text-green-800", label: "Came" };
		case "pending":
			return { border: "border-l-yellow-500", bg: "bg-yellow-50", text: "text-yellow-900", badge: "bg-yellow-100 text-yellow-800", label: "Upcoming" };
		case "cancelled":
			return { border: "border-l-red-500", bg: "bg-red-50", text: "text-red-900", badge: "bg-red-100 text-red-800", label: "No-show" };
	}
}

export function assignColumns(appts: Appointment[]): Array<{ appt: Appointment; col: number; totalCols: number }> {
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

// ── List helpers ──────────────────────────────────────────────────────────────

export const STATUS = {
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

export function formatTime(date: Date) {
	return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDuration(start: Date, end: Date) {
	const mins = Math.round((end.getTime() - start.getTime()) / 60000);
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getInitials(name: string) {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export function isToday(date: Date) {
	const t = new Date();
	return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

export function isTomorrow(date: Date) {
	const t = new Date();
	t.setDate(t.getDate() + 1);
	return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear();
}

export function formatDateHeader(date: Date) {
	if (isToday(date)) return { label: "Today", sub: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
	if (isTomorrow(date)) return { label: "Tomorrow", sub: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) };
	return {
		label: date.toLocaleDateString("en-US", { weekday: "long" }),
		sub: date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
	};
}

export function groupByDate(appointments: CalendarAppointment[]): Map<string, CalendarAppointment[]> {
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

// ── Recurrence adapter ────────────────────────────────────────────────────────

type RecurrenceParams = {
	frequencyValue: number;
	timeUnit: "day" | "week" | "month";
	repeatOn?: number[];
	monthlyType?: "day_of_month" | "day_of_week";
	monthlyDayOfWeek?: number;
	monthlyWeekOfMonth?: number;
	endsType: "never" | "on_date" | "after_occurrences";
	endsAfterOccurrences?: number;
	endsOn?: string;
};

/**
 * Converts the UI-layer OnSubmitPayload recurrence shape into the API-layer
 * RecurrenceParams. Returns undefined when no custom recurrence is set.
 */
export function buildRecurrenceParams(appointment: OnSubmitPayload): RecurrenceParams | undefined {
	if (!appointment.recurrence || appointment.recurrence === "none" || !appointment.customRecurrence) return undefined;
	if (appointment.recurrence !== "custom") return undefined;

	const cr = appointment.customRecurrence as {
		frequency: number;
		timeUnit: string;
		repeatOn: string[];
		endsType?: string;
		endsDate?: string;
		endsOccurrences?: number;
		monthlyType?: string;
	};
	const DAYS_MAP: Record<string, number> = { SU: 0, M: 1, T: 2, W: 3, TH: 4, F: 5, S: 6 };
	const endsType = cr.endsType === "on" ? "on_date" : cr.endsType === "after" ? "after_occurrences" : "never";
	const monthlyType = cr.timeUnit === "month" ? (cr.monthlyType === "week" ? "day_of_week" : "day_of_month") : undefined;
	return {
		frequencyValue: cr.frequency ?? 1,
		timeUnit: (cr.timeUnit ?? "week") as "day" | "week" | "month",
		repeatOn: cr.timeUnit === "week" && cr.repeatOn?.length > 0
			? cr.repeatOn.map((d: string) => DAYS_MAP[d] ?? 0)
			: undefined,
		monthlyType,
		endsType: endsType as "never" | "on_date" | "after_occurrences",
		endsAfterOccurrences: endsType === "after_occurrences" ? (cr.endsOccurrences ?? undefined) : undefined,
		endsOn: endsType === "on_date" && cr.endsDate
			? new Date(cr.endsDate + "T23:59:59.999Z").toISOString()
			: undefined,
	};
}
