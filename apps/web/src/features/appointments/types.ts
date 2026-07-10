/** Shared appointment types for AppointmentCalendar */

export interface Appointment {
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
	/** True when this event represents a not-yet-materialized virtual occurrence */
	isVirtual?: boolean;
	/** Parent recurring appointment ID (present for virtual occurrences and materialized children) */
	parentId?: string;
}

export type CalendarView = "monthly" | "weekly" | "daily";

type CreateRecurrenceParams = {
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

export type CreateAppointmentParams = {
	start: Date;
	duration: number;
	notes?: string;
	userId?: string | null;
	// AVANTEJ-5: carry the selected service so the created appointment stores it
	// (otherwise the Schedule "Service" column shows "—").
	serviceId?: string | null;
	staffAssignments?: { staffId: string; slotIndex: number }[];
	recurrence?: CreateRecurrenceParams;
};
