/**
 * Maps API appointment (from appointments.list / listForUser) to the shape
 * expected by AppointmentCalendar.
 */

export interface ApiAppointment {
	id: string;
	startTime: Date | string;
	endTime: Date | string;
	status: string;
	userId?: string | null;
	trainerId?: string | null;
	serviceId?: string | null;
	description?: string | null;
	branchId?: string | null;
	// Enriched by API
	serviceName?: string | null;
	trainerName?: string | null;
	clientName?: string | null;
}

export interface CalendarAppointment {
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
		color?: string;
	};
}

const CALENDAR_STATUS_MAP: Record<string, "confirmed" | "pending" | "cancelled"> = {
	pending: "pending",
	confirmed: "confirmed",
	completed: "confirmed",
	cancelled: "cancelled",
	"no-show": "cancelled",
};

export function mapApiAppointmentToCalendar(api: ApiAppointment): CalendarAppointment {
	const start = typeof api.startTime === "string" ? new Date(api.startTime) : api.startTime;
	const end = typeof api.endTime === "string" ? new Date(api.endTime) : api.endTime;
	const status =
		CALENDAR_STATUS_MAP[api.status] ?? (api.status === "cancelled" ? "cancelled" : "pending");
	return {
		id: api.id,
		title: api.description?.trim() || "Appointment",
		start,
		end,
		status,
		clientName: api.clientName ?? (api.userId ? `Client (${api.userId.slice(0, 8)}…)` : "—"),
		service: api.serviceName ?? (api.serviceId ? `Service (${api.serviceId.slice(0, 8)}…)` : "—"),
		assignedTo: api.trainerName
			? { id: api.trainerId ?? "", name: api.trainerName }
			: api.trainerId
				? { id: api.trainerId, name: api.trainerId.slice(0, 8) + "…" }
				: undefined,
	};
}

export function getAppointmentDateRange(view: "monthly" | "weekly", currentDate: Date): { startFrom: string; startTo: string } {
	if (view === "weekly") {
		const weekStart = new Date(currentDate);
		weekStart.setDate(currentDate.getDate() - currentDate.getDay());
		weekStart.setHours(0, 0, 0, 0);
		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 6);
		weekEnd.setHours(23, 59, 59, 999);
		return {
			startFrom: weekStart.toISOString(),
			startTo: weekEnd.toISOString(),
		};
	}
	const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
	monthStart.setHours(0, 0, 0, 0);
	const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
	monthEnd.setHours(23, 59, 59, 999);
	return {
		startFrom: monthStart.toISOString(),
		startTo: monthEnd.toISOString(),
	};
}

/** Range for initial load: current month ± 1 month so prev/next has data */
export function getAppointmentQueryRange(): { startFrom: string; startTo: string } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	start.setHours(0, 0, 0, 0);
	const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
	end.setHours(23, 59, 59, 999);
	return {
		startFrom: start.toISOString(),
		startTo: end.toISOString(),
	};
}

/** Today's date range for dashboard widget */
export function getTodayRange(): { startFrom: string; startTo: string } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	start.setHours(0, 0, 0, 0);
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	end.setHours(23, 59, 59, 999);
	return {
		startFrom: start.toISOString(),
		startTo: end.toISOString(),
	};
}
