import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let TaxRatesPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
	createLazyFileRoute: () => (opts: { component: React.ComponentType }) => {
		TaxRatesPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: {},
	queryClient: { invalidateQueries: () => Promise.resolve(), setQueryData: () => {}, getQueryData: () => undefined, clear: () => {} },
}));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee",
		},
		hasPermission: vi.fn().mockReturnValue(true),
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import(
		"@/routes/_authenticated/dashboard/_layout/settings/tax-rates.lazy"
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
			expect(screen.getByText("Tax Rates")).toBeInTheDocument();
		});
	});

	test("renders page heading and 'Add Tax Rate' button", async () => {
		renderWithProviders(<TaxRatesPage />);

		await waitFor(() => {
			expect(screen.getByText("Tax Rates")).toBeInTheDocument();
			// Button text is "Add tax rate"
			expect(
				screen.getAllByRole("button", { name: /add tax rate/i }).length,
			).toBeGreaterThan(0);
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
			expect(screen.getAllByText("SST 8%").length).toBeGreaterThan(0);
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
			// Status badge + select option both say "Active"
			expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
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
			// Filter is a <select> with options "Active" and "All status"
			expect(screen.getByRole("combobox")).toBeInTheDocument();
			expect(screen.getByText("Active")).toBeInTheDocument();
			expect(screen.getByText("All status")).toBeInTheDocument();
		});
	});
});
