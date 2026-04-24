/**
 * Shared domain types for the appointment scheduling flow.
 * These are UI-layer types — not DB schema types.
 */

export interface TeamMember {
	id: string;
	name: string;
	email?: string;
	avatar?: string;
	color?: string;
}

export interface Client {
	id: string;
	userId: string;
	name: string;
	email: string;
	phone: string;
	creditPoints: number;
}

export interface Service {
	id: string;
	name: string;
	durationMinutes: number;
	creditCost: number;
	schedulingType: string;
}

export type CustomRecurrence = {
	frequency: number;
	timeUnit: string;
	repeatOn: string[];
	monthlyType?: string;
	endsType: string;
	endsDate: string;
	endsOccurrences: number;
};

export interface AppointmentSlot {
	id: string;
	selectedServices: string[];
	remarks: string;
	startDate: string;
	startTime: string;
	duration: number;
	assignedTo: string;
	roomId: string;
	employeeId: string;
	recurrence: string;
	customRecurrence?: CustomRecurrence;
	title?: string;
	endTime?: string;
	isActive?: boolean;
}

export interface NewAppointment {
	clientId: string;
	selectedServices: string[];
	remarks: string;
	startDate: string;
	startTime: string;
	duration: number;
	assignedTo: string;
	roomId: string;
	employeeId: string;
	recurrence: string;
	customRecurrence?: CustomRecurrence;
}

export type OnSubmitPayload = {
	title: string;
	client: Client;
	service: string;
	location?: string;
	remarks?: string;
	start: Date;
	end: Date;
	duration: number;
	assignedTo?: TeamMember;
	tags: string[];
	recurrence: string;
	customRecurrence?: {
		frequency: number;
		timeUnit: string;
		repeatOn: string[];
	};
	endsType: string;
	endsDate?: string;
	endsOccurrences?: number;
	staffAssignments?: { staffId: string; slotIndex: number }[];
};
