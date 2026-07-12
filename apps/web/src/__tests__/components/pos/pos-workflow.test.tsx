import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";
import { formatPrice } from "@/lib/money";

// ─── Module mocks ───────────────────────────────────────────────────────────
// oRPC: route both client.* and orpc.*.queryOptions() through the shared proxy.
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));

// Admin user context with an org id + a branch so resolvedBranchId is non-null
// (recordSale throws "no branch assigned" otherwise). hasPermission → true so
// the pos:create RBAC gate renders the workflow instead of "Permission Denied".
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: {
			currentOrganizationId: "org-1",
			user: { id: "user-admin" },
			organizations: [
				{
					id: "org-1",
					name: "Test Fitness Franchise",
					hierarchy: { member: { hierarchyScopeId: "branch-1" } },
				},
			],
		},
		hasPermission: () => true,
	}),
}));

// Scope switcher: PosWorkflow reads useScope() to seed the recording-branch
// default. Stub the FULL contract. scopeNodeId undefined → "All" scope → no
// seed, so the recording branch falls back to the member-home branch ("branch-1")
// exactly as before this seam existed (keeps these assertions unchanged).
vi.mock("@/components/scope/ScopeProvider", () => ({
	useScope: () => ({
		scopeNodeId: undefined,
		isAllScope: true,
		activeScopeId: "branch-1",
		activeScopeNode: null,
		setActiveScope: vi.fn(),
		resetScope: vi.fn(),
		accessibleNodeIds: ["branch-1"],
		scopeNodes: [],
		topAccessibleNodeId: "branch-1",
		isScopeReady: true,
	}),
}));

// TanStack Router: PosWorkflow imports Link + useNavigate at module scope.
const navigateSpy = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
	useNavigate: () => navigateSpy,
}));

import { PosWorkflow } from "@/components/pos/pos-workflow";

// ─── jsdom shims for Radix Select pointer interactions ──────────────────────
beforeAll(() => {
	// jsdom lacks these; Radix Select needs them to open/select an option.
	window.HTMLElement.prototype.hasPointerCapture = vi.fn();
	window.HTMLElement.prototype.releasePointerCapture = vi.fn();
	window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

// ─── Fixtures ───────────────────────────────────────────────────────────────
const SERVICE = { id: "svc-1", name: "Body Massage 60min", price: 30000 };
const SERVICE_PRICE_CENTS = 30000; // RM 300.00 resolved at the branch

const INSTALLMENT_PLAN = {
	id: "plan-1",
	code: "PLAN3",
	name: "3-Month Plan",
	numInstallments: 3,
	pricePremiumBps: 0,
	isActive: true,
};

const TRAINER = { id: "trainer-1", name: "Coach Ali", role: "trainer" };

const PREFILL_CUSTOMER_ID = "member-1";
// Shape consumed by the prefill effect in PosWorkflow (customerDirectory.getById).
const CUSTOMER_DETAIL = {
	member: { id: "member-1", hierarchyScopeId: "branch-1" },
	user: { name: "Ahmad Firdaus", email: "member@test.my" },
	profile: { phone: "+60123456789" },
};

/**
 * Wire the oRPC procedures PosWorkflow + its children read. The mock-client
 * proxy resolves any un-stubbed path to `undefined`, so we only override the
 * queries whose data the flow actually depends on.
 */
function stubOrpc() {
	mockClient.taxRates.list.mockResolvedValue([]);
	mockClient.taxRates.getDefault.mockResolvedValue(null);
	mockClient.salesOrders.getLatest.mockResolvedValue(null);
	mockClient.members.list.mockResolvedValue([]);
	mockClient.services.list.mockResolvedValue([SERVICE]);
	mockClient.services.resolvePrice.mockResolvedValue({
		priceCents: SERVICE_PRICE_CENTS,
	});
	mockClient.installmentPlans.list.mockResolvedValue([INSTALLMENT_PLAN]);
	mockClient.pos.recordSale.mockResolvedValue({ salesOrderId: "so-1" });
	mockClient.customerDirectory.getById.mockResolvedValue(CUSTOMER_DETAIL);
}

/** Open a Radix Select trigger and click the option matching `optionText`. */
async function selectOption(
	user: ReturnType<typeof userEvent.setup>,
	trigger: HTMLElement,
	optionText: RegExp | string,
) {
	await user.click(trigger);
	const option = await screen.findByRole("option", { name: optionText });
	await user.click(option);
}

/**
 * Render with a prefilled MEMBER customer (so the Service add-button is enabled —
 * walk-ins can only add Custom lines) and add one service item priced at RM 300.
 * Leaves the workflow on the Items step (step index 1).
 */
async function renderWithServiceItem(user: ReturnType<typeof userEvent.setup>) {
	renderWithProviders(<PosWorkflow prefillCustomerId={PREFILL_CUSTOMER_ID} />);

	// Wait for the prefill effect to seat the customer and land on the Items step.
	await screen.findByTestId("pos-add-service-button");

	// Add a Service line, then pick the service from the combobox. The option
	// label carries a price qualifier ("Body Massage 60min — RM 300.00"), so
	// match on the name prefix rather than the exact string.
	await user.click(screen.getByTestId("pos-add-service-button"));
	const serviceTrigger = await screen.findByRole("combobox");
	await selectOption(user, serviceTrigger, new RegExp(SERVICE.name));

	// Price resolves async via resolvePrice — wait for it to land in the item row.
	await waitFor(() => {
		expect(mockClient.services.resolvePrice).toHaveBeenCalled();
	});
}

describe("PosWorkflow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		stubOrpc();
	});

	// ── Invariant 2: cart / total calculation ────────────────────────────────
	it("computes subtotal/total from added items (cart calc)", async () => {
		const user = userEvent.setup();
		await renderWithServiceItem(user);

		// Live Order panel "Items (n)" subtotal must equal the resolved unit price.
		// No tax configured (taxRates=[]) so subtotal === total (est. total).
		await waitFor(() => {
			const subtotalMatches = screen.getAllByText(
				formatPrice(SERVICE_PRICE_CENTS, "MYR"),
			);
			expect(subtotalMatches.length).toBeGreaterThan(0);
		});

		// The item count label reflects the single added item (shown in the
		// Items step header and the Live Order panel).
		expect(screen.getAllByText(/Items \(1\)/).length).toBeGreaterThan(0);
	});

	// ── Invariant 1: installment plan shows INSTALLMENT amount, not full price ─
	it("shows the per-instalment due amount (not the full package price) when a plan is selected", async () => {
		const user = userEvent.setup();
		await renderWithServiceItem(user);

		// Advance Items → Promotions → Payment.
		await user.click(
			screen.getByRole("button", { name: /Continue to Promotions/ }),
		);
		await user.click(
			screen.getByRole("button", { name: /Continue to Payment/ }),
		);

		// Choose cash (avoids reference/link branches), then pick the 3-month plan.
		await user.click(screen.getByRole("button", { name: /Cash/ }));

		const planTrigger = await screen.findByTestId(
			"pos-installment-plan-select",
		);
		await selectOption(user, planTrigger, /3-Month Plan/);

		// Full price = RM 300.00; per-instalment (3 instalments, 0 premium) = RM 100.00.
		const fullPrice = formatPrice(SERVICE_PRICE_CENTS, "MYR"); // RM 300.00
		const dueNow = formatPrice(Math.round(SERVICE_PRICE_CENTS / 3), "MYR"); // RM 100.00
		expect(fullPrice).not.toBe(dueNow); // guard the fixture itself

		// "Due Today" must render the instalment amount, and the full-total row
		// must render the full price separately — proving the POS shows the
		// instalment (not full price) as the amount due now.
		await waitFor(() => {
			expect(screen.getAllByText(dueNow).length).toBeGreaterThan(0);
		});

		// The full price is shown only on the "Full total (N instalments)" line,
		// NOT as the due-now / total figure.
		const fullTotalRow = screen
			.getByText(/Full total \(3 instalments\)/)
			.closest("div") as HTMLElement;
		expect(within(fullTotalRow).getByText(fullPrice)).toBeInTheDocument();
	});

	// ── Invariant 3a: commission routes via ROTATION (no trainer requested) ───
	it("records a sale with no preferred trainer when staff is left blank (rotation queue path)", async () => {
		const user = userEvent.setup();
		await renderWithServiceItem(user);

		await user.click(
			screen.getByRole("button", { name: /Continue to Promotions/ }),
		);
		await user.click(
			screen.getByRole("button", { name: /Continue to Payment/ }),
		);

		// Pick cash, leave Preferred trainer = "No preference" (rotation).
		await user.click(screen.getByRole("button", { name: /Cash/ }));
		await user.click(screen.getByRole("button", { name: /Review & Confirm/ }));

		// Confirm & charge.
		await user.click(screen.getByTestId("pos-complete-sale-button"));

		await waitFor(() => {
			expect(mockClient.pos.recordSale).toHaveBeenCalledTimes(1);
		});
		const payload = mockClient.pos.recordSale.mock.calls[0][0];
		// Rotation path: no specific trainer requested. Commission still reaches a
		// trainer server-side via the rotation queue (preferredTrainerId omitted).
		expect(payload.preferredTrainerId).toBeUndefined();
		expect(payload.itemTrainerAssignments).toBeUndefined();
		// The sale still carries the service item so a commission can be generated.
		expect(payload.items).toHaveLength(1);
		expect(payload.items[0].refId).toBe(SERVICE.id);
	});

	// ── Invariant 3b: commission routes to a REQUESTED/specific trainer ───────
	it("records the requested trainer as preferredTrainerId when one is picked", async () => {
		mockClient.members.list.mockImplementation((input: { role?: string }) => {
			// PaymentStep fetches role:"trainer"; attribution selects fetch all.
			if (input?.role === "trainer") return Promise.resolve([TRAINER]);
			return Promise.resolve([]);
		});

		const user = userEvent.setup();
		await renderWithServiceItem(user);

		await user.click(
			screen.getByRole("button", { name: /Continue to Promotions/ }),
		);
		await user.click(
			screen.getByRole("button", { name: /Continue to Payment/ }),
		);

		await user.click(screen.getByRole("button", { name: /Cash/ }));

		// Request a specific trainer via the Preferred trainer select.
		const trainerTrigger = await screen.findByLabelText(/Preferred trainer/);
		await selectOption(user, trainerTrigger, /Coach Ali/);

		await user.click(screen.getByRole("button", { name: /Review & Confirm/ }));
		await user.click(screen.getByTestId("pos-complete-sale-button"));

		await waitFor(() => {
			expect(mockClient.pos.recordSale).toHaveBeenCalledTimes(1);
		});
		const payload = mockClient.pos.recordSale.mock.calls[0][0];
		// Requested path: the specific trainer is carried so commission reaches them.
		expect(payload.preferredTrainerId).toBe(TRAINER.id);
	});
});
