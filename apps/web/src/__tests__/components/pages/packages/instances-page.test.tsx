import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../../helpers/mock-client";

// vi.mock factories are hoisted above imports — shared spies live in vi.hoisted.
// - queryClient.invalidateQueries is consumed by useApiMutation (imported from
//   @/utils/orpc). It must be a spy so post-mutation invalidation can be asserted.
// - sonner toast is fired by useApiMutation and by the form's inline validation.
const { invalidateQueries, toastSuccess, toastError } = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries },
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1" },
		organizations: [],
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));

// The lifecycle dialogs run their own queries/mutations and are out of scope
// here. They only mount once a row action is invoked (actionRow set). Stub them
// to inert markers so the page tests stay focused on the list + its mutations.
vi.mock("@/features/packages/components/cancel-instance-dialog", () => ({
	CancelInstanceDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="cancel-dialog" /> : null,
}));
vi.mock("@/features/packages/components/extend-instance-dialog", () => ({
	ExtendInstanceDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="extend-dialog" /> : null,
}));
vi.mock("@/features/packages/components/freeze-instance-dialog", () => ({
	FreezeInstanceDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="freeze-dialog" /> : null,
}));

import { PackageInstancesPage } from "@/components/pages/packages/instances-page";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type ApiInstance = ReturnType<typeof makeInstance>;

function makeInstance(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: "inst-1",
		serviceId: "svc-1",
		clientId: "client-uuid-0001-aaaa",
		clientName: "Ahmad Firdaus",
		source: "assigned",
		creditsTotal: 10,
		creditsRemaining: 6,
		creditsUsed: 4,
		totalPrice: 30000, // RM 300.00
		startsAt: "2026-06-01T00:00:00.000Z",
		expiresAt: "2026-09-01T00:00:00.000Z",
		status: "active",
		paymentStatus: "paid",
		createdAt: "2026-06-01T00:00:00.000Z",
		...over,
	};
}

const ORG_ID = "org-1";

// jsdom does not implement the pointer-capture / scroll APIs that Radix
// Select + DropdownMenu probe; shim them so menus/selects open under test.
beforeAll(() => {
	Element.prototype.hasPointerCapture = vi.fn(() => false) as never;
	Element.prototype.setPointerCapture = vi.fn() as never;
	Element.prototype.releasePointerCapture = vi.fn() as never;
	Element.prototype.scrollIntoView = vi.fn() as never;
});

beforeEach(() => {
	vi.clearAllMocks();
	// Default resolutions so all of the page's queries settle.
	mockClient.packageInstances.listAll.mockResolvedValue([]);
	mockClient.services.list.mockResolvedValue([
		{
			id: "svc-1",
			name: "Body Massage 60min",
			sessionCount: 10,
			isActive: true,
		},
	]);
	mockClient.installmentPlans.list.mockResolvedValue([]);
	mockClient.members.list.mockResolvedValue([]);
	mockClient.packageInstanceStaff.list.mockResolvedValue([]);
	mockClient.packageInstances.statusHistory.mockResolvedValue({ rows: [] });
});

// ---------------------------------------------------------------------------
// 1. List render
// ---------------------------------------------------------------------------

describe("PackageInstancesPage — list render", () => {
	it("renders instance rows from mocked data", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([
			makeInstance({ id: "inst-1", clientName: "Ahmad Firdaus" }),
			makeInstance({
				id: "inst-2",
				clientName: "Siti Nurhaliza",
				creditsUsed: 2,
				creditsRemaining: 8,
				totalPrice: 12345,
				status: "frozen",
			}),
		]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument(),
		);
		expect(screen.getByText("Siti Nurhaliza")).toBeInTheDocument();
		// Service name is resolved via the services.list name map.
		expect(screen.getAllByText("Body Massage 60min").length).toBeGreaterThan(0);
		// Money columns render RM-formatted cents.
		expect(screen.getAllByText("RM 300.00").length).toBeGreaterThan(0);
		expect(screen.getByText("RM 123.45")).toBeInTheDocument();
		// Status badges. "Active"/"Frozen" also appear as stat-card labels / filter
		// tabs, so match presence (>=1) rather than uniqueness.
		expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Frozen").length).toBeGreaterThan(0);
	});

	it("shows the record count in the header reflecting the rows", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([
			makeInstance({ id: "a" }),
			makeInstance({ id: "b", clientName: "Other" }),
		]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("2 records")).toBeInTheDocument(),
		);
	});

	it("computes the stat cards (Active / Credits Used / Revenue) from the rows", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([
			makeInstance({
				id: "a",
				status: "active",
				creditsUsed: 4,
				totalPrice: 30000,
			}),
			makeInstance({
				id: "b",
				clientName: "B",
				status: "expired",
				creditsUsed: 6,
				totalPrice: 20000,
			}),
		]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument(),
		);
		// Active count = 1 (one active, one expired).
		expect(screen.getByText("1")).toBeInTheDocument();
		// Credits used total = 4 + 6 = 10.
		expect(screen.getByText("10")).toBeInTheDocument();
		// Revenue = 30000 + 20000 = 50000 cents = RM 500.00.
		expect(screen.getByText("RM 500.00")).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 2. Loading + empty states
// ---------------------------------------------------------------------------

describe("PackageInstancesPage — loading & empty states", () => {
	it("shows the loading skeleton placeholder while the list query is pending", async () => {
		// Never-resolving promise keeps the query in the loading state.
		mockClient.packageInstances.listAll.mockReturnValue(new Promise(() => {}));

		renderWithProviders(<PackageInstancesPage />);

		// Header count placeholder while loading.
		expect(screen.getByText("—")).toBeInTheDocument();
		// Empty-state copy must NOT be present during loading.
		expect(
			screen.queryByText("No session packs found"),
		).not.toBeInTheDocument();
	});

	it("shows the empty state when the list resolves to []", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("No session packs found")).toBeInTheDocument(),
		);
		expect(
			screen.getByText("Assign a pack to get started."),
		).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 3. Error state
// ---------------------------------------------------------------------------

describe("PackageInstancesPage — error state", () => {
	it("renders the error callout when the list query rejects", async () => {
		mockClient.packageInstances.listAll.mockRejectedValue(new Error("boom"));

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(
				screen.getByText("Failed to load session packs"),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByText(/Something went wrong while loading the list/i),
		).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 4. Interaction: status filter changes the query input
// ---------------------------------------------------------------------------

describe("PackageInstancesPage — status filter", () => {
	it("re-queries listAll with the selected status when a filter tab is clicked", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(mockClient.packageInstances.listAll).toHaveBeenCalled(),
		);

		fireEvent.click(screen.getByTestId("status-filter-active"));

		// The orpc query is keyed by its input, so the filter change spawns a fresh
		// query whose queryFn calls listAll with { organizationId, status }. The
		// orpc adapter appends a context arg, so assert on the first arg of a call
		// rather than the full arg tuple.
		await waitFor(() => {
			const inputs = mockClient.packageInstances.listAll.mock.calls.map(
				(c) => c[0],
			);
			expect(inputs).toContainEqual(
				expect.objectContaining({ status: "active", organizationId: ORG_ID }),
			);
		});
	});
});

// ---------------------------------------------------------------------------
// 5. Interaction: row action -> cancel mutation path mounts the dialog
// ---------------------------------------------------------------------------

describe("PackageInstancesPage — row actions", () => {
	it("opens the freeze dialog from the action menu for an active row", async () => {
		const user = userEvent.setup();
		mockClient.packageInstances.listAll.mockResolvedValue([
			makeInstance({ id: "inst-1", status: "active" }),
		]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument(),
		);

		// Radix DropdownMenu needs real pointer events to open — use userEvent.
		await user.click(screen.getByTestId("instance-action-menu"));
		await user.click(await screen.findByTestId("instance-action-freeze"));

		await waitFor(() =>
			expect(screen.getByTestId("freeze-dialog")).toBeInTheDocument(),
		);
	});

	it("opens the cancel dialog from the action menu for an active row", async () => {
		const user = userEvent.setup();
		mockClient.packageInstances.listAll.mockResolvedValue([
			makeInstance({ id: "inst-1", status: "active" }),
		]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument(),
		);

		await user.click(screen.getByTestId("instance-action-menu"));
		await user.click(await screen.findByTestId("instance-action-cancel"));

		await waitFor(() =>
			expect(screen.getByTestId("cancel-dialog")).toBeInTheDocument(),
		);
	});

	it("does not render an action menu for a non-actionable (expired) row", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([
			makeInstance({ id: "inst-1", status: "expired" }),
		]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument(),
		);
		// Expired rows expose no Freeze/Extend/Cancel action trigger.
		expect(
			screen.queryByTestId("instance-action-menu"),
		).not.toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// 6. Mutation: create-instance form validation guards the API call
// ---------------------------------------------------------------------------

describe("PackageInstancesPage — assign package form", () => {
	it("toasts an error and does NOT call create when no package is selected", async () => {
		mockClient.packageInstances.listAll.mockResolvedValue([]);

		renderWithProviders(<PackageInstancesPage />);

		await waitFor(() =>
			expect(screen.getByText("No session packs found")).toBeInTheDocument(),
		);

		// Open the Assign Pack dialog.
		fireEvent.click(screen.getByRole("button", { name: /Assign Pack/i }));

		// Submit the form immediately (no package, no client) via the submit button.
		const submit = await screen.findByRole("button", {
			name: /Assign Package/i,
		});
		fireEvent.click(submit);

		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith("Please select a package."),
		);
		expect(mockClient.packageInstances.create).not.toHaveBeenCalled();
	});
});
