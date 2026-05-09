import type { InstallmentOverviewItem } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDate(value: string | number | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

export function daysFromNow(date: Date | string): number {
	return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function getInstanceStatus(
	instance: InstallmentOverviewItem,
): "Active" | "Overdue" | "Locked" {
	if (instance.isLocked) return "Locked";
	if (instance.gracePeriodEndsAt) return "Overdue";
	return "Active";
}
