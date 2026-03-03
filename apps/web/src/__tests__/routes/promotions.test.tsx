import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let PromotionsViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		PromotionsViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/currency", () => ({
	formatPrice: (cents: number, currency: string) => {
		const amount = cents / 100;
		if (currency.toUpperCase() === "MYR") return `RM ${amount.toFixed(2)}`;
		return `${currency} ${amount.toFixed(2)}`;
	},
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/promotions/view"
	);
});

describe("Promotions page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.promotions.list.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Promotions")).toBeInTheDocument();
		});
	});

	test("renders page heading and 'New Promotion' button", async () => {
		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Promotions")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: /new promotion/i }),
			).toBeInTheDocument();
		});
	});

	test("percentage values displayed as X.XX%", async () => {
		mockClient.promotions.list.mockResolvedValue([
			{
				id: "p1",
				code: "OFF10",
				name: "10% Off",
				type: "percentage",
				value: 1000,
				isActive: true,
				usageCount: 0,
				validFrom: "2026-01-01T00:00:00.000Z",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("10.00%")).toBeInTheDocument();
		});
	});

	test("fixed_amount values displayed as RM X.XX", async () => {
		mockClient.promotions.list.mockResolvedValue([
			{
				id: "p2",
				code: "FLAT5",
				name: "RM 5 Off",
				type: "fixed_amount",
				value: 500,
				isActive: true,
				usageCount: 0,
				validFrom: "2026-01-01T00:00:00.000Z",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("RM 5.00")).toBeInTheDocument();
		});
	});

	test("active promotions show 'Active' badge", async () => {
		mockClient.promotions.list.mockResolvedValue([
			{
				id: "p1",
				code: "PROMO1",
				name: "Test Promo",
				type: "percentage",
				value: 500,
				isActive: true,
				usageCount: 3,
				usageLimit: 100,
				validFrom: "2026-01-01T00:00:00.000Z",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Active")).toBeInTheDocument();
		});
	});

	test("inactive promotions show 'Inactive' badge and no deactivate button", async () => {
		mockClient.promotions.list.mockResolvedValue([
			{
				id: "p1",
				code: "OLD",
				name: "Old Promo",
				type: "percentage",
				value: 500,
				isActive: false,
				usageCount: 0,
				validFrom: "2025-01-01T00:00:00.000Z",
				createdAt: "2025-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Inactive")).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: /deactivate/i }),
			).not.toBeInTheDocument();
		});
	});

	test("displays type badge for each promotion", async () => {
		mockClient.promotions.list.mockResolvedValue([
			{
				id: "p1",
				code: "PCT",
				name: "Percentage Promo",
				type: "percentage",
				value: 500,
				isActive: true,
				usageCount: 0,
				validFrom: "2026-01-01T00:00:00.000Z",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PromotionsViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Percentage")).toBeInTheDocument();
		});
	});
});
