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

// NOTE: the dialog's zod schema validates staffId with .uuid(), so the fixture
// staff userIds must be UUIDs for the form to submit. (Real Better-Auth user
// ids are nanoids — see memory `members.userId is not a UUID` — the server
// procedure accepts z.string().min(1).)
// Version-4/variant-compliant UUIDs — zod's .uuid() rejects arbitrary hex.
const STAFF_UUID = "11111111-1111-4111-8111-111111111111";
const TARGET_UUID = "99999999-9999-4999-8999-999999999999";

const staffList = [
	{ id: "member-row-1", userId: STAFF_UUID, name: "Ahmad Firdaus" },
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
	fireEvent.change(selects[0], { target: { value: STAFF_UUID } });

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
		expect(arg.staffId).toBe(STAFF_UUID);
		// Integer cents — never a float RM value.
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
			await screen.findByText("Enter a valid non-zero amount"),
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
	// Characterization: the dialog promises "negative amount for a clawback"
	// and its zod schema accepts negatives, but the conversion helper it uses
	// (`rmToCents`) throws on any negative value. Until that is fixed, a
	// negative adjustment can never reach the server from this dialog. These
	// tests pin BOTH facts so a fix (or a regression) flips them loudly.
	// NOTE: driving the UI with a negative amount is deliberately NOT done here:
	// the throw escapes as an unhandled rejection (form.handleSubmit is not
	// awaited by the component), which would poison the whole vitest run. The
	// pure-function characterization below pins the same fact.
	it("rmToCents converts positive RM to integer cents but throws on negatives", () => {
		expect(rmToCents(123.45)).toBe(12345);
		expect(Number.isInteger(rmToCents(0.1))).toBe(true);
		// The documented clawback path is currently impossible: the dialog's
		// mutationFn pipes the signed RM amount through rmToCents, which rejects
		// every negative value — so a clawback can never reach the server.
		expect(() => rmToCents(-50)).toThrow("Invalid amount");
	});
});
