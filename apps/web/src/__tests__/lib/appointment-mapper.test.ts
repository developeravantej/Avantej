import { describe, expect, it } from "vitest";
import {
	type ApiAppointment,
	mapApiAppointmentToCalendar,
} from "@/lib/appointment-mapper";

function api(overrides: Partial<ApiAppointment> = {}): ApiAppointment {
	return {
		id: "appt-1",
		startTime: "2026-05-15T09:00:00.000Z",
		endTime: "2026-05-15T10:00:00.000Z",
		status: "confirmed",
		...overrides,
	};
}

describe("mapApiAppointmentToCalendar", () => {
	it("coerces ISO string times into Date objects", () => {
		const result = mapApiAppointmentToCalendar(api());
		expect(result.start).toBeInstanceOf(Date);
		expect(result.end).toBeInstanceOf(Date);
		expect(result.start.toISOString()).toBe("2026-05-15T09:00:00.000Z");
	});

	it("passes through Date instances unchanged", () => {
		const start = new Date("2026-05-15T09:00:00.000Z");
		const result = mapApiAppointmentToCalendar(
			api({ startTime: start, endTime: start }),
		);
		expect(result.start).toBe(start);
	});

	it.each([
		["pending", "pending"],
		["confirmed", "confirmed"],
		["completed", "confirmed"],
		["rescheduled", "confirmed"],
		["disputed", "cancelled"],
		["cancelled", "cancelled"],
		["no-show", "cancelled"],
	])("maps API status %s to calendar status %s", (input, expected) => {
		expect(mapApiAppointmentToCalendar(api({ status: input })).status).toBe(
			expected,
		);
	});

	it("falls back to 'pending' for an unknown status", () => {
		expect(mapApiAppointmentToCalendar(api({ status: "weird" })).status).toBe(
			"pending",
		);
	});

	it("uses a default title when description is missing or blank", () => {
		expect(mapApiAppointmentToCalendar(api({ description: "   " })).title).toBe(
			"Appointment",
		);
		expect(
			mapApiAppointmentToCalendar(api({ description: "Leg day" })).title,
		).toBe("Leg day");
	});

	it("prefers enriched names and falls back to id snippets", () => {
		const enriched = mapApiAppointmentToCalendar(
			api({
				clientName: "Jane",
				serviceName: "PT",
				trainerName: "Coach",
				trainerId: "t-1",
			}),
		);
		expect(enriched.clientName).toBe("Jane");
		expect(enriched.service).toBe("PT");
		expect(enriched.assignedTo).toEqual({ id: "t-1", name: "Coach" });

		const bare = mapApiAppointmentToCalendar(api());
		expect(bare.clientName).toBe("—");
		expect(bare.service).toBe("—");
		expect(bare.assignedTo).toBeUndefined();
	});
});
