/**
 * Shared schema, types, and default-value helpers for the service form.
 * Extracted from service-form so the form component stays a thin view layer
 * and the validation/defaults logic is independently testable.
 *
 * - Prices use z.number().transform((v) => rmToCents(v))
 * - timePresetConfig is persisted as a jsonb column when schedulingType = "class_slot"
 * - schedulingType maps: UI "appointment-based" → wire "appointment"; UI "time-preset" → wire "class_slot"
 */

import * as z from "zod";
import { rmToCents } from "@/lib/money";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const timePresetConfigSchema = z.object({
	recurringDays: z.array(z.string()).min(1, "Pick at least one day"),
	timeSlotsPerDay: z.record(z.string(), z.array(z.string()).min(1)),
});

export const baseServiceFields = z.object({
	name: z
		.string()
		.min(1, "Service name is required")
		.max(200, "Name must be 200 characters or fewer"),
	categoryId: z.string().uuid("Category is required"),
	sessionDurationMinutes: z
		.number()
		.int()
		.min(1, "Duration must be at least 1 minute"),
	maxAttendees: z.number().int().min(1, "Must have at least 1 attendee"),
	price: z
		.number({ message: "Price is required" })
		.min(0, "Price must be 0 or more")
		.transform((v) => rmToCents(v)),
	sessions: z.number().int().min(0, "Sessions cannot be negative"),
	taxable: z.boolean(),
	taxPercentage: z.number().int().min(0).max(100).optional(),
	expirable: z.boolean(),
	duration: z.number().int().min(1).optional(),
	duration_unit: z.enum(["day", "week", "month", "year"]).optional(),
	availablePaymentPlans: z.array(z.string()),
	installmentIntervalDays: z.number().int().min(1).optional(),
	gracePeriodDays: z.number().int().min(0).max(90).nullable().optional(),
});

export const serviceFormSchema = baseServiceFields.and(
	z.discriminatedUnion("schedulingType", [
		z.object({ schedulingType: z.literal("appointment-based") }),
		z.object({
			schedulingType: z.literal("time-preset"),
			timePresetConfig: timePresetConfigSchema,
		}),
	]),
);

export type ServiceFormInput = z.input<typeof serviceFormSchema>;
export type ServiceFormOutput = z.output<typeof serviceFormSchema>;

// ---------------------------------------------------------------------------
// Props / initial data shape
// ---------------------------------------------------------------------------

export interface ServiceInitialData {
	id: string;
	name: string;
	categoryId: string;
	sessionDurationMinutes: number;
	maxAttendees: number;
	/** Price in dollars (data-table pre-divides by 100) */
	price: number;
	sessions: number;
	taxable: boolean;
	taxPercentage: number;
	expirable: boolean;
	duration: number;
	duration_unit: string;
	schedulingType: "appointment-based" | "time-preset";
	availablePaymentPlans: string[];
	installmentIntervalDays: number;
	gracePeriodDays: number | null;
	timePresetConfig?: {
		recurringDays: string[];
		timeSlotsPerDay: Record<string, string[]>;
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toExpiryDays(duration: number, unit: string): number {
	if (unit === "year") return duration * 365;
	if (unit === "month") return duration * 30;
	if (unit === "week") return duration * 7;
	return duration;
}

export function buildDefaultValues(
	initialData?: ServiceInitialData,
): ServiceFormInput {
	if (initialData) {
		const base = {
			name: initialData.name,
			categoryId: initialData.categoryId,
			sessionDurationMinutes: initialData.sessionDurationMinutes,
			maxAttendees: initialData.maxAttendees,
			price: initialData.price,
			sessions: initialData.sessions,
			taxable: initialData.taxable,
			taxPercentage: initialData.taxPercentage ?? 6,
			expirable: initialData.expirable,
			duration: initialData.duration ?? 1,
			duration_unit:
				(initialData.duration_unit as "day" | "week" | "month" | "year") ??
				"day",
			availablePaymentPlans: initialData.availablePaymentPlans ?? [],
			installmentIntervalDays: initialData.installmentIntervalDays ?? 30,
			gracePeriodDays: initialData.gracePeriodDays ?? null,
		};
		if (initialData.schedulingType === "time-preset") {
			return {
				...base,
				schedulingType: "time-preset" as const,
				timePresetConfig: initialData.timePresetConfig ?? {
					recurringDays: [],
					timeSlotsPerDay: {},
				},
			};
		}
		return { ...base, schedulingType: "appointment-based" as const };
	}
	return {
		name: "",
		categoryId: "",
		sessionDurationMinutes: 60,
		maxAttendees: 1,
		price: 0,
		sessions: 0,
		taxable: false,
		taxPercentage: 6,
		expirable: false,
		duration: 1,
		duration_unit: "day",
		schedulingType: "appointment-based",
		availablePaymentPlans: [],
		installmentIntervalDays: 30,
		gracePeriodDays: null,
	};
}
