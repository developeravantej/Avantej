import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let PurchaseOrdersPage: React.ComponentType;
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => () => ({}),
	createLazyFileRoute: () => (opts: { component: React.ComponentType }) => {
		PurchaseOrdersPage = opts.component;
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
		"@/routes/_authenticated/dashboard/_layout/purchase-orders/view.lazy"
	);
});

describe("Purchase Orders page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.purchaseOrders.list.mockResolvedValue([]);
	});

	test("renders without crashing (empty state)", async () => {
		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Purchase Orders" })).toBeInTheDocument();
		});
	});

	test("renders 'New PO' button", async () => {
		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(
				screen.getAllByRole("button", { name: /new po/i }).length,
			).toBeGreaterThan(0);
		});
	});

	test("renders purchase orders in table", async () => {
		mockClient.purchaseOrders.list.mockResolvedValue([
			{
				id: "po-1",
				purchaseOrderNumber: "PO-2026-001",
				supplierId: "supplier-abc-def",
				branchId: "branch-123-456",
				orderDate: "2026-02-15T00:00:00.000Z",
				totalAmount: 150000,
				status: "draft",
				createdAt: "2026-02-15T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(screen.getByText("PO-2026-001")).toBeInTheDocument();
		});
	});

	test("draft PO shows Approve and Cancel buttons", async () => {
		mockClient.purchaseOrders.list.mockResolvedValue([
			{
				id: "po-1",
				purchaseOrderNumber: "PO-2026-001",
				supplierId: "supplier-abc-def",
				branchId: "branch-123-456",
				orderDate: "2026-02-15T00:00:00.000Z",
				totalAmount: 150000,
				status: "draft",
				createdAt: "2026-02-15T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /approve/i }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: /cancel/i }),
			).toBeInTheDocument();
		});
	});

	test("received PO shows 'Received' badge and no action buttons", async () => {
		mockClient.purchaseOrders.list.mockResolvedValue([
			{
				id: "po-2",
				purchaseOrderNumber: "PO-2026-002",
				supplierId: "supplier-abc",
				branchId: "branch-123",
				orderDate: "2026-01-01T00:00:00.000Z",
				totalAmount: 50000,
				status: "received",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(screen.getByText("PO-2026-002")).toBeInTheDocument();
			expect(screen.getByText("Received")).toBeInTheDocument();
		});

		expect(
			screen.queryByRole("button", { name: /approve/i }),
		).not.toBeInTheDocument();
	});

	test("displays total amount in RM (cents to RM)", async () => {
		mockClient.purchaseOrders.list.mockResolvedValue([
			{
				id: "po-1",
				purchaseOrderNumber: "PO-2026-003",
				supplierId: "supplier-abc",
				branchId: "branch-123",
				orderDate: "2026-02-01T00:00:00.000Z",
				totalAmount: 250000,
				status: "draft",
				createdAt: "2026-02-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(screen.getByText(/2,500\.00/)).toBeInTheDocument();
		});
	});

	test("cancelled PO shows 'Cancelled' badge", async () => {
		mockClient.purchaseOrders.list.mockResolvedValue([
			{
				id: "po-1",
				purchaseOrderNumber: "PO-001",
				supplierId: "s1",
				branchId: "b1",
				orderDate: "2026-01-01T00:00:00.000Z",
				totalAmount: 10000,
				status: "cancelled",
				createdAt: "2026-01-01T00:00:00.000Z",
			},
		]);

		renderWithProviders(<PurchaseOrdersPage />);

		await waitFor(() => {
			expect(screen.getByText("Cancelled")).toBeInTheDocument();
		});
	});
});
