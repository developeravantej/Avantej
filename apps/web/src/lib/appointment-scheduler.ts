/**
 * Pure validation utilities for appointment scheduling.
 * No React dependencies — safe to unit test directly.
 */

export type AppointmentSlotInput = {
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
	customRecurrence?: {
		frequency: number;
		timeUnit: string;
		repeatOn: string[];
		monthlyType?: string;
		endsType: string;
		endsDate: string;
		endsOccurrences: number;
	};
	title?: string;
	endTime?: string;
	isActive?: boolean;
};

/**
 * Validates a single appointment slot and returns a list of validation error
 * messages. Returns an empty array when the slot is valid.
 */
export function validateAppointmentSlot(slot: AppointmentSlotInput): string[] {
	const errors: string[] = [];

	if (!slot.selectedServices.length) {
		errors.push("At least one service must be selected");
	}

	if (!slot.startDate) {
		errors.push("Start date is required");
	}

	if (!slot.startTime) {
		errors.push("Start time is required");
	}

	if (!slot.roomId) {
		errors.push("Room selection is required");
	}

	return errors;
}

/**
 * Checks a list of appointment slots for time overlaps on the same day.
 * Returns an empty array when no conflicts are found.
 */
export function validateTimeConflicts(slots: AppointmentSlotInput[]): string[] {
	const errors: string[] = [];

	const sortedSlots = [...slots].sort((a, b) => {
		const timeA = new Date(`${a.startDate}T${a.startTime}`);
		const timeB = new Date(`${b.startDate}T${b.startTime}`);
		return timeA.getTime() - timeB.getTime();
	});

	for (let i = 0; i < sortedSlots.length - 1; i++) {
		const current = sortedSlots[i];
		const next = sortedSlots[i + 1];

		if (current.startDate === next.startDate) {
			const currentEnd = new Date(`${current.startDate}T${current.endTime || current.startTime}`);
			const nextStart = new Date(`${next.startDate}T${next.startTime}`);

			if (currentEnd > nextStart) {
				errors.push(
					`Time conflict: ${current.title || "Appointment"} overlaps with ${next.title || "Appointment"}`,
				);
			}
		}
	}

	return errors;
}
