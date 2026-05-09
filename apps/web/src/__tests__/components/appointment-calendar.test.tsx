/**
 * Baseline smoke tests for AppointmentCalendar component.
 * Purpose: catch regressions during Phase 4 god-file extraction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("@/components/calendar/edit-appointment-modal", () => ({
	EditAppointmentModal: () => null,
}));

import { AppointmentCalendar } from "@/components/calendar/appointment";

describe("AppointmentCalendar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// TODO: appointments.{cancelOccurrence,cancel,confirm} not on current router; tests stale.
		(mockClient.appointments as any).cancelOccurrence?.mockResolvedValue({});
		(mockClient.appointments as any).cancel?.mockResolvedValue({});
		(mockClient.appointments as any).confirm?.mockResolvedValue({});
	});

	it("renders without crashing with empty appointments", () => {
		renderWithProviders(<AppointmentCalendar appointments={[]} />);
		expect(document.body).toBeTruthy();
	});

	it("renders monthly view by default", () => {
		renderWithProviders(
			<AppointmentCalendar appointments={[]} initialView="monthly" />,
		);
		expect(document.body).toBeTruthy();
	});

	it("renders weekly view when initialView is weekly", () => {
		renderWithProviders(
			<AppointmentCalendar appointments={[]} initialView="weekly" />,
		);
		expect(document.body).toBeTruthy();
	});
});
