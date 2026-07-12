import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";
import { rmToCents } from "@/lib/money";

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

// Radix Select cannot be driven in jsdom (pointer-capture APIs missing), so the
// select module is mocked down to a native <select>: SelectItem → <option>,
// chrome components → passthrough. The dialog under test only relies on
// value/onValueChange semantics.
vi.mock("@/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		children,
	}: {
		value?: string;
		onValueChange?: (v: string) => void;
		children?: React.ReactNode;
	}) => (
		<select
			data-testid="mock-select"
			value={value ?? ""}
			onChange={(e) => onValueChange?.(e.target.value)}
		>
			{/* An empty placeholder option so an unset value is representable */}
			<option value="" disabled hidden />
			{children}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children?: React.ReactNode }) => (
		<>{children}</>
	),
	SelectItem: ({
		value,
		children,
	}: {
		value: string;
		children?: React.ReactNode;
	}) => <option value={value}>{children}</option>,
}));

import { ManualAdjustmentDialog } from "@/components/pages/commissions/manual-adjustment-dialog";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// staffId is members.userId — a Better-Auth NANOID, never a UUID (see memory
// `members.userId is not a UUID`). The dialog's schema mirrors the server
// (z.string().min(1)), so a nanoid staff id must pass client validation and
// reach the mutation. This fixture uses a nanoid on purpose to guard that.
const STAFF_ID = "aB3xY7kQ9mN2pL5rT8wZ1cV4"; // nanoid — would fail z.string().uuid()
const TARGET_UUID = "99999999-9999-4999-8999-999999999999";

const staffList = [
	{ id: "member-row-1", userId: STAFF_ID, name: "Ahmad Firdaus" },
];

function renderDialog(onOpenChange = vi.fn()) {
	renderWithProviders(
		<ManualAdjustmentDialog
			open
			onOpenChange={onOpenChange}
			organizationId="org-1"
		/>,
	);
	return onOpenChange;
}

async function fillForm({
	amount,
	note,
	targetId = TARGET_UUID,
}: {
	amount: string;
	note?: string;
	targetId?: string;
}) {
	// Wait for the async members.list query to populate the staff options.
	await screen.findByRole("option", { name: "Ahmad Firdaus" });
	// First mock select = staffId, second = targetType (defaults to salesOrderId).
	const selects = screen.getAllByTestId("mock-select");
	fireEvent.change(selects[0], { target: { value: STAFF_ID } });

	fireEvent.change(screen.getByLabelText(/Amount \(RM\)/i), {
		target: { value: amount },
	});
	fireEvent.change(screen.getByLabelText(/Target ID/i), {
		target: { value: targetId },
	});
	if (note !== undefined) {
		fireEvent.change(screen.getByLabelText(/Note/i), {
			target: { value: note },
		});
	}
}

beforeEach(() => {
	vi.clearAllMocks();
	mockClient.members.list.mockResolvedValue(staffList);
	mockClient.commissionSplits.createManualAdjustment.mockResolvedValue({
		id: "split-1",
		status: "pending",
	});
});

// ---------------------------------------------------------------------------
// Payload correctness — amounts must be INTEGER CENTS
// ---------------------------------------------------------------------------

describe("ManualAdjustmentDialog — payload correctness", () => {
	it("converts the RM amount to integer cents and targets exactly one entity", async () => {
		renderDialog();

		await fillForm({ amount: "123.45", note: "Bonus for June" });
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		await waitFor(() =>
			expect(
				mockClient.commissionSplits.createManualAdjustment,
			).toHaveBeenCalledTimes(1),
		);
		const arg =
			mockClient.commissionSplits.createManualAdjustment.mock.calls[0][0];

		expect(arg.organizationId).toBe("org-1");
		// A nanoid staffId passes client validation and reaches the server.
		expect(arg.staffId).toBe(STAFF_ID);
		// Integer cents — never a float RM value. Bonus (default) → positive.
		expect(arg.amountCents).toBe(12345);
		expect(Number.isInteger(arg.amountCents)).toBe(true);
		expect(arg.note).toBe("Bonus for June");
		// XOR: default target type salesOrderId carries the target UUID; the
		// other two target keys are absent.
		expect(arg.salesOrderId).toBe(TARGET_UUID);
		expect(arg.appointmentId).toBeUndefined();
		expect(arg.packageInstanceId).toBeUndefined();
	});

	it("rounds fractional-cent RM input to an integer (no float cents leak)", async () => {
		renderDialog();

		// 10.005 RM → 1000.5 raw cents → must round to an integer, never 1000.5.
		await fillForm({ amount: "10.005", note: "Rounding check" });
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		await waitFor(() =>
			expect(
				mockClient.commissionSplits.createManualAdjustment,
			).toHaveBeenCalledTimes(1),
		);
		const arg =
			mockClient.commissionSplits.createManualAdjustment.mock.calls[0][0];
		expect(Number.isInteger(arg.amountCents)).toBe(true);
		expect(arg.amountCents).toBe(1001); // Math.round(1000.5)
	});

	it("requires a note (reason): submit without one fires no mutation", async () => {
		renderDialog();

		await fillForm({ amount: "50.00" }); // note omitted
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		expect(await screen.findByText("Note is required")).toBeInTheDocument();
		expect(
			mockClient.commissionSplits.createManualAdjustment,
		).not.toHaveBeenCalled();
	});

	it("rejects a zero amount at the form layer", async () => {
		renderDialog();

		await fillForm({ amount: "0", note: "zero" });
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		expect(
			await screen.findByText("Enter a valid amount greater than zero"),
		).toBeInTheDocument();
		expect(
			mockClient.commissionSplits.createManualAdjustment,
		).not.toHaveBeenCalled();
	});

	it("closes the dialog and invalidates review/liability/ledger queries on success", async () => {
		const onOpenChange = renderDialog();

		await fillForm({ amount: "25.00", note: "June top-up" });
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith(
				"Manual adjustment created — pending review.",
			),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
		const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
		expect(keys).toContainEqual(
			mockOrpc.commissionSplits.listPendingReview.key(),
		);
		expect(keys).toContainEqual(
			mockOrpc.commissionSplits.liabilitySummary.key(),
		);
		expect(keys).toContainEqual(mockOrpc.commissionSplits.listLedger.key());
	});
});

// ---------------------------------------------------------------------------
// Sign handling — clawbacks
// ---------------------------------------------------------------------------

describe("ManualAdjustmentDialog — sign handling (clawback)", () => {
	// The dialog entered a POSITIVE magnitude and applies the sign from the
	// Bonus/Clawback toggle: rmToCents (which rejects negatives) is fed the
	// magnitude, and the result is negated for a clawback. So the server
	// receives a negative integer-cents payload — the previously-impossible path.

	it("submits a clawback as NEGATIVE integer cents", async () => {
		renderDialog();

		await fillForm({ amount: "50.00", note: "Overpayment clawback" });
		// Flip to Clawback before submitting.
		fireEvent.click(screen.getByRole("radio", { name: /Clawback/i }));
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		await waitFor(() =>
			expect(
				mockClient.commissionSplits.createManualAdjustment,
			).toHaveBeenCalledTimes(1),
		);
		const arg =
			mockClient.commissionSplits.createManualAdjustment.mock.calls[0][0];

		// 50.00 RM entered as a positive magnitude → −5000 signed cents.
		expect(arg.amountCents).toBe(-5000);
		expect(arg.amountCents).toBeLessThan(0);
		expect(Number.isInteger(arg.amountCents)).toBe(true);
		expect(arg.staffId).toBe(STAFF_ID);
	});

	it("submits a bonus as POSITIVE integer cents (default direction)", async () => {
		renderDialog();

		await fillForm({ amount: "50.00", note: "June bonus" });
		fireEvent.click(screen.getByRole("button", { name: /Create Adjustment/i }));

		await waitFor(() =>
			expect(
				mockClient.commissionSplits.createManualAdjustment,
			).toHaveBeenCalledTimes(1),
		);
		const arg =
			mockClient.commissionSplits.createManualAdjustment.mock.calls[0][0];
		expect(arg.amountCents).toBe(5000);
		expect(arg.amountCents).toBeGreaterThan(0);
	});

	it("shows a signed preview reflecting the chosen direction", async () => {
		renderDialog();

		await fillForm({ amount: "50.00", note: "preview" });
		expect(await screen.findByTestId("amount-preview")).toHaveTextContent(
			"+RM 50.00",
		);

		fireEvent.click(screen.getByRole("radio", { name: /Clawback/i }));
		await waitFor(() =>
			expect(screen.getByTestId("amount-preview")).toHaveTextContent(
				"−RM 50.00",
			),
		);
	});

	// Sanity guard on the shared helper: rmToCents still rejects negatives (its
	// non-negative contract is correct for prices), which is exactly why the
	// dialog feeds it the positive magnitude and negates afterwards.
	it("rmToCents keeps its non-negative contract (dialog negates, not rmToCents)", () => {
		expect(rmToCents(50)).toBe(5000);
		expect(() => rmToCents(-50)).toThrow("Invalid amount");
	});
});
