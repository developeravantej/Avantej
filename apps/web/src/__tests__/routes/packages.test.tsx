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
		mockClient.packages.list.mockResolvedValue([]);
		mockClient.packages.create.mockResolvedValue({ id: "pkg-1" });
		mockClient.packages.update.mockResolvedValue({});
		mockClient.packages.archive.mockResolvedValue({});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<PackagesViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Packages")).toBeInTheDocument();
		});
	});

	test("calls client.packages.list on mount", async () => {
		renderWithProviders(<PackagesViewPage />);

		await waitFor(() => {
			expect(mockClient.packages.list).toHaveBeenCalled();
		});
	});

	test("shows package data in the table", async () => {
		mockClient.packages.list.mockResolvedValue([
			{
				id: "pkg1",
				name: "Gold Membership",
				appointmentType: "private",
				crossUsageEnabled: false,
				sessionCount: 12,
				pricePerSession: 50000,
				maxClientsPerSession: 1,
				expiryDays: 90,
				expiryDate: null,
				autoGenerateInvoice: false,
				branchId: null,
				isArchived: false,
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
