import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";

// vi.mock factories are hoisted above imports, so shared spies must be created
// via vi.hoisted to be referencable inside them.
// - queryClient.invalidateQueries is consumed by useApiMutation (imported from
//   @/utils/orpc) and by api.ts directly — must be a spy we can assert against.
// - sonner toast is fired by useApiMutation on success/error.
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
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	}),
}));

import { PayoutsTab } from "@/components/pages/commissions/payouts-tab";
import { MarkPaidDialog } from "@/features/payouts/components/payout-action-dialogs";
import type { PayoutListItem } from "@/features/payouts/api";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePayout(over: Partial<PayoutListItem> = {}): PayoutListItem {
	return {
		id: "payout-1",
		recipientId: "staff-1",
		recipientName: "Ahmad Firdaus",
		amount: 25000, // RM 250.00 net
		grossAmountCents: 30000,
		deductionsCents: 5000,
		status: "pending",
		paidAt: null,
		appointmentId: null,
		createdAt: new Date("2026-06-01T00:00:00.000Z"),
		batchId: "batch-1",
		description: "WIRE-2026-06-01",
		paymentMethod: "bank_transfer",
		reference: "WIRE-2026-06-01",
		periodStart: new Date("2026-05-01T00:00:00.000Z"),
		periodEnd: new Date("2026-05-31T00:00:00.000Z"),
		...over,
	};
}

const ORG_ID = "org-1";

const tabProps = {
	organizationId: ORG_ID,
	recipientId: undefined,
	onSelectRecipient: () => {},
};

beforeEach(() => {
	vi.clearAllMocks();
	// Default: payouts.list + members.list resolve so PayoutsTab queries settle.
	mockClient.payouts.list.mockResolvedValue([]);
	mockClient.members.list.mockResolvedValue([]);
	mockClient.commissionSplits.liabilitySummary.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// 1. Batch list render
// ---------------------------------------------------------------------------

describe("PayoutsTab — batch list render", () => {
	it("renders payout batch rows from mocked data", async () => {
		mockClient.payouts.list.mockResolvedValue([
			makePayout({ id: "p1", recipientName: "Ahmad Firdaus", amount: 25000 }),
			makePayout({
				id: "p2",
				recipientId: "staff-2",
				recipientName: "Siti Nurhaliza",
				amount: 12345,
				status: "paid",
				paidAt: new Date(),
			}),
		]);

		renderWithProviders(<PayoutsTab {...tabProps} />);

		await waitFor(() =>
			expect(screen.getByText("Ahmad Firdaus")).toBeInTheDocument(),
		);
		// Recipient names are unique per row — the rows actually rendered.
		expect(screen.getByText("Siti Nurhaliza")).toBeInTheDocument();
		// Net amount column renders RM-formatted cents (also echoed in KPI band,
		// so assert presence rather than a single occurrence).
		expect(screen.getAllByText("RM 250.00").length).toBeGreaterThan(0);
		expect(screen.getAllByText("RM 123.45").length).toBeGreaterThan(0);
		// Footer count reflects the rows.
		expect(screen.getByText("2 payouts shown")).toBeInTheDocument();
	});

	it("shows the empty state when there are no payouts", async () => {
		mockClient.payouts.list.mockResolvedValue([]);

		renderWithProviders(<PayoutsTab {...tabProps} />);

		await waitFor(() =>
			expect(screen.getByText("No payouts yet")).toBeInTheDocument(),
		);
		expect(
			screen.getByText(/Use "Run Batch" to create payouts/i),
		).toBeInTheDocument();
		expect(screen.getByText("0 payouts shown")).toBeInTheDocument();
	});

	it("renders a reversal (negative net) row with the Reversal badge", async () => {
		mockClient.payouts.list.mockResolvedValue([
			makePayout({
				id: "rev-1",
				recipientName: "Reversal Recipient",
				amount: -5000,
				grossAmountCents: 5000,
				status: "paid",
				paidAt: new Date(),
			}),
		]);

		renderWithProviders(<PayoutsTab {...tabProps} />);

		await waitFor(() =>
			expect(screen.getByText("Reversal Recipient")).toBeInTheDocument(),
		);
		expect(screen.getByText("Reversal")).toBeInTheDocument();
		// Negative net rendered as a "-" sign sibling + the abs value. The minus
		// and the amount are separate text nodes, so match the abs amount and the
		// reversal styling rather than a combined string.
		expect(screen.getAllByText("RM 50.00").length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// 2. Status transition — mark-paid mutation called with correct args
// 3. Invalidation on mutation
// ---------------------------------------------------------------------------

describe("MarkPaidDialog — status transition + invalidation", () => {
	const payout = makePayout({ id: "payout-42", status: "pending" });

	it("calls client.payouts.markPaid with the expected args", async () => {
		mockClient.payouts.markPaid.mockResolvedValue({ ok: true });

		renderWithProviders(
			<MarkPaidDialog
				organizationId={ORG_ID}
				payout={payout}
				onClose={() => {}}
			/>,
		);

		const input = await screen.findByLabelText(/Payment reference/i);
		fireEvent.change(input, { target: { value: "WIRE-12345" } });

		fireEvent.click(screen.getByRole("button", { name: /Mark paid/i }));

		await waitFor(() =>
			expect(mockClient.payouts.markPaid).toHaveBeenCalledTimes(1),
		);
		expect(mockClient.payouts.markPaid).toHaveBeenCalledWith({
			organizationId: ORG_ID,
			id: "payout-42",
			paymentReference: "WIRE-12345",
		});
	});

	it("trims the payment reference before sending", async () => {
		mockClient.payouts.markPaid.mockResolvedValue({ ok: true });

		renderWithProviders(
			<MarkPaidDialog
				organizationId={ORG_ID}
				payout={payout}
				onClose={() => {}}
			/>,
		);

		const input = await screen.findByLabelText(/Payment reference/i);
		fireEvent.change(input, { target: { value: "  WIRE-99  " } });
		fireEvent.click(screen.getByRole("button", { name: /Mark paid/i }));

		await waitFor(() =>
			expect(mockClient.payouts.markPaid).toHaveBeenCalledWith(
				expect.objectContaining({ paymentReference: "WIRE-99" }),
			),
		);
	});

	it("does not fire the mutation when the reference is empty", async () => {
		renderWithProviders(
			<MarkPaidDialog
				organizationId={ORG_ID}
				payout={payout}
				onClose={() => {}}
			/>,
		);

		const button = await screen.findByRole("button", { name: /Mark paid/i });
		// Submit is disabled until a reference is entered.
		expect(button).toBeDisabled();
		fireEvent.click(button);
		expect(mockClient.payouts.markPaid).not.toHaveBeenCalled();
	});

	it("invalidates the payouts + commission queries after a successful mark-paid", async () => {
		mockClient.payouts.markPaid.mockResolvedValue({ ok: true });
		const onClose = vi.fn();

		renderWithProviders(
			<MarkPaidDialog
				organizationId={ORG_ID}
				payout={payout}
				onClose={onClose}
			/>,
		);

		const input = await screen.findByLabelText(/Payment reference/i);
		fireEvent.change(input, { target: { value: "WIRE-12345" } });
		fireEvent.click(screen.getByRole("button", { name: /Mark paid/i }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());

		// useApiMutation calls queryClient.invalidateQueries once per key in the
		// `invalidate` array. Phase-2 standardized api.ts onto the canonical oRPC
		// partial-key form (`orpc.<router>.<proc>.key()`), so we derive the expected
		// keys from the same `orpc` util the production code uses rather than
		// hand-writing string tuples.
		const keys = invalidateQueries.mock.calls.map((c) => c[0].queryKey);
		expect(keys).toContainEqual(mockOrpc.payouts.list.key());
		expect(keys).toContainEqual(
			mockOrpc.commissionSplits.liabilitySummary.key(),
		);
		expect(keys).toContainEqual(mockOrpc.commissionSplits.listLedger.key());
		expect(keys).toContainEqual(
			mockOrpc.commissionSplits.listPendingReview.key(),
		);
		expect(invalidateQueries).toHaveBeenCalledTimes(4);
	});

	it("fires a success toast on a completed mark-paid", async () => {
		mockClient.payouts.markPaid.mockResolvedValue({ ok: true });

		renderWithProviders(
			<MarkPaidDialog
				organizationId={ORG_ID}
				payout={payout}
				onClose={() => {}}
			/>,
		);

		const input = await screen.findByLabelText(/Payment reference/i);
		fireEvent.change(input, { target: { value: "WIRE-12345" } });
		fireEvent.click(screen.getByRole("button", { name: /Mark paid/i }));

		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith("Payout marked as paid"),
		);
	});
});
