import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let PackagesViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		PackagesViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/packages/view"
	);
});

describe("Packages page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.services.list.mockResolvedValue([]);
		mockClient.services.create.mockResolvedValue({ id: "svc-1" });
		mockClient.services.update.mockResolvedValue({});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<PackagesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Packages")).toBeInTheDocument();
		});
	});

	test("calls client.services.list on mount", async () => {
		renderWithProviders(<PackagesViewPage />);

		await waitFor(() => {
			expect(mockClient.services.list).toHaveBeenCalled();
		});
	});

	test("shows package data in the table", async () => {
		mockClient.services.list.mockResolvedValue([
			{
				id: "svc1",
				name: "Gold Membership",
				type: "private",
				sessionCount: 12,
				price: 50000,
				maxAttendees: 1,
				expiryDays: 90,
				expiryDate: null,
				expirable: true,
				branchId: null,
				isActive: true,
				duration: 3600,
				durationUnitType: "minutes",
				schedulingType: "appointment",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<PackagesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Gold Membership")).toBeInTheDocument();
		});
	});

	test("renders New Package button", async () => {
		renderWithProviders(<PackagesViewPage />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /new package/i }),
			).toBeInTheDocument();
		});
	});
});
