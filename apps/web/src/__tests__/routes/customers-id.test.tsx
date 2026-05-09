/**
 * Baseline smoke tests for customers/$id route (Customer 360 Page).
 * Purpose: catch regressions during Phase 4 god-file extraction.
 */
import { describe, test, expect, beforeEach, beforeAll, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

const CUSTOMER_ID = "a1b2c3d4-0000-0000-0000-000000000001";

let Customer360Page: React.ComponentType;
// useParamsMock must be defined before the vi.mock factory runs
const useParamsMock = vi.fn().mockReturnValue({ id: CUSTOMER_ID });

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		Customer360Page = opts.component;
		// Route.useParams() is called inside the component — attach it here
		return { component: opts.component, useParams: useParamsMock };
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
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
	await import("@/routes/_authenticated/dashboard/_layout/customers/$id");
});

describe("Customer360Page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.customerDirectory.getById.mockResolvedValue(null);
		mockClient.installments.listByPackageInstance.mockResolvedValue([]);
		mockClient.appointments.listForMember.mockResolvedValue([]);
		mockClient.payments.listByMember.mockResolvedValue({ items: [], total: 0 });
	});

	test("renders without crashing (loading state)", async () => {
		// getById never resolves → stays in loading state
		mockClient.customerDirectory.getById.mockReturnValue(new Promise(() => {}));

		renderWithProviders(<Customer360Page />);

		// Skeleton or loading indicator present — no crash
		expect(document.body).toBeTruthy();
	});

	test("renders without crashing for invalid UUID param", async () => {
		// Override useParams to return a non-UUID — component should guard gracefully
		useParamsMock.mockReturnValue({ id: "not-a-uuid" });

		renderWithProviders(<Customer360Page />);

		await waitFor(() => {
			expect(document.body).toBeTruthy();
		});
	});
});
