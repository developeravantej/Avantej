/**
 * Maps the UI-layer CustomRecurrence shape (from RepeatRuleSection / useAppointmentFormState)
 * to the API-layer RecurrenceParams shape expected by appointments.create.
 */
import type { CustomRecurrence } from "@/types/appointments";

export type RecurrenceParams = {
	frequencyValue: number;
	timeUnit: "day" | "week" | "month";
	repeatOn?: number[];
	monthlyType?: "day_of_month" | "day_of_week";
	monthlyDayOfWeek?: number;
	monthlyWeekOfMonth?: number;
	endsType: "never" | "on_date" | "after_occurrences";
	endsAfterOccurrences?: number;
	endsOn?: string; // ISO datetime string
};

/**
 * Day-key → weekday number (0=Sun..6=Sat), matching RepeatRuleSection DAYS array.
 * SU=Sunday=0, M=Monday=1, T=Tuesday=2, W=Wednesday=3, TH=Thursday=4, F=Friday=5, S=Saturday=6
 */
const DAYS_MAP: Record<string, number> = {
	SU: 0,
	M: 1,
	T: 2,
	W: 3,
	TH: 4,
	F: 5,
	S: 6,
};

/**
 * Convert a CustomRecurrence (UI form state) into the RecurrenceParams shape
 * expected by the appointments.create API procedure.
 *
 * @param cr - CustomRecurrence from useAppointmentFormState
 * @returns RecurrenceParams ready to pass to client.appointments.create
 */
export function mapCustomRecurrenceToParams(cr: CustomRecurrence): RecurrenceParams {
	const endsType: RecurrenceParams["endsType"] =
		cr.endsType === "on"
			? "on_date"
			: cr.endsType === "after"
				? "after_occurrences"
				: "never";

	// Map monthly type from UI "day" / "week" → API "day_of_month" / "day_of_week"
	const monthlyType: RecurrenceParams["monthlyType"] =
		cr.timeUnit === "month"
			? cr.monthlyType === "week"
				? "day_of_week"
				: "day_of_month"
			: undefined;

	return {
		frequencyValue: cr.frequency,
		timeUnit: cr.timeUnit as "day" | "week" | "month",
		repeatOn:
			cr.timeUnit === "week" && cr.repeatOn && cr.repeatOn.length > 0
				? cr.repeatOn.map((d) => DAYS_MAP[d] ?? 0)
				: undefined,
		monthlyType,
		endsType,
		endsAfterOccurrences: endsType === "after_occurrences" ? (cr.endsOccurrences ?? undefined) : undefined,
		endsOn:
			endsType === "on_date" && cr.endsDate
				? new Date(cr.endsDate + "T23:59:59.999Z").toISOString()
				: undefined,
	};
}
