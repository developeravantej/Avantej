import { describe, expect, it } from "vitest";
import {
	buildDefaultValues,
	serviceFormSchema,
	type ServiceInitialData,
	toExpiryDays,
} from "@/features/services/service-form-schema";

const UUID = "11111111-1111-4111-8111-111111111111";

function validInput(overrides: Record<string, unknown> = {}) {
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
		...overrides,
	};
}

describe("serviceFormSchema", () => {
	it("parses a valid service and converts price to cents", () => {
		const result = serviceFormSchema.safeParse(validInput({ price: 10.5 }));
		expect(result.success).toBe(true);
		if (result.success) {
			// rmToCents(10.5) === 1050
			expect(result.data.price).toBe(1050);
		}
	});

	it("rejects an empty name", () => {
		const result = serviceFormSchema.safeParse(validInput({ name: "" }));
		expect(result.success).toBe(false);
	});

	it("rejects a non-uuid categoryId", () => {
		const result = serviceFormSchema.safeParse(
			validInput({ categoryId: "not-a-uuid" }),
		);
		expect(result.success).toBe(false);
	});

	it("accepts timePresetConfig when provided", () => {
		const result = serviceFormSchema.safeParse(
			validInput({
				timePresetConfig: {
					recurringDays: ["Mon"],
					timeSlotsPerDay: { Mon: ["09:00"] },
				},
			}),
		);
		expect(result.success).toBe(true);
	});

	it("rejects a timePresetConfig with no recurring days", () => {
		const result = serviceFormSchema.safeParse(
			validInput({
				timePresetConfig: { recurringDays: [], timeSlotsPerDay: {} },
			}),
		);
		expect(result.success).toBe(false);
	});
});

describe("buildDefaultValues", () => {
	it("returns create defaults when no initialData", () => {
		const defaults = buildDefaultValues();
		expect(defaults.price).toBe(0);
		expect(defaults.sessionDurationMinutes).toBe(60);
		expect(defaults.taxPercentage).toBe(6);
		expect(defaults.availablePaymentPlans).toEqual([]);
		expect(defaults.timePresetConfig).toBeUndefined();
	});

	it("maps initialData without timePresetConfig", () => {
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
			availablePaymentPlans: ["plan-a"],
			installmentIntervalDays: 30,
			gracePeriodDays: 7,
		};
		const defaults = buildDefaultValues(initial);
		expect(defaults.name).toBe("PT");
		expect(defaults.price).toBe(99);
		expect(defaults.timePresetConfig).toBeUndefined();
	});

	it("includes timePresetConfig when provided in initialData", () => {
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
			availablePaymentPlans: [],
			installmentIntervalDays: 30,
			gracePeriodDays: null,
			timePresetConfig: {
				recurringDays: ["Tue"],
				timeSlotsPerDay: { Tue: ["18:00"] },
			},
		};
		const defaults = buildDefaultValues(initial);
		expect(defaults.timePresetConfig?.recurringDays).toEqual(["Tue"]);
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
