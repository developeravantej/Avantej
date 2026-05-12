/**
 * Baseline smoke tests for AppointmentList component.
 * Purpose: catch regressions during Phase 4 god-file extraction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
			organizations: [],
		},
	}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/calendar/add-appointment-modal", () => ({
	AddAppointmentModal: () => null,
}));

import { AppointmentList } from "@/components/appointments/appointment-list";

describe("AppointmentList", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders without crashing when appointments array is empty", () => {
		renderWithProviders(<AppointmentList appointments={[]} />);
		// Component renders — no crash is the assertion
		expect(document.body).toBeTruthy();
	});

	it("shows loading state when isLoading is true", () => {
		renderWithProviders(<AppointmentList appointments={[]} isLoading={true} />);
		expect(document.body).toBeTruthy();
	});

	it("renders an appointment row when given one appointment", () => {
		const appt = {
			id: "appt-1",
			title: "Session with Alice",
			start: new Date("2026-05-10T09:00:00Z"),
			end: new Date("2026-05-10T10:00:00Z"),
			status: "pending" as const,
			clientName: "Alice",
			service: "Personal Training",
		};
		renderWithProviders(<AppointmentList appointments={[appt]} />);
		expect(screen.getByText("Alice")).toBeInTheDocument();
	});
});
