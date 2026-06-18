import type { ClassSlotRow, SlotStatus } from "./types";

// ---------------------------------------------------------------------------
// Design token helpers
// ---------------------------------------------------------------------------

// Bar color thresholds: <70% green, 70-99% amber, 100% red
export function fillBarColor(pct: number): string {
	if (pct >= 100) return "bg-red-500";
	if (pct >= 70) return "bg-amber-400";
	return "bg-emerald-500";
}

export function fillPctColor(pct: number): string {
	if (pct >= 100) return "text-red-600 font-bold";
	if (pct >= 70) return "text-amber-600";
	return "text-[#737373]";
}

// Day-of-week short label for a date
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export function slotDayLabel(date: Date): string {
	const jsDay = new Date(date).getDay(); // 0=Sun
	const monFirst = jsDay === 0 ? 6 : jsDay - 1;
	return DAY_SHORT[monFirst] ?? "—";
}

// Duration in minutes
export function durationMinutes(startTime: string, endTime: string): number {
	const [sh, sm] = startTime.split(":").map(Number);
	const [eh, em] = endTime.split(":").map(Number);
	return eh * 60 + em - (sh * 60 + sm);
}

export function deriveStatus(slot: ClassSlotRow): SlotStatus {
	if (slot.isCancelled) return "cancelled";
	if (slot.spotsAvailable === 0) return "full";
	if (slot.waitlistCount > 0) return "waitlist";
	return "open";
}
