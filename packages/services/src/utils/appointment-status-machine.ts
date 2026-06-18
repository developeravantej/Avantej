// Valid status transitions for appointments
const VALID_TRANSITIONS: Record<string, string[]> = {
	pending: ["confirmed", "cancelled", "no-show", "rescheduled"],
	confirmed: ["completed", "cancelled", "no-show", "rescheduled"],
	rescheduled: ["confirmed", "completed", "cancelled", "no-show"],
	completed: ["disputed"],
	disputed: [], // terminal
	cancelled: [], // terminal
	"no-show": [], // terminal
};

export function assertValidTransition(from: string, to: string): void {
	const allowed = VALID_TRANSITIONS[from];
	if (!allowed) throw new Error(`Unknown appointment status: ${from}`);
	if (!allowed.includes(to)) {
		throw new Error(`Invalid status transition: ${from} → ${to}`);
	}
}
