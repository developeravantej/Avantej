import { describe, test, expect } from "vitest";
import {
	validateAppointmentSlot,
	validateTimeConflicts,
	type AppointmentSlotInput,
} from "@/lib/appointment-scheduler";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlot(overrides: Partial<AppointmentSlotInput> = {}): AppointmentSlotInput {
	return {
		id: "slot-1",
		selectedServices: ["svc-1"],
		remarks: "",
		startDate: "2026-04-24",
		startTime: "10:00",
		duration: 60,
		assignedTo: "trainer-1",
		roomId: "room-1",
		employeeId: "trainer-1",
		recurrence: "none",
		...overrides,
	};
}

// ─── validateAppointmentSlot ──────────────────────────────────────────────────

describe("validateAppointmentSlot", () => {
	test("returns no errors for a fully valid slot", () => {
		expect(validateAppointmentSlot(makeSlot())).toHaveLength(0);
	});

	test("reports error when no services are selected", () => {
		const errors = validateAppointmentSlot(makeSlot({ selectedServices: [] }));
		expect(errors).toContain("At least one service must be selected");
	});

	test("reports error when startDate is missing", () => {
		const errors = validateAppointmentSlot(makeSlot({ startDate: "" }));
		expect(errors).toContain("Start date is required");
	});

	test("reports error when startTime is missing", () => {
		const errors = validateAppointmentSlot(makeSlot({ startTime: "" }));
		expect(errors).toContain("Start time is required");
	});

	test("reports error when roomId is missing", () => {
		const errors = validateAppointmentSlot(makeSlot({ roomId: "" }));
		expect(errors).toContain("Room selection is required");
	});

	test("accumulates multiple errors simultaneously", () => {
		const errors = validateAppointmentSlot(
			makeSlot({ selectedServices: [], startDate: "", roomId: "" }),
		);
		expect(errors).toHaveLength(3);
	});
});

// ─── validateTimeConflicts ────────────────────────────────────────────────────

describe("validateTimeConflicts", () => {
	test("returns no errors for a single slot", () => {
		expect(validateTimeConflicts([makeSlot()])).toHaveLength(0);
	});

	test("returns no errors when slots are on different days", () => {
		const slotA = makeSlot({ id: "a", startDate: "2026-04-24", startTime: "10:00", endTime: "11:00", title: "A" });
		const slotB = makeSlot({ id: "b", startDate: "2026-04-25", startTime: "10:30", endTime: "11:30", title: "B" });
		expect(validateTimeConflicts([slotA, slotB])).toHaveLength(0);
	});

	test("returns no errors for adjacent non-overlapping slots on the same day", () => {
		const slotA = makeSlot({ id: "a", startDate: "2026-04-24", startTime: "10:00", endTime: "11:00", title: "A" });
		const slotB = makeSlot({ id: "b", startDate: "2026-04-24", startTime: "11:00", endTime: "12:00", title: "B" });
		expect(validateTimeConflicts([slotA, slotB])).toHaveLength(0);
	});

	test("detects overlap when slot B starts before slot A ends", () => {
		const slotA = makeSlot({ id: "a", startDate: "2026-04-24", startTime: "10:00", endTime: "11:00", title: "Morning" });
		const slotB = makeSlot({ id: "b", startDate: "2026-04-24", startTime: "10:30", endTime: "11:30", title: "Overlap" });
		const errors = validateTimeConflicts([slotA, slotB]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatch(/morning.*overlap/i);
	});

	test("uses startTime as fallback when endTime is absent", () => {
		// Slot A ends at startTime (zero-duration), so B at same time should not conflict
		const slotA = makeSlot({ id: "a", startDate: "2026-04-24", startTime: "10:00", endTime: undefined, title: "A" });
		const slotB = makeSlot({ id: "b", startDate: "2026-04-24", startTime: "10:00", endTime: "11:00", title: "B" });
		// currentEnd === nextStart → NOT strictly greater → no conflict
		expect(validateTimeConflicts([slotA, slotB])).toHaveLength(0);
	});

	test("handles unsorted input correctly", () => {
		// Provide in reverse order — function should sort before checking
		const slotA = makeSlot({ id: "a", startDate: "2026-04-24", startTime: "10:00", endTime: "11:00", title: "A" });
		const slotB = makeSlot({ id: "b", startDate: "2026-04-24", startTime: "10:30", endTime: "11:30", title: "B" });
		// Pass B first, A second
		const errors = validateTimeConflicts([slotB, slotA]);
		expect(errors).toHaveLength(1);
	});
});
