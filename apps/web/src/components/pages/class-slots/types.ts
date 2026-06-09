// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClassSlotRow {
	id: string;
	serviceId: string;
	branchId: string;
	date: Date;
	startTime: string;
	endTime: string;
	capacity: number;
	instructorId: string | null;
	location: string | null;
	isCancelled: boolean;
	spotsBooked: number;
	spotsAvailable: number;
	waitlistCount: number;
	pricePerSpotCents: number;
	createdAt: Date;
}

export interface CreateFormState {
	serviceId: string;
	branchId: string;
	date: string;
	startTime: string;
	endTime: string;
	capacity: string;
	instructorId: string;
	location: string;
}

export interface EditFormState {
	startTime: string;
	endTime: string;
	capacity: string;
	instructorId: string;
	location: string;
}

export const EMPTY_CREATE_FORM: CreateFormState = {
	serviceId: "",
	branchId: "",
	date: "",
	startTime: "",
	endTime: "",
	capacity: "1",
	instructorId: "",
	location: "",
};

export const EMPTY_EDIT_FORM: EditFormState = {
	startTime: "",
	endTime: "",
	capacity: "1",
	instructorId: "",
	location: "",
};

export type SlotStatus = "open" | "full" | "waitlist" | "cancelled";
