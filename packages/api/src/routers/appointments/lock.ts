import { ORPCError } from "@orpc/server";

/**
 * UAT §5 — 24-hour booking lock. Changes to a session are only allowed up to 24h
 * before its start; inside the lock the permitted actions are burn (no-show) /
 * claim (completed), not reschedule/cancel. Admins may override for operational
 * exceptions. Shared by appointments.reschedule + appointments.update (cancel).
 */
const LOCK_MS = 24 * 60 * 60 * 1000;

export function assertOutsideBookingLock(
	startTime: Date,
	member: { role?: string | null } | null | undefined,
	action: "reschedule" | "cancel",
): void {
	if (member?.role === "admin") return;
	if (startTime.getTime() - Date.now() < LOCK_MS) {
		throw new ORPCError("CONFLICT", {
			message: `Cannot ${action} within 24 hours of the session. Contact an admin.`,
		});
	}
}
