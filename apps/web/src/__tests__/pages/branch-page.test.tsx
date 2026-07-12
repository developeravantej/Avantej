/**
 * BranchPage unit test (Plan 5, Task 2).
 *
 * NOTE: BranchPage.tsx is under active work on branch
 * `wilfred/avantej-16-opening-hours` — this test asserts CURRENT behavior
 * (opening-hours enrichment via getBranchDetails + openingHours forwarded on
 * hierarchy.updateNode) and never modifies the page. Presentational children
 * (TreeRow / NodeDetailPanel / EditBranchDialog) are stubbed so the test pins
 * the page's data wiring, not the child UIs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";
import type { OpeningHoursShape } from "@/components/pages/branch/types";

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

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
vi.mock("sonner", () => ({
	toast: {
		success: (...a: unknown[]) => toastSuccess(...a),
		error: (...a: unknown[]) => toastError(...a),
		info: (...a: unknown[]) => toastInfo(...a),
	},
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: () => ({
			data: { user: { id: "user-1", email: "admin@test.my" } },
			isPending: false,
		}),
	},
}));

vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "11111111-2222-3333-4444-555555555555",
			organizations: [],
		},
		isLoading: false,
		hasPermission: () => true,
		hasRole: () => true,
	}),
}));

const navigateFn = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
	useNavigate: () => navigateFn,
}));

// ── Presentational stubs ──────────────────────────────────────────────────
vi.mock("@/components/pages/branch/TreeRow", () => ({
	TreeRow: ({
		node,
		onSelect,
	}: {
		node: { id: string; name: string };
		onSelect: () => void;
	}) => (
		<button
			type="button"
			data-testid={`tree-row-${node.id}`}
			onClick={onSelect}
		>
			{node.name}
		</button>
	),
}));

vi.mock("@/components/pages/branch/NodeDetailPanel", () => ({
	NodeDetailPanel: ({
		node,
		onEdit,
	}: {
		node: { id: string; name: string; openingHours?: unknown };
		onEdit: () => void;
	}) => (
		<div data-testid="detail-panel">
			<span data-testid="detail-name">{node.name}</span>
			<span data-testid="detail-opening-hours">
				{JSON.stringify(node.openingHours ?? null)}
			</span>
			<button type="button" onClick={onEdit}>
				Edit node
			</button>
		</div>
	),
}));

// EditBranchDialog stub: exposes buttons that drive the page's edit state
// (the state itself lives in BranchPage) and the submit handler.
vi.mock("@/components/pages/branch/EditBranchDialog", () => ({
	EditBranchDialog: ({
		open,
		editName,
		setEditName,
		setEditOpeningHours,
		setEditInvoicePrefix,
		onSubmit,
	}: {
		open: boolean;
		editName: string;
		setEditName: (v: string) => void;
		setEditOpeningHours: (v: OpeningHoursShape) => void;
		setEditInvoicePrefix: (v: string) => void;
		onSubmit: () => void;
	}) =>
		open ? (
			<div data-testid="edit-dialog">
				<span data-testid="edit-name-value">{editName}</span>
				<button type="button" onClick={() => setEditName("Renamed Branch")}>
					stub-set-name
				</button>
				<button
					type="button"
					onClick={() =>
						setEditOpeningHours({
							monday: { open: "09:00", close: "18:00" },
							sunday: null,
						})
					}
				>
					stub-set-opening-hours
				</button>
				<button type="button" onClick={() => setEditInvoicePrefix("INV-KK")}>
					stub-set-invoice-prefix
				</button>
				<button type="button" onClick={onSubmit}>
					stub-submit
				</button>
			</div>
		) : null,
}));

import { BranchPage } from "@/components/pages/branch/BranchPage";

const ORG_ID = "11111111-2222-3333-4444-555555555555";
const BRANCH_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const branchNode = {
	id: BRANCH_ID,
	name: "Kota Kinabalu Branch",
	type: "branch",
	depth: 4,
	parentId: null,
	address: "1 Jalan Gaya",
	openingHours: null,
	membersCount: 10,
	staffCount: 3,
	monthRevenueCents: 100000,
	stale: false,
};

const branchDetails = {
	nodeId: BRANCH_ID,
	address: "1 Jalan Gaya",
	companyLegalName: "KK Fitness Sdn Bhd",
	registrationNumber: "1234567-X",
	taxId: "TAX-1",
	invoicePrefix: "INV",
	receiptPrefix: "RCP",
	branchTaxRateId: null,
	openingHours: { monday: { open: "08:00", close: "20:00" } },
};

describe("BranchPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.hierarchy.listNodesWithStats.mockResolvedValue({
			nodes: [branchNode],
		});
		mockClient.hierarchy.listNodes.mockResolvedValue({
			nodes: [
				{
					id: BRANCH_ID,
					name: "Kota Kinabalu Branch",
					type: "branch",
					depth: 4,
					parentId: null,
				},
			],
		});
		mockClient.hierarchy.getBranchDetails.mockResolvedValue(branchDetails);
		mockClient.taxRates.list.mockResolvedValue([]);
		mockClient.hierarchy.updateNode.mockResolvedValue({ ok: true });
		mockClient.hierarchy.moveNode.mockResolvedValue({ ok: true });
	});

	it("renders the hierarchy tree and auto-selects the first root", async () => {
		renderWithProviders(<BranchPage />);

		expect(
			await screen.findByTestId(`tree-row-${BRANCH_ID}`),
		).toBeInTheDocument();
		// Auto-select surfaces the detail panel for the root node.
		expect(await screen.findByTestId("detail-panel")).toBeInTheDocument();
		expect(screen.getByTestId("detail-name")).toHaveTextContent(
			"Kota Kinabalu Branch",
		);
		expect(mockClient.hierarchy.listNodesWithStats).toHaveBeenCalled();
		expect(
			mockClient.hierarchy.listNodesWithStats.mock.calls[0][0],
		).toMatchObject({ organizationId: ORG_ID });
	});

	it("enriches the selected branch with getBranchDetails opening hours", async () => {
		renderWithProviders(<BranchPage />);

		await waitFor(() => {
			expect(screen.getByTestId("detail-opening-hours")).toHaveTextContent(
				'{"monday":{"open":"08:00","close":"20:00"}}',
			);
		});
		expect(
			mockClient.hierarchy.getBranchDetails.mock.calls[0][0],
		).toMatchObject({ organizationId: ORG_ID, nodeId: BRANCH_ID });
	});

	it("sends the hierarchy.updateNode payload with changed opening-hours and profile fields", async () => {
		const user = userEvent.setup();
		renderWithProviders(<BranchPage />);

		await user.click(await screen.findByRole("button", { name: "Edit node" }));
		expect(await screen.findByTestId("edit-dialog")).toBeInTheDocument();
		// Prefill came from the enriched node.
		expect(screen.getByTestId("edit-name-value")).toHaveTextContent(
			"Kota Kinabalu Branch",
		);

		await user.click(screen.getByRole("button", { name: "stub-set-name" }));
		await user.click(
			screen.getByRole("button", { name: "stub-set-opening-hours" }),
		);
		await user.click(
			screen.getByRole("button", { name: "stub-set-invoice-prefix" }),
		);
		await user.click(screen.getByRole("button", { name: "stub-submit" }));

		await waitFor(() => {
			expect(mockClient.hierarchy.updateNode).toHaveBeenCalledTimes(1);
		});
		expect(mockClient.hierarchy.updateNode.mock.calls[0][0]).toMatchObject({
			organizationId: ORG_ID,
			nodeId: BRANCH_ID,
			name: "Renamed Branch",
			invoicePrefix: "INV-KK",
			openingHours: {
				monday: { open: "09:00", close: "18:00" },
				sunday: null,
			},
		});
		// Unchanged profile fields are omitted from the payload.
		const payload = mockClient.hierarchy.updateNode.mock.calls[0][0];
		expect(payload.companyLegalName).toBeUndefined();
		expect(payload.registrationNumber).toBeUndefined();
		// No parent change → no moveNode.
		expect(mockClient.hierarchy.moveNode).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(toastSuccess).toHaveBeenCalledWith("Branch updated successfully");
		});
	});

	it("submits nothing and informs the user when no fields changed", async () => {
		const user = userEvent.setup();
		renderWithProviders(<BranchPage />);

		await user.click(await screen.findByRole("button", { name: "Edit node" }));
		await user.click(screen.getByRole("button", { name: "stub-submit" }));

		await waitFor(() => {
			expect(toastInfo).toHaveBeenCalledWith("No changes made");
		});
		expect(mockClient.hierarchy.updateNode).not.toHaveBeenCalled();
	});
});
