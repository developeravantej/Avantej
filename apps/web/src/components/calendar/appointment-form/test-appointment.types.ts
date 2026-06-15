// ─── Types ────────────────────────────────────────────────────────────────────

export type TestAppointmentSlot = {
	title: string;
	start: string | null;
	duration: number;
	service: string;
	assignedTo?: { name?: string } | null;
	remarks?: string;
	recurrence?: string;
	customRecurrence?: {
		frequency: number;
		timeUnit: string;
		repeatOn: string[];
		endsType?: string;
		endsDate?: string;
		endsOccurrences?: number;
	};
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TestAppointmentData = Record<string, any> & {
	type?: string;
	appointments?: TestAppointmentSlot[];
};
