import type { CycleType, Policy } from "./types";

export const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

export function describePolicy(
	p: Pick<Policy, "cycleType" | "anchorDay">,
): string {
	switch (p.cycleType) {
		case "calendar_month":
			return "Calendar month (1st → last day, UTC)";
		case "monthly_anchored":
			return `Monthly anchored on day ${p.anchorDay ?? "?"} (cycle runs day ${p.anchorDay} → next day ${p.anchorDay})`;
		case "semi_monthly":
			return `Semi-monthly starting day ${p.anchorDay ?? "?"} (first half + second half)`;
		case "weekly": {
			const dow = p.anchorDay ?? 1;
			return `Weekly starting ${WEEKDAY_NAMES[dow] ?? `day ${dow}`}`;
		}
	}
}

export function anchorDayHint(cycleType: CycleType): string {
	switch (cycleType) {
		case "calendar_month":
			return "Leave empty — calendar_month is fixed to 1st-of-month.";
		case "monthly_anchored":
			return "Day of month: 1–28 (avoid month-length edge cases).";
		case "semi_monthly":
			return "First-half start day: 1–15. Second half begins anchor + 15.";
		case "weekly":
			return "Weekday: 0=Sun, 1=Mon … 6=Sat.";
	}
}

export function isAnchorValid(cycleType: CycleType, raw: string): boolean {
	if (cycleType === "calendar_month") return raw.trim() === "";
	const n = Number.parseInt(raw, 10);
	if (!Number.isInteger(n)) return false;
	if (cycleType === "monthly_anchored") return n >= 1 && n <= 28;
	if (cycleType === "semi_monthly") return n >= 1 && n <= 15;
	if (cycleType === "weekly") return n >= 0 && n <= 6;
	return false;
}
