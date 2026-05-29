import { describe, expect, it } from "vitest";
import {
	buildDefaultValues,
	serviceFormSchema,
	type ServiceInitialData,
	toExpiryDays,
} from "@/features/services/service-form-schema";

const UUID = "11111111-1111-4111-8111-111111111111";

function validAppointmentInput(overrides: Record<string, unknown> = {}) {
	return {
		name: "Personal Training",
		categoryId: UUID,
		sessionDurationMinutes: 60,
		maxAttendees: 1,
		price: 10,
		sessions: 0,
		taxable: false,
		expirable: false,
		availablePaymentPlans: [],
		schedulingType: "appointment-based" as const,
		...overrides,
	};
}

describe("serviceFormSchema", () => {
	it("parses a valid appointment-based service and converts price to cents", () => {
		const result = serviceFormSchema.safeParse(validAppointmentInput({ price: 10.5 }));
		expect(result.success).toBe(true);
		if (result.success) {
			// rmToCents(10.5) === 1050
			expect(result.data.price).toBe(1050);
			expect(result.data.schedulingType).toBe("appointment-based");
		}
	});

	it("rejects an empty name", () => {
		const result = serviceFormSchema.safeParse(validAppointmentInput({ name: "" }));
		expect(result.success).toBe(false);
	});

	it("rejects a non-uuid categoryId", () => {
		const result = serviceFormSchema.safeParse(
			validAppointmentInput({ categoryId: "not-a-uuid" }),
		);
		expect(result.success).toBe(false);
	});

	it("requires timePresetConfig when schedulingType is time-preset", () => {
		const missing = serviceFormSchema.safeParse(
			validAppointmentInput({ schedulingType: "time-preset" }),
		);
		expect(missing.success).toBe(false);

		const withConfig = serviceFormSchema.safeParse(
			validAppointmentInput({
				schedulingType: "time-preset",
				timePresetConfig: {
					recurringDays: ["Mon"],
					timeSlotsPerDay: { Mon: ["09:00"] },
				},
			}),
		);
		expect(withConfig.success).toBe(true);
	});

	it("rejects a time-preset with no recurring days", () => {
		const result = serviceFormSchema.safeParse(
			validAppointmentInput({
				schedulingType: "time-preset",
				timePresetConfig: { recurringDays: [], timeSlotsPerDay: {} },
			}),
		);
		expect(result.success).toBe(false);
	});
});

describe("buildDefaultValues", () => {
	it("returns create defaults when no initialData", () => {
		const defaults = buildDefaultValues();
		expect(defaults.schedulingType).toBe("appointment-based");
		expect(defaults.price).toBe(0);
		expect(defaults.sessionDurationMinutes).toBe(60);
		expect(defaults.taxPercentage).toBe(6);
		expect(defaults.availablePaymentPlans).toEqual([]);
	});

	it("maps appointment-based initialData", () => {
		const initial: ServiceInitialData = {
			id: "svc-1",
			name: "PT",
			categoryId: UUID,
			sessionDurationMinutes: 45,
			maxAttendees: 2,
			price: 99,
			sessions: 10,
			taxable: true,
			taxPercentage: 8,
			expirable: true,
			duration: 3,
			duration_unit: "month",
			schedulingType: "appointment-based",
			availablePaymentPlans: ["plan-a"],
			installmentIntervalDays: 30,
			gracePeriodDays: 7,
		};
		const defaults = buildDefaultValues(initial);
		expect(defaults.schedulingType).toBe("appointment-based");
		expect(defaults.name).toBe("PT");
		expect(defaults.price).toBe(99);
		expect(defaults).not.toHaveProperty("timePresetConfig");
	});

	it("includes timePresetConfig for time-preset initialData", () => {
		const initial: ServiceInitialData = {
			id: "svc-2",
			name: "Class",
			categoryId: UUID,
			sessionDurationMinutes: 60,
			maxAttendees: 10,
			price: 50,
			sessions: 0,
			taxable: false,
			taxPercentage: 0,
			expirable: false,
			duration: 1,
			duration_unit: "day",
			schedulingType: "time-preset",
			availablePaymentPlans: [],
			installmentIntervalDays: 30,
			gracePeriodDays: null,
			timePresetConfig: {
				recurringDays: ["Tue"],
				timeSlotsPerDay: { Tue: ["18:00"] },
			},
		};
		const defaults = buildDefaultValues(initial);
		expect(defaults.schedulingType).toBe("time-preset");
		expect(
			(defaults as { timePresetConfig: { recurringDays: string[] } })
				.timePresetConfig.recurringDays,
		).toEqual(["Tue"]);
	});

	it("falls back to an empty timePresetConfig when missing on a time-preset record", () => {
		const initial = {
			id: "svc-3",
			name: "Class",
			categoryId: UUID,
			sessionDurationMinutes: 60,
			maxAttendees: 10,
			price: 50,
			sessions: 0,
			taxable: false,
			taxPercentage: 0,
			expirable: false,
			duration: 1,
			duration_unit: "day",
			schedulingType: "time-preset",
			availablePaymentPlans: [],
			installmentIntervalDays: 30,
			gracePeriodDays: null,
		} as ServiceInitialData;
		const defaults = buildDefaultValues(initial) as {
			timePresetConfig: { recurringDays: string[]; timeSlotsPerDay: object };
		};
		expect(defaults.timePresetConfig).toEqual({
			recurringDays: [],
			timeSlotsPerDay: {},
		});
	});
});

describe("toExpiryDays", () => {
	it("converts each unit to days", () => {
		expect(toExpiryDays(5, "day")).toBe(5);
		expect(toExpiryDays(2, "week")).toBe(14);
		expect(toExpiryDays(3, "month")).toBe(90);
		expect(toExpiryDays(1, "year")).toBe(365);
	});

	it("treats an unknown unit as days", () => {
		expect(toExpiryDays(4, "fortnight")).toBe(4);
	});
});
