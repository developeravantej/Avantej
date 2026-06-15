import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

let RouteComponent: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		RouteComponent = opts.component;
		return {
			component: opts.component,
			useSearch: () => ({ tab: "units" }),
			useNavigate: () => () => {},
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => children,
	useNavigate: () => () => {},
	useSearch: () => ({ tab: "units" }),
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
}));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "996febce-aaad-4ded-8f47-02d2b566c8ee" },
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/uom/view");
});

describe("Unit of Measure page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.unitsOfMeasure.list.mockResolvedValue([]);
		mockClient.unitsOfMeasure.create.mockResolvedValue({ id: "uom-1" });
		mockClient.unitsOfMeasure.update.mockResolvedValue({});
		mockClient.unitsOfMeasure.delete.mockResolvedValue({});
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<RouteComponent />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add uom/i }),
			).toBeInTheDocument();
		});
	});

	test("calls client.unitsOfMeasure.list on mount", async () => {
		renderWithProviders(<RouteComponent />);

		await waitFor(() => {
			expect(mockClient.unitsOfMeasure.list).toHaveBeenCalled();
		});
	});

	test("shows UOM data when resolved", async () => {
		mockClient.unitsOfMeasure.list.mockResolvedValue([
			{
				id: "u1",
				name: "Kilogram",
				description: "Weight unit",
				baseUomId: null,
				conversionFactor: "1",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		]);

		renderWithProviders(<RouteComponent />);

		await waitFor(() => {
			expect(screen.getByText("Kilogram")).toBeInTheDocument();
		});
	});
});
