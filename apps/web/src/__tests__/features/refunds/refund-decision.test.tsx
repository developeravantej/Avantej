import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: {
		invalidateQueries: () => Promise.resolve(),
		setQueryData: () => {},
		getQueryData: () => undefined,
		clear: () => {},
	},
}));
vi.mock("sonner", () => ({
	toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
// QueueRow's sale-ref cell renders a router <Link>; there is no RouterProvider
// in unit tests, so stub it as a plain anchor.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="#">{children}</a>
	),
	useNavigate: () => vi.fn(),
}));

// Controllable permission set for RBAC gating assertions.
let grantedPermissions: Set<string>;
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			organizations: [],
		},
		hasPermission: (perm: string) => grantedPermissions.has(perm),
		hasAnyPermission: (perms: string[]) =>
			perms.some((p) => grantedPermissions.has(p)),
		hasRole: () => true,
	}),
}));

import { InlineDecisionPanel } from "@/features/refunds/components/InlineDecisionPanel";
import { BulkApproveBar } from "@/features/refunds/components/BulkApproveBar";
import { RefundsTab } from "@/components/refunds/refunds-tab";
import type { RefundRow } from "@/features/refunds/refunds.types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORG_ID = "org-1";

function makeRefund(overrides: Partial<RefundRow> = {}): RefundRow {
	return {
		id: "refund-1",
		refundNumber: "RF-000001",
		status: "pending",
		salesOrderId: "so-1",
		paymentId: null,
		packageInstanceId: null,
		amountCents: 30000, // RM 300.00 — integer cents convention
		taxAmountCents: 0,
		reason: "Relocation",
		notes: "Moving to KL",
		requestedBy: "user-abc-123",
		requestedAt: new Date("2026-07-01T10:00:00Z"),
		reviewedBy: null,
		reviewedAt: null,
		reviewNotes: null,
		processedBy: null,
		processedAt: null,
		refundMethod: null,
		refundReference: null,
		customerId: "cust-1",
		customerName: "Ahmad Firdaus",
		salesOrderNumber: "SO-000123",
		customerType: "member",
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	grantedPermissions = new Set([
		"refund_management:read",
		"refund_management:approve",
		"refund_management:process",
	]);
});

// ── InlineDecisionPanel ───────────────────────────────────────────────────────

describe("InlineDecisionPanel", () => {
	it("approves at the full requested amount (cents) with no notes", async () => {
		const onApproved = vi.fn();
		mockClient.refunds.approve.mockResolvedValue({ ok: true });
		const user = userEvent.setup();
		renderWithProviders(
			<InlineDecisionPanel
				refund={makeRefund()}
				organizationId={ORG_ID}
				onApproved={onApproved}
				onReject={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /^approve$/i }));

		await waitFor(() => {
			expect(mockClient.refunds.approve).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				id: "refund-1",
				approveAmountCents: 30000,
				reviewNotes: undefined,
			});
		});
		await waitFor(() => expect(onApproved).toHaveBeenCalled());
	});

	it("approves a partial amount converted to integer cents, with trimmed notes", async () => {
		mockClient.refunds.approve.mockResolvedValue({ ok: true });
		const user = userEvent.setup();
		renderWithProviders(
			<InlineDecisionPanel
				refund={makeRefund()}
				organizationId={ORG_ID}
				onApproved={vi.fn()}
				onReject={vi.fn()}
			/>,
		);

		const amountInput = screen.getByRole("spinbutton");
		await user.clear(amountInput);
		await user.type(amountInput, "150.50");
		await user.type(
			screen.getByPlaceholderText(/verified relocation/i),
			"  partial ok  ",
		);
		await user.click(screen.getByRole("button", { name: /^approve$/i }));

		await waitFor(() => {
			expect(mockClient.refunds.approve).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				id: "refund-1",
				approveAmountCents: 15050,
				reviewNotes: "partial ok",
			});
		});
	});

	it("blocks approval above the requested amount and shows a validation error", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<InlineDecisionPanel
				refund={makeRefund()}
				organizationId={ORG_ID}
				onApproved={vi.fn()}
				onReject={vi.fn()}
			/>,
		);

		const amountInput = screen.getByRole("spinbutton");
		await user.clear(amountInput);
		await user.type(amountInput, "999.99");
		await user.click(screen.getByRole("button", { name: /^approve$/i }));

		expect(
			await screen.findByText(/cannot exceed requested amount/i),
		).toBeInTheDocument();
		expect(mockClient.refunds.approve).not.toHaveBeenCalled();
	});

	it("blocks approval of a zero/invalid amount", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<InlineDecisionPanel
				refund={makeRefund()}
				organizationId={ORG_ID}
				onApproved={vi.fn()}
				onReject={vi.fn()}
			/>,
		);

		const amountInput = screen.getByRole("spinbutton");
		await user.clear(amountInput);
		await user.type(amountInput, "0");
		await user.click(screen.getByRole("button", { name: /^approve$/i }));

		expect(
			await screen.findByText(/enter a valid amount greater than 0/i),
		).toBeInTheDocument();
		expect(mockClient.refunds.approve).not.toHaveBeenCalled();
	});

	it("delegates rejection to onReject with the refund row", async () => {
		const onReject = vi.fn();
		const refund = makeRefund();
		const user = userEvent.setup();
		renderWithProviders(
			<InlineDecisionPanel
				refund={refund}
				organizationId={ORG_ID}
				onApproved={vi.fn()}
				onReject={onReject}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /^reject$/i }));
		expect(onReject).toHaveBeenCalledWith(refund);
		expect(mockClient.refunds.reject).not.toHaveBeenCalled();
	});
});

// ── BulkApproveBar ────────────────────────────────────────────────────────────

describe("BulkApproveBar", () => {
	it("confirms and calls refunds.bulkApprove with the selected ids", async () => {
		mockClient.refunds.bulkApprove.mockResolvedValue({ approved: 2 });
		const onDone = vi.fn();
		const rows = [
			makeRefund({ id: "r-1", amountCents: 10000 }),
			makeRefund({ id: "r-2", refundNumber: "RF-000002", amountCents: 5000 }),
		];
		const user = userEvent.setup();
		renderWithProviders(
			<BulkApproveBar
				selectedIds={["r-1", "r-2"]}
				selectedRows={rows}
				organizationId={ORG_ID}
				onDone={onDone}
			/>,
		);

		expect(screen.getByText("2 refunds selected")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: /approve 2/i }));

		const dialog = await screen.findByRole("dialog");
		await user.click(
			within(dialog).getByRole("button", { name: /confirm approve/i }),
		);

		await waitFor(() => {
			expect(mockClient.refunds.bulkApprove).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				items: [{ id: "r-1" }, { id: "r-2" }],
			});
		});
		await waitFor(() => expect(onDone).toHaveBeenCalled());
	});

	it("renders nothing when the selection contains a non-pending refund", () => {
		const rows = [
			makeRefund({ id: "r-1" }),
			makeRefund({ id: "r-2", status: "approved" }),
		];
		const { container } = renderWithProviders(
			<BulkApproveBar
				selectedIds={["r-1", "r-2"]}
				selectedRows={rows}
				organizationId={ORG_ID}
				onDone={vi.fn()}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when the selection is empty", () => {
		const { container } = renderWithProviders(
			<BulkApproveBar
				selectedIds={[]}
				selectedRows={[]}
				organizationId={ORG_ID}
				onDone={vi.fn()}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});

// ── RefundsTab (reject wiring + RBAC gating) ─────────────────────────────────

describe("RefundsTab", () => {
	function seedList(rows: RefundRow[]) {
		mockClient.refunds.list.mockResolvedValue({ rows, total: rows.length });
	}

	it("rejects a pending refund through the RejectDialog with review notes", async () => {
		seedList([makeRefund()]);
		mockClient.refunds.reject.mockResolvedValue({ ok: true });
		const user = userEvent.setup();
		renderWithProviders(<RefundsTab organizationId={ORG_ID} />);

		// Expand the pending row (row body toggles the inline panel).
		await user.click(await screen.findByText("Ahmad Firdaus"));
		// Reject from the inline decision panel → opens the RejectDialog.
		await user.click(screen.getByRole("button", { name: /^reject$/i }));

		const dialog = await screen.findByRole("dialog");
		await user.type(
			within(dialog).getByLabelText(/rejection notes/i),
			"Duplicate request",
		);
		await user.click(within(dialog).getByRole("button", { name: /^reject$/i }));

		await waitFor(() => {
			expect(mockClient.refunds.reject).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				id: "refund-1",
				reviewNotes: "Duplicate request",
			});
		});
	});

	it("hides bulk-select checkboxes and the decision panel without refund_management:approve", async () => {
		grantedPermissions = new Set([
			"refund_management:read",
			"refund_management:process",
		]);
		seedList([makeRefund()]);
		const user = userEvent.setup();
		renderWithProviders(<RefundsTab organizationId={ORG_ID} />);

		await screen.findByText("Ahmad Firdaus");
		// No select-all / per-row checkboxes without approve permission.
		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);

		// Expanding a pending row shows the read-only detail, not Approve/Reject.
		await user.click(screen.getByText("Ahmad Firdaus"));
		expect(
			screen.queryByRole("button", { name: /^approve$/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /^reject$/i }),
		).not.toBeInTheDocument();
	});

	it("shows the decision panel and checkboxes with refund_management:approve", async () => {
		seedList([makeRefund()]);
		const user = userEvent.setup();
		renderWithProviders(<RefundsTab organizationId={ORG_ID} />);

		await screen.findByText("Ahmad Firdaus");
		expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);

		await user.click(screen.getByText("Ahmad Firdaus"));
		expect(
			await screen.findByRole("button", { name: /^approve$/i }),
		).toBeInTheDocument();
	});

	it("gates the Mark Paid action on refund_management:process", async () => {
		const approvedRow = makeRefund({ id: "r-appr", status: "approved" });

		// With process permission → Mark Paid visible on approved rows.
		seedList([approvedRow]);
		const { unmount } = renderWithProviders(
			<RefundsTab organizationId={ORG_ID} />,
		);
		expect(
			await screen.findByRole("button", { name: /mark paid/i }),
		).toBeInTheDocument();
		unmount();

		// Without process permission → hidden.
		grantedPermissions = new Set([
			"refund_management:read",
			"refund_management:approve",
		]);
		seedList([approvedRow]);
		renderWithProviders(<RefundsTab organizationId={ORG_ID} />);
		await screen.findByText("Ahmad Firdaus");
		expect(
			screen.queryByRole("button", { name: /mark paid/i }),
		).not.toBeInTheDocument();
	});
});
