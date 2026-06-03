import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";
import { AnnouncementsWidget } from "@/components/announcements-widget";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
	}),
}));

describe("AnnouncementsWidget", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("renders 'Announcements' heading", async () => {
		mockClient.announcements.listActive.mockResolvedValueOnce([]);
		renderWithProviders(<AnnouncementsWidget />);

		await waitFor(() => {
			expect(screen.getByText("Announcements")).toBeInTheDocument();
		});
	});

	test("calls announcements.listActive (not notifications.list)", async () => {
		mockClient.announcements.listActive.mockResolvedValueOnce([]);
		renderWithProviders(<AnnouncementsWidget />);

		await waitFor(() => {
			expect(mockClient.announcements.listActive).toHaveBeenCalledTimes(1);
			expect(mockClient.notifications.list).not.toHaveBeenCalled();
		});
	});

	test("renders empty state when no announcements", async () => {
		mockClient.announcements.listActive.mockResolvedValueOnce([]);
		renderWithProviders(<AnnouncementsWidget />);

		await waitFor(() => {
			expect(
				screen.getByText("No announcements right now."),
			).toBeInTheDocument();
		});
	});

	test("renders announcements with title and message", async () => {
		mockClient.announcements.listActive.mockResolvedValueOnce([
			{
				id: "ann-1",
				title: "System Maintenance",
				message: "Scheduled downtime at midnight.",
				createdAt: "2026-02-20T10:00:00.000Z",
			},
			{
				id: "ann-2",
				title: "New Feature Release",
				message: "We launched a new dashboard.",
				createdAt: "2026-02-21T08:00:00.000Z",
			},
		]);

		renderWithProviders(<AnnouncementsWidget />);

		await waitFor(() => {
			expect(screen.getByText("System Maintenance")).toBeInTheDocument();
			expect(
				screen.getByText("Scheduled downtime at midnight."),
			).toBeInTheDocument();
			expect(screen.getByText("New Feature Release")).toBeInTheDocument();
			expect(
				screen.getByText("We launched a new dashboard."),
			).toBeInTheDocument();
		});
	});

	test("formats announcement dates", async () => {
		mockClient.announcements.listActive.mockResolvedValueOnce([
			{
				id: "ann-1",
				title: "Test",
				message: "Test message",
				createdAt: "2026-02-20T10:00:00.000Z",
			},
		]);

		renderWithProviders(<AnnouncementsWidget />);

		await waitFor(() => {
			expect(screen.getByText("Test")).toBeInTheDocument();
			// Date should be formatted (e.g., "Feb 20, 2026")
			expect(screen.getByText(/Feb 20, 2026/)).toBeInTheDocument();
		});
	});
});
