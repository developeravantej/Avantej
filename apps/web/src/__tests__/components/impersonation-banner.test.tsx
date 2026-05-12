import { describe, test, expect, beforeEach, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { ImpersonationBanner } from "@/components/impersonation-banner";

// Use vi.hoisted so that mock functions are available at hoist-time when vi.mock factories run
const { mockGetImpersonationStatus, mockStopImpersonating, mockInvalidateQueries } =
	vi.hoisted(() => ({
		mockGetImpersonationStatus: vi.fn(),
		mockStopImpersonating: vi.fn(),
		mockInvalidateQueries: vi.fn(),
	}));

// Inline mock — do not extend shared mock-client.ts (different namespace)
vi.mock("@/utils/orpc", () => ({
	client: {
		admin: {
			getImpersonationStatus: mockGetImpersonationStatus,
			stopImpersonating: mockStopImpersonating,
		},
	},
	queryClient: {
		invalidateQueries: mockInvalidateQueries,
	},
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	// Provide a writable window.location for redirect assertions
	Object.defineProperty(window, "location", {
		value: { href: "" },
		writable: true,
	});
});

describe("ImpersonationBanner", () => {
	test("renders null when isImpersonating is false", async () => {
		mockGetImpersonationStatus.mockResolvedValue({ isImpersonating: false });

		const { container } = renderWithProviders(<ImpersonationBanner />);

		await waitFor(() => {
			expect(mockGetImpersonationStatus).toHaveBeenCalledWith({});
		});

		// Banner should not be rendered
		expect(container.firstChild).toBeNull();
	});

	test("renders null while data is loading (query pending)", () => {
		// Never resolves — query stays loading
		mockGetImpersonationStatus.mockReturnValue(new Promise(() => {}));

		const { container } = renderWithProviders(<ImpersonationBanner />);

		// data is undefined → isImpersonating !== true → renders null
		expect(container.firstChild).toBeNull();
	});

	test("renders banner with impersonated email when type is 'platform'", async () => {
		mockGetImpersonationStatus.mockResolvedValue({
			isImpersonating: true,
			type: "platform",
			adminUser: { id: "admin-1", email: "admin@avantej.com", name: "Admin" },
			impersonatedUser: { id: "user-1", email: "jane@acme.com", name: "Jane" },
		});

		renderWithProviders(<ImpersonationBanner />);

		await waitFor(() => {
			expect(screen.getByText("jane@acme.com")).toBeInTheDocument();
		});

		// adminUser.email appears as inline text in the same <p>, so use a regex
		expect(screen.getByText(/admin@avantej\.com/)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /stop impersonating/i }),
		).toBeInTheDocument();
	});

	test("type 'platform' — clicking Stop calls admin.stopImpersonating", async () => {
		mockGetImpersonationStatus.mockResolvedValue({
			isImpersonating: true,
			type: "platform",
			adminUser: { id: "admin-1", email: "admin@avantej.com", name: "Admin" },
			impersonatedUser: { id: "user-1", email: "jane@acme.com", name: "Jane" },
		});
		mockStopImpersonating.mockResolvedValue({
			success: true,
			redirectTo: "/dashboard/platform-admin/users",
		});

		renderWithProviders(<ImpersonationBanner />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /stop impersonating/i }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

		await waitFor(() => {
			expect(mockStopImpersonating).toHaveBeenCalledWith({});
		});
	});

	test("type 'tenant' — clicking Stop ALSO calls admin.stopImpersonating (Phase 3 temporary fallback; Phase 7 will route to tenantAdmin.stopImpersonating)", async () => {
		// TODO Phase 7: update this test to assert client.tenantAdmin.stopImpersonating({})
		// is called when type === 'tenant', once that procedure exists.
		mockGetImpersonationStatus.mockResolvedValue({
			isImpersonating: true,
			type: "tenant",
			adminUser: {
				id: "admin-2",
				email: "franchisee@acme.com",
				name: "Franchisee",
			},
			impersonatedUser: {
				id: "user-2",
				email: "staff@acme.com",
				name: "Staff",
			},
		});
		mockStopImpersonating.mockResolvedValue({
			success: true,
			redirectTo: "/dashboard/platform-admin/users",
		});

		renderWithProviders(<ImpersonationBanner />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /stop impersonating/i }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

		await waitFor(() => {
			// Phase 3 fallback: tenant type still calls admin.stopImpersonating
			expect(mockStopImpersonating).toHaveBeenCalledWith({});
		});
	});

	test("button is disabled and shows 'Stopping…' while mutation is pending", async () => {
		mockGetImpersonationStatus.mockResolvedValue({
			isImpersonating: true,
			type: "platform",
			adminUser: { id: "admin-1", email: "admin@avantej.com", name: "Admin" },
			impersonatedUser: { id: "user-1", email: "jane@acme.com", name: "Jane" },
		});
		// Never resolves — keeps mutation in isPending state
		mockStopImpersonating.mockReturnValue(new Promise(() => {}));

		renderWithProviders(<ImpersonationBanner />);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /stop impersonating/i }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /stopping/i })).toBeDisabled();
		});
	});
});
