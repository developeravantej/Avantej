import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let ApprovalsPage: React.ComponentType;
const useSearchMock = vi.fn();
const useNavigateMock = vi.fn().mockReturnValue(vi.fn());

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		ApprovalsPage = opts.component;
		return {
			component: opts.component,
			useSearch: useSearchMock,
			useNavigate: useNavigateMock,
		};
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useNavigate: useNavigateMock,
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness",
					role: "admin",
					hierarchy: {
						member: { id: "member-caller", accessibleNodeIds: ["node-1"] },
					},
				},
			],
		},
		hasPermission: () => true,
		hasRole: () => true,
	}),
}));
vi.mock("@/hooks/useApiMutation", () => ({
	useApiMutation: (opts: { mutationFn: () => unknown; onSuccess?: () => void }) => ({
		mutate: vi.fn().mockImplementation(async () => {
			const result = await opts.mutationFn();
			opts.onSuccess?.();
			return result;
		}),
		isPending: false,
	}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/empty-state", () => ({
	EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}));
vi.mock("@/components/ui/status-callout", () => ({
	StatusCallout: ({ message }: { message: string }) => <div>{message}</div>,
}));
vi.mock("@/components/forms/reject-package-dialog", () => ({
	RejectPackageDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="reject-dialog">Reject Dialog</div> : null,
}));

const makePendingRow = (overrides: Record<string, unknown> = {}) => ({
	id: "pkg-1",
	clientId: "client-1",
	serviceId: "svc-1",
	serviceName: "Yoga Package",
	branchId: "branch-1",
	totalPrice: 30000,
	creditsTotal: 10,
	createdAt: new Date().toISOString(),
	customerName: "Dana Customer",
	customerEmail: "dana@example.com",
	preferredTrainerId: null,
	preferredTrainerName: null,
	paymentMethod: "cash",
	paymentStatus: "paid",
	...overrides,
});

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/operations/approvals");
});

describe("ApprovalsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useSearchMock.mockReturnValue({ scope: "all" });
		useNavigateMock.mockReturnValue(vi.fn());
		mockClient.packageInstances.listPending.mockResolvedValue([]);
	});

	it("shows empty state when no pending packages", async () => {
		mockClient.packageInstances.listPending.mockResolvedValue([]);
		renderWithProviders(<ApprovalsPage />);
		await waitFor(() => {
			expect(screen.getByTestId("empty-state")).toBeInTheDocument();
			expect(screen.getByText("All caught up")).toBeInTheDocument();
		});
	});

	it("renders hero stats when pending packages exist", async () => {
		mockClient.packageInstances.listPending.mockResolvedValue([makePendingRow()]);
		renderWithProviders(<ApprovalsPage />);
		await waitFor(() => {
			expect(screen.getByText(/pending package approvals/i)).toBeInTheDocument();
		});
		// Hero shows total count in large monospace text
		expect(screen.getAllByText("1").length).toBeGreaterThan(0);
	});

	it("renders inbox row with customer name", async () => {
		mockClient.packageInstances.listPending.mockResolvedValue([makePendingRow()]);
		renderWithProviders(<ApprovalsPage />);
		await waitFor(() => {
			expect(screen.getByText("Dana Customer")).toBeInTheDocument();
			expect(screen.getByText("Yoga Package")).toBeInTheDocument();
		});
	});

	it("bulk-action bar appears after selecting a row", async () => {
		const user = userEvent.setup();
		mockClient.packageInstances.listPending.mockResolvedValue([makePendingRow()]);
		renderWithProviders(<ApprovalsPage />);
		await waitFor(() => expect(screen.getByText("Dana Customer")).toBeInTheDocument());

		// Click the checkbox (role=checkbox, aria-checked=false)
		const checkbox = screen.getByRole("checkbox", { name: undefined });
		await user.click(checkbox);

		await waitFor(() => {
			expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
		});
	});

	it("Approve all visible hero button selects all rows", async () => {
		const user = userEvent.setup();
		mockClient.packageInstances.listPending.mockResolvedValue([
			makePendingRow({ id: "pkg-1" }),
			makePendingRow({ id: "pkg-2", customerName: "Eve Customer" }),
		]);
		renderWithProviders(<ApprovalsPage />);
		await waitFor(() => expect(screen.getByText("Dana Customer")).toBeInTheDocument());

		await user.click(screen.getByRole("button", { name: /approve all visible/i }));

		await waitFor(() => {
			expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
		});
	});

	it("search filters the inbox list", async () => {
		const user = userEvent.setup();
		mockClient.packageInstances.listPending.mockResolvedValue([
			makePendingRow({ id: "pkg-1", customerName: "Dana Customer" }),
			makePendingRow({ id: "pkg-2", customerName: "Eve Customer" }),
		]);
		renderWithProviders(<ApprovalsPage />);
		await waitFor(() => expect(screen.getByText("Dana Customer")).toBeInTheDocument());

		await user.type(
			screen.getByPlaceholderText(/search customer/i),
			"Eve",
		);

		await waitFor(() => {
			expect(screen.queryByText("Dana Customer")).not.toBeInTheDocument();
			expect(screen.getByText("Eve Customer")).toBeInTheDocument();
		});
	});
});
