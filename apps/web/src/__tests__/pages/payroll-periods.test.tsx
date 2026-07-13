import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

// ---------------------------------------------------------------------------
// Hoisted spies + mutable permission map (vi.mock factories are hoisted).
// ---------------------------------------------------------------------------
const { invalidateQueries, toastSuccess, toastError, permissionState } =
	vi.hoisted(() => ({
		invalidateQueries: vi.fn(),
		toastSuccess: vi.fn(),
		toastError: vi.fn(),
		// Mutable per-test permission map consumed by the useUserContext mock.
		permissionState: { map: {} as Record<string, boolean> },
	}));

function hasPermissionMock(perm: string): boolean {
	return permissionState.map[perm] ?? true;
}

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
		data: {
			currentOrganizationId: "org-1",
			organizations: [
				{
					id: "org-1",
					name: "Test Org",
					hierarchy: {
						nodes: [
							{ id: "branch-1", name: "Main Branch", type: "branch" },
							{ id: "branch-2", name: "Second Branch", type: "branch" },
						],
						member: { accessibleNodeIds: ["branch-1", "branch-2"] },
					},
				},
			],
		},
		hasPermission: hasPermissionMock,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));

vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		activeScopeId: null,
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["branch-1", "branch-2"],
		scopeNodes: [
			{ id: "branch-1", name: "Main Branch", type: "branch" },
			{ id: "branch-2", name: "Second Branch", type: "branch" },
		],
		topAccessibleNodeId: null,
		isAllScope: true,
		scopeNodeId: undefined,
		isScopeReady: true,
	}),
}));
vi.mock("@/components/scope/ScopeSwitcher", () => ({
	ScopeSwitcher: () => null,
}));

import { PayrollPeriodsPage } from "@/components/pages/payroll-periods/PayrollPeriodsPage";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type PeriodRow = {
	id: string;
	branchNodeId: string;
	periodStart: string;
	periodEnd: string;
	state: "locked" | "open";
	lockedAt: string | null;
	lockedBy: string | null;
	lockKind: string | null;
};

function makePeriod(over: Partial<PeriodRow> = {}): PeriodRow {
	return {
		id: "period-1",
		branchNodeId: "branch-1",
		periodStart: "2026-06-01T00:00:00.000Z",
		periodEnd: "2026-07-01T00:00:00.000Z",
		state: "locked",
		lockedAt: "2026-07-02T03:00:00.000Z",
		lockedBy: "user-admin",
		lockKind: "manual",
		...over,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	permissionState.map = {}; // default: all permissions granted
	mockClient.payrollPeriods.list.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// 1. List render
// ---------------------------------------------------------------------------

describe("PayrollPeriodsPage — list render", () => {
	it("renders period rows with branch name and state badges", async () => {
		mockClient.payrollPeriods.list.mockResolvedValue([
			makePeriod({ id: "p1", state: "locked" }),
			makePeriod({
				id: "p2",
				branchNodeId: "branch-2",
				state: "open",
				periodStart: "2026-07-01T00:00:00.000Z",
				periodEnd: "2026-08-01T00:00:00.000Z",
				lockedAt: null,
				lockedBy: null,
				lockKind: null,
			}),
		]);

		renderWithProviders(<PayrollPeriodsPage />);

		await waitFor(() =>
			// Branch column resolves node names from the org hierarchy. "Main Branch"
			// also appears in the lock-form <select>, so scope to the table cell.
			expect(
				screen.getByRole("cell", { name: "Main Branch" }),
			).toBeInTheDocument(),
		);
		expect(
			screen.getByRole("cell", { name: "Second Branch" }),
		).toBeInTheDocument();
		expect(screen.getByText("Locked")).toBeInTheDocument();
		expect(screen.getByText("Open")).toBeInTheDocument();
		// Period columns render as UTC days.
		expect(screen.getAllByText(/2026-06-01/).length).toBeGreaterThan(0);
	});

	it("shows the empty state when there are no periods", async () => {
		renderWithProviders(<PayrollPeriodsPage />);
		await waitFor(() =>
			expect(screen.getByText("No payroll periods yet")).toBeInTheDocument(),
		);
	});
});

// ---------------------------------------------------------------------------
// 2. lockNow called on confirm
// ---------------------------------------------------------------------------

describe("PayrollPeriodsPage — lock", () => {
	it("calls payrollPeriods.lockNow with the selected branch on confirm", async () => {
		mockClient.payrollPeriods.lockNow.mockResolvedValue(makePeriod());

		renderWithProviders(<PayrollPeriodsPage />);

		const button = await screen.findByRole("button", {
			name: /Lock current period/i,
		});
		fireEvent.click(button);

		await waitFor(() =>
			expect(mockClient.payrollPeriods.lockNow).toHaveBeenCalledTimes(1),
		);
		// Default branch = first branch option; no reference date selected.
		expect(mockClient.payrollPeriods.lockNow).toHaveBeenCalledWith({
			organizationId: "org-1",
			branchNodeId: "branch-1",
			referenceDate: undefined,
		});
	});

	it("disables the lock button while the mutation is pending", async () => {
		// Never-resolving promise to freeze the mutation in its pending state.
		mockClient.payrollPeriods.lockNow.mockImplementation(
			() => new Promise(() => {}),
		);

		renderWithProviders(<PayrollPeriodsPage />);

		const button = await screen.findByRole("button", {
			name: /Lock current period/i,
		});
		fireEvent.click(button);

		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Locking…/i })).toBeDisabled(),
		);
	});
});

// ---------------------------------------------------------------------------
// 3. Unlock dialog — reason required, passed to the mutation
// ---------------------------------------------------------------------------

describe("PayrollPeriodsPage — unlock dialog", () => {
	beforeEach(() => {
		mockClient.payrollPeriods.list.mockResolvedValue([
			makePeriod({ id: "period-42", state: "locked" }),
		]);
	});

	it("opens a dialog instead of window.prompt when Unlock is clicked", async () => {
		const promptSpy = vi.spyOn(window, "prompt");

		renderWithProviders(<PayrollPeriodsPage />);

		const unlockBtn = await screen.findByRole("button", { name: /Unlock/i });
		fireEvent.click(unlockBtn);

		expect(
			await screen.findByText("Unlock Payroll Period"),
		).toBeInTheDocument();
		expect(promptSpy).not.toHaveBeenCalled();
		promptSpy.mockRestore();
	});

	it("keeps confirm disabled until a reason of at least 3 chars is entered", async () => {
		renderWithProviders(<PayrollPeriodsPage />);

		fireEvent.click(await screen.findByRole("button", { name: /Unlock/i }));
		await screen.findByText("Unlock Payroll Period");

		// The dialog's destructive confirm button (exact "Unlock" label).
		const confirm = screen
			.getAllByRole("button", { name: "Unlock" })
			.find((b) => b.className.includes("bg-red-600"))!;
		expect(confirm).toBeDisabled();

		const textarea = screen.getByLabelText(/Unlock Reason/i);
		fireEvent.change(textarea, { target: { value: "ab" } });
		expect(confirm).toBeDisabled();

		fireEvent.change(textarea, { target: { value: "correction needed" } });
		expect(confirm).not.toBeDisabled();

		// Nothing fired while disabled.
		expect(mockClient.payrollPeriods.unlock).not.toHaveBeenCalled();
	});

	it("passes the trimmed reason and periodId to payrollPeriods.unlock", async () => {
		mockClient.payrollPeriods.unlock.mockResolvedValue(
			makePeriod({ id: "period-42", state: "open" }),
		);

		renderWithProviders(<PayrollPeriodsPage />);

		fireEvent.click(await screen.findByRole("button", { name: /Unlock/i }));
		await screen.findByText("Unlock Payroll Period");

		fireEvent.change(screen.getByLabelText(/Unlock Reason/i), {
			target: { value: "  backdated correction  " },
		});
		const confirm = screen
			.getAllByRole("button", { name: "Unlock" })
			.find((b) => b.className.includes("bg-red-600"))!;
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(mockClient.payrollPeriods.unlock).toHaveBeenCalledTimes(1),
		);
		expect(mockClient.payrollPeriods.unlock).toHaveBeenCalledWith({
			organizationId: "org-1",
			periodId: "period-42",
			reason: "backdated correction",
		});
	});

	it("closes the dialog and invalidates the list on success", async () => {
		mockClient.payrollPeriods.unlock.mockResolvedValue(
			makePeriod({ id: "period-42", state: "open" }),
		);

		renderWithProviders(<PayrollPeriodsPage />);

		fireEvent.click(await screen.findByRole("button", { name: /Unlock/i }));
		await screen.findByText("Unlock Payroll Period");
		fireEvent.change(screen.getByLabelText(/Unlock Reason/i), {
			target: { value: "settled month reopened" },
		});
		fireEvent.click(
			screen
				.getAllByRole("button", { name: "Unlock" })
				.find((b) => b.className.includes("bg-red-600"))!,
		);

		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith("Payroll period unlocked"),
		);
		await waitFor(() =>
			expect(
				screen.queryByText("Unlock Payroll Period"),
			).not.toBeInTheDocument(),
		);
		const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
		expect(keys).toContainEqual(mockOrpc.payrollPeriods.list.key());
	});

	it("disables dialog buttons while the unlock mutation is pending", async () => {
		mockClient.payrollPeriods.unlock.mockImplementation(
			() => new Promise(() => {}),
		);

		renderWithProviders(<PayrollPeriodsPage />);

		fireEvent.click(await screen.findByRole("button", { name: /Unlock/i }));
		await screen.findByText("Unlock Payroll Period");
		fireEvent.change(screen.getByLabelText(/Unlock Reason/i), {
			target: { value: "pending state check" },
		});
		fireEvent.click(
			screen
				.getAllByRole("button", { name: "Unlock" })
				.find((b) => b.className.includes("bg-red-600"))!,
		);

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /Unlocking…/i }),
			).toBeDisabled(),
		);
		expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
	});
});

// ---------------------------------------------------------------------------
// 4. Permission gating
// ---------------------------------------------------------------------------

describe("PayrollPeriodsPage — permission gating", () => {
	it("blocks the page without commission_payout:read", async () => {
		permissionState.map = { "commission_payout:read": false };

		renderWithProviders(<PayrollPeriodsPage />);

		expect(
			await screen.findByText("You don't have access to this page"),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Lock current period/i }),
		).not.toBeInTheDocument();
	});

	it("hides lock form and unlock actions without commission_payout:update", async () => {
		permissionState.map = { "commission_payout:update": false };
		mockClient.payrollPeriods.list.mockResolvedValue([
			makePeriod({ id: "p1", state: "locked" }),
		]);

		renderWithProviders(<PayrollPeriodsPage />);

		await waitFor(() =>
			expect(
				screen.getByRole("cell", { name: "Main Branch" }),
			).toBeInTheDocument(),
		);
		expect(
			screen.queryByRole("button", { name: /Lock current period/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Unlock/i }),
		).not.toBeInTheDocument();
	});
});
