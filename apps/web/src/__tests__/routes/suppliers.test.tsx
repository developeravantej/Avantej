import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let SuppliersViewPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		SuppliersViewPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: {
		suppliers: {
			list: {
				key: () => ["suppliers", "list"],
			},
		},
	},
}));
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
		"@/routes/_authenticated/dashboard/_layout/suppliers/view"
	);
});

describe("Suppliers page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.suppliers.list.mockResolvedValue([]);
		mockClient.suppliers.create.mockResolvedValue({ id: "sup-1" });
		mockClient.suppliers.update.mockResolvedValue({});
		mockClient.suppliers.deactivate.mockResolvedValue({});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<SuppliersViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Suppliers")).toBeInTheDocument();
		});
	});

	test("calls client.suppliers.list on mount", async () => {
		renderWithProviders(<SuppliersViewPage />);

		await waitFor(() => {
			expect(mockClient.suppliers.list).toHaveBeenCalled();
		});
	});

	test("shows supplier data in the table", async () => {
		mockClient.suppliers.list.mockResolvedValue([
			{
				id: "s1",
				name: "Acme Corp",
				contactPerson: "John",
				email: "john@acme.com",
				contactPhone: "+60123456789",
				officePhone: null,
				description: null,
				accountNumber: null,
				paymentTerms: null,
				website: null,
				barcode: null,
				isActive: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<SuppliersViewPage />);

		await waitFor(() => {
			expect(screen.getByText("Acme Corp")).toBeInTheDocument();
		});
	});

	test("renders Add Supplier button", async () => {
		renderWithProviders(<SuppliersViewPage />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add supplier/i }),
			).toBeInTheDocument();
		});
	});
});
