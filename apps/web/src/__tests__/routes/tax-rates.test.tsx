import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let TaxRatesPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		TaxRatesPage = opts.component;
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
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/settings/tax-rates"
	);
});

describe("Tax Rates page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.taxRates.list.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getByText(/Tax Rates/)).toBeInTheDocument();
		});
	});

	test("renders page heading and 'Add Tax Rate' button", async () => {
		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getByText(/Tax Rates/)).toBeInTheDocument();
			expect(
				screen.getAllByRole("button", { name: /new tax rate|add tax rate/i })[0],
			).toBeInTheDocument();
		});
	});

	test("rate 800 basis points displays as '8.00%'", async () => {
		mockClient.taxRates.list.mockResolvedValue([
			{
				id: "rate-1",
				name: "SST 8%",
				code: "SST08",
				rateInBasisPoints: 800,
				category: "SST",
				isDefault: false,
				isActive: true,
				effectiveFrom: "2026-01-01",
				createdAt: "2026-01-01",
			},
		]);

		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getByText("8.00%")).toBeInTheDocument();
		});
	});

	test("deactivate button is disabled for default tax rate", async () => {
		mockClient.taxRates.list.mockResolvedValue([
			{
				id: "rate-1",
				name: "SST 8%",
				code: "SST08",
				rateInBasisPoints: 800,
				category: "SST",
				isDefault: true,
				isActive: true,
				effectiveFrom: "2026-01-01",
				createdAt: "2026-01-01",
			},
		]);

		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getAllByText("SST 8%")[0]).toBeInTheDocument();
		});

		const deactivateButton = screen.getByRole("button", {
			name: /deactivate/i,
		});
		expect(deactivateButton).toBeDisabled();
	});

	test("non-default rate has enabled deactivate button", async () => {
		mockClient.taxRates.list.mockResolvedValue([
			{
				id: "rate-1",
				name: "GST 6%",
				code: "GST06",
				rateInBasisPoints: 600,
				category: "GST",
				isDefault: false,
				isActive: true,
				effectiveFrom: "2026-01-01",
				createdAt: "2026-01-01",
			},
		]);

		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getByText("GST 6%")).toBeInTheDocument();
		});

		const deactivateButton = screen.getByRole("button", {
			name: /deactivate/i,
		});
		expect(deactivateButton).not.toBeDisabled();
	});

	test("displays Active badge for active rates", async () => {
		mockClient.taxRates.list.mockResolvedValue([
			{
				id: "rate-1",
				name: "Test Rate",
				code: "TEST",
				rateInBasisPoints: 500,
				category: "custom",
				isDefault: false,
				isActive: true,
				effectiveFrom: "2026-01-01",
				createdAt: "2026-01-01",
			},
		]);

		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			// Multiple "Active" elements: filter button + status badge
			const activeElements = screen.getAllByText("Active");
			expect(activeElements.length).toBeGreaterThanOrEqual(2);
		});
	});

	test("displays category label correctly", async () => {
		mockClient.taxRates.list.mockResolvedValue([
			{
				id: "rate-1",
				name: "Service Tax Rate",
				code: "SVC",
				rateInBasisPoints: 600,
				category: "service_tax",
				isDefault: false,
				isActive: true,
				effectiveFrom: "2026-01-01",
				createdAt: "2026-01-01",
			},
		]);

		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getByText("Service Tax")).toBeInTheDocument();
		});
	});

	test("shows filter toggle between Active and All", async () => {
		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			const buttons = screen.getAllByRole("button");
			const activeBtn = buttons.find((b) => b.textContent === "Active");
			const allBtn = buttons.find((b) => b.textContent === "All");
			expect(activeBtn).toBeTruthy();
			expect(allBtn).toBeTruthy();
		});
	});
});
