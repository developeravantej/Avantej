import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";

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

// Radix Popover + cmdk cannot be reliably driven in jsdom (pointer-capture
// APIs). Render trigger and content inline so the staff options are always
// clickable.
vi.mock("@/components/ui/popover", () => ({
	Popover: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	PopoverContent: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

vi.mock("@/components/ui/command", () => ({
	Command: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	CommandInput: () => null,
	CommandList: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	CommandEmpty: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	CommandGroup: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	CommandItem: ({
		children,
		onSelect,
		value,
	}: {
		children?: React.ReactNode;
		onSelect?: (v: string) => void;
		value?: string;
	}) => (
		<button
			type="button"
			data-testid={`staff-option-${value}`}
			onClick={() => onSelect?.(value ?? "")}
		>
			{children}
		</button>
	),
}));

// Payment-method Radix Select — not interacted with (defaults to
// bank_transfer); mock to a no-op native select for render stability.
vi.mock("@/components/ui/select", () => ({
	Select: ({ children }: { children?: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children?: React.ReactNode }) => (
		<div hidden>{children}</div>
	),
	SelectItem: () => null,
}));

import { RunBatchDrawer } from "@/features/payouts/components/run-batch-drawer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const staffOptions = [
	{ id: "user-a", name: "Ahmad Firdaus" },
	{ id: "user-b", name: "Siti Nurhaliza" },
];

const previewResult = {
	count: 3,
	totalAmountCents: 45000,
	truncated: false,
	byStaff: [
		{
			staffId: "user-a",
			staffName: "Ahmad Firdaus",
			count: 2,
			totalCents: 30000,
		},
		{
			staffId: "user-b",
			staffName: "Siti Nurhaliza",
			count: 1,
			totalCents: 15000,
		},
	],
	splits: [],
};

function renderDrawer() {
	renderWithProviders(
		<RunBatchDrawer
			open
			onOpenChange={vi.fn()}
			organizationId="org-1"
			staffOptions={staffOptions}
		/>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockClient.payouts.previewBatch.mockResolvedValue(previewResult);
	mockClient.payouts.runBatch.mockResolvedValue({
		payoutIds: ["p1", "p2"],
		totalAmountCents: 45000,
		splitCount: 3,
	});
});

// The preview query is debounced by 500ms — waitFor needs headroom.
const PREVIEW_TIMEOUT = { timeout: 4000 };

describe("RunBatchDrawer", () => {
	it("keeps Confirm disabled until staff are selected AND the preview loads", async () => {
		renderDrawer();

		const confirm = screen.getByTestId("batch-confirm-button");
		// No staff selected → disabled, no preview requested.
		expect(confirm).toBeDisabled();
		expect(mockClient.payouts.previewBatch).not.toHaveBeenCalled();

		// Select one staff member → preview kicks in (debounced) but until it
		// resolves the button must stay disabled.
		fireEvent.click(screen.getByTestId("staff-option-Ahmad Firdaus"));
		expect(confirm).toBeDisabled();

		await waitFor(
			() =>
				expect(screen.getByTestId("batch-preview-count")).toBeInTheDocument(),
			PREVIEW_TIMEOUT,
		);
		await waitFor(() => expect(confirm).not.toBeDisabled());
	});

	it("shows the preview panel (count + per-staff rows) before any run", async () => {
		renderDrawer();

		fireEvent.click(screen.getByTestId("staff-option-Ahmad Firdaus"));
		fireEvent.click(screen.getByTestId("staff-option-Siti Nurhaliza"));

		await waitFor(
			() =>
				expect(screen.getByTestId("batch-preview-count")).toBeInTheDocument(),
			PREVIEW_TIMEOUT,
		);
		// Total in RM from cents.
		expect(screen.getByText("RM 450.00")).toBeInTheDocument();
		// Per-staff sub-rows render.
		expect(screen.getByText("RM 300.00")).toBeInTheDocument();
		expect(screen.getByText("RM 150.00")).toBeInTheDocument();
		// Nothing has been run yet.
		expect(mockClient.payouts.runBatch).not.toHaveBeenCalled();
	});

	it("keeps Confirm disabled when the preview has zero matching splits", async () => {
		mockClient.payouts.previewBatch.mockResolvedValue({
			count: 0,
			totalAmountCents: 0,
			truncated: false,
			byStaff: [],
			splits: [],
		});

		renderDrawer();
		fireEvent.click(screen.getByTestId("staff-option-Ahmad Firdaus"));

		await waitFor(
			() =>
				expect(
					screen.getByText(/No approved splits found/i),
				).toBeInTheDocument(),
			PREVIEW_TIMEOUT,
		);
		expect(screen.getByTestId("batch-confirm-button")).toBeDisabled();
		fireEvent.click(screen.getByTestId("batch-confirm-button"));
		expect(mockClient.payouts.runBatch).not.toHaveBeenCalled();
	});

	it("passes exactly the selected recipients to runBatch", async () => {
		renderDrawer();

		fireEvent.click(screen.getByTestId("staff-option-Ahmad Firdaus"));
		fireEvent.click(screen.getByTestId("staff-option-Siti Nurhaliza"));

		const confirm = screen.getByTestId("batch-confirm-button");
		await waitFor(() => expect(confirm).not.toBeDisabled(), PREVIEW_TIMEOUT);
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(mockClient.payouts.runBatch).toHaveBeenCalledTimes(1),
		);
		const arg = mockClient.payouts.runBatch.mock.calls[0][0];
		expect(arg.organizationId).toBe("org-1");
		expect([...arg.staffIds].sort()).toEqual(["user-a", "user-b"]);
		expect(arg.paymentMethod).toBe("bank_transfer");
		// api.ts converts the ISO strings to Date objects before sending.
		expect(arg.periodStart).toBeInstanceOf(Date);
		expect(arg.periodEnd).toBeInstanceOf(Date);
		expect(arg.periodStart.getTime()).toBeLessThan(arg.periodEnd.getTime());
		// Empty reference is normalized to undefined, and the drawer confirms
		// immediately (legacy behavior).
		expect(arg.reference).toBeUndefined();
		expect(arg.confirmImmediately).toBe(true);
	});

	it("deselecting a staff member removes them from the runBatch payload", async () => {
		renderDrawer();

		fireEvent.click(screen.getByTestId("staff-option-Ahmad Firdaus"));
		fireEvent.click(screen.getByTestId("staff-option-Siti Nurhaliza"));
		// Toggle Siti back off.
		fireEvent.click(screen.getByTestId("staff-option-Siti Nurhaliza"));

		const confirm = screen.getByTestId("batch-confirm-button");
		await waitFor(() => expect(confirm).not.toBeDisabled(), PREVIEW_TIMEOUT);
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(mockClient.payouts.runBatch).toHaveBeenCalledTimes(1),
		);
		expect(mockClient.payouts.runBatch.mock.calls[0][0].staffIds).toEqual([
			"user-a",
		]);
	});

	it("forwards the trimmed reference when one is entered", async () => {
		renderDrawer();

		fireEvent.click(screen.getByTestId("staff-option-Ahmad Firdaus"));
		fireEvent.change(screen.getByPlaceholderText(/e\.g\. May 2026 payroll/i), {
			target: { value: "  June payroll #88  " },
		});

		const confirm = screen.getByTestId("batch-confirm-button");
		await waitFor(() => expect(confirm).not.toBeDisabled(), PREVIEW_TIMEOUT);
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(mockClient.payouts.runBatch).toHaveBeenCalledWith(
				expect.objectContaining({ reference: "June payroll #88" }),
			),
		);
	});
});
