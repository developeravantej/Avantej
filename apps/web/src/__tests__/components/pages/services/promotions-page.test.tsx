import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../../helpers/mock-client";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
// oRPC: both `client` (mutations) and `orpc` (queryOptions) come from the shared
// proxy mock so `orpc.promotions.list.queryOptions()` resolves its queryFn back
// to `mockClient.promotions.list` (see helpers/mock-client.ts). `useApiMutation`
// also imports `queryClient` from this module, so we expose a stubbed one.
const { invalidateQueries } = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
}));
vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries },
}));

// useUserContext is mutated per-test via this holder.
const userContextHolder: { value: unknown } = { value: undefined };
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => userContextHolder.value,
}));

vi.mock("sonner", () => ({
	toast: {
		success: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
		info: vi.fn(),
	},
}));

import { PromotionsPage } from "@/components/pages/services/promotions-page";
import { toast } from "sonner";

// jsdom lacks pointer-capture + scroll APIs Radix Select relies on.
beforeAll(() => {
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
	}
	if (!Element.prototype.setPointerCapture) {
		Element.prototype.setPointerCapture = () => {};
	}
	if (!Element.prototype.releasePointerCapture) {
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORG_ID = "org-1";

function makeUserContext(currentOrganizationId: string | null = ORG_ID) {
	return {
		data: { currentOrganizationId, organizations: [] },
		hasPermission: () => true,
		hasAnyPermission: () => true,
		hasRole: () => true,
	};
}

// value is stored as "hundredths" — percentage value 2000 => 20.00%, and a
// fixed_amount value 1000 => RM 10.00 (cents).
const PERCENT_PROMO = {
	id: "promo-pct",
	code: "SAVE20",
	name: "20% Off All Services",
	description: "Spring sale",
	type: "percentage",
	value: 2000,
	minimumOrderAmount: 5000,
	maximumDiscount: null,
	usageLimit: 100,
	usageCount: 12,
	perCustomerLimit: 1,
	validFrom: "2026-01-01T00:00:00.000Z",
	validUntil: "2026-12-31T00:00:00.000Z",
	isActive: true,
	branchId: null,
	createdAt: "2026-01-01T00:00:00.000Z",
};

const FIXED_PROMO = {
	id: "promo-fixed",
	code: "TENOFF",
	name: "RM10 Off",
	description: null,
	type: "fixed_amount",
	value: 1000,
	minimumOrderAmount: null,
	maximumDiscount: null,
	usageLimit: null,
	usageCount: 0,
	perCustomerLimit: 1,
	validFrom: "2026-02-01T00:00:00.000Z",
	validUntil: null,
	isActive: false,
	branchId: null,
	createdAt: "2026-02-01T00:00:00.000Z",
};

beforeEach(() => {
	vi.clearAllMocks();
	userContextHolder.value = makeUserContext();
	mockClient.promotions.list.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// List render
// ---------------------------------------------------------------------------
describe("PromotionsPage — list render", () => {
	it("renders a row per promotion with code, name and type label", async () => {
		mockClient.promotions.list.mockResolvedValue([PERCENT_PROMO, FIXED_PROMO]);
		renderWithProviders(<PromotionsPage />);

		await waitFor(() =>
			expect(screen.getByText("20% Off All Services")).toBeInTheDocument(),
		);
		expect(screen.getByText("RM10 Off")).toBeInTheDocument();
		expect(screen.getByText("SAVE20")).toBeInTheDocument();
		expect(screen.getByText("TENOFF")).toBeInTheDocument();
		// Type labels.
		expect(screen.getByText("Percentage")).toBeInTheDocument();
		expect(screen.getByText("Fixed Amount")).toBeInTheDocument();
	});

	it("formats percentage and fixed-amount values correctly", async () => {
		mockClient.promotions.list.mockResolvedValue([PERCENT_PROMO, FIXED_PROMO]);
		renderWithProviders(<PromotionsPage />);

		// percentage: 2000 / 100 => "20.00%"
		await waitFor(() => expect(screen.getByText("20.00%")).toBeInTheDocument());
		// fixed_amount: formatPrice(1000, "MYR") => "RM 10.00"
		expect(screen.getByText("RM 10.00")).toBeInTheDocument();
	});

	it("reflects active/inactive status and the promotion count", async () => {
		mockClient.promotions.list.mockResolvedValue([PERCENT_PROMO, FIXED_PROMO]);
		renderWithProviders(<PromotionsPage />);

		await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
		expect(screen.getByText("Inactive")).toBeInTheDocument();
		// Count badge shows "2" next to "promotions".
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText(/promotions/)).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Loading / empty / error / no-org states
// ---------------------------------------------------------------------------
describe("PromotionsPage — loading / empty / error states", () => {
	it("shows the loading fallback while the list query is pending", async () => {
		mockClient.promotions.list.mockReturnValue(new Promise(() => {}));
		renderWithProviders(<PromotionsPage />);

		// PageLoader renders a status role with aria-label "Loading".
		expect(await screen.findByRole("status")).toBeInTheDocument();
	});

	it("shows the empty state when there are no promotions", async () => {
		mockClient.promotions.list.mockResolvedValue([]);
		renderWithProviders(<PromotionsPage />);

		expect(await screen.findByText("No promotions found.")).toBeInTheDocument();
	});

	it("shows the error callout with a Retry action when the query errors", async () => {
		mockClient.promotions.list.mockRejectedValue(new Error("boom"));
		renderWithProviders(<PromotionsPage />);

		expect(
			await screen.findByText("Couldn't load promotions"),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
	});

	it("prompts to select an organization when none is set", async () => {
		userContextHolder.value = makeUserContext(null);
		renderWithProviders(<PromotionsPage />);

		expect(
			await screen.findByText("Select an organization to view promotions."),
		).toBeInTheDocument();
		// The list query is gated by `enabled: !!organizationId`.
		expect(mockClient.promotions.list).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// Search filtering
// ---------------------------------------------------------------------------
describe("PromotionsPage — search", () => {
	it("filters rows by code/name and shows the search empty state when nothing matches", async () => {
		mockClient.promotions.list.mockResolvedValue([PERCENT_PROMO, FIXED_PROMO]);
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await waitFor(() => screen.getByText("SAVE20"));
		await user.type(
			screen.getByPlaceholderText("Search promotions..."),
			"save",
		);

		// SAVE20 stays, TENOFF filtered out.
		expect(screen.getByText("SAVE20")).toBeInTheDocument();
		expect(screen.queryByText("TENOFF")).not.toBeInTheDocument();

		await user.clear(screen.getByPlaceholderText("Search promotions..."));
		await user.type(
			screen.getByPlaceholderText("Search promotions..."),
			"zzz-no-match",
		);
		expect(
			await screen.findByText("No promotions match your search."),
		).toBeInTheDocument();
	});
});

// ---------------------------------------------------------------------------
// Mutation flows
// ---------------------------------------------------------------------------
describe("PromotionsPage — create flow", () => {
	it("creates a percentage promotion with uppercased code and value encoded as hundredths", async () => {
		mockClient.promotions.list.mockResolvedValue([]);
		mockClient.promotions.create.mockResolvedValue({ id: "new" });
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await screen.findByText("No promotions found.");
		await user.click(screen.getByRole("button", { name: /New Promotion/i }));

		const dialog = await screen.findByRole("dialog");
		const ui = within(dialog);

		// Code gets uppercased on input; default type is "percentage".
		await user.type(ui.getByLabelText(/^Code/i), "save20");
		await user.type(ui.getByLabelText(/^Name/i), "Spring 20");
		await user.type(ui.getByLabelText(/Discount %/i), "20");
		await user.type(ui.getByLabelText(/Minimum Order Amount/i), "50");
		// datetime-local inputs.
		await user.type(ui.getByLabelText(/Valid From/i), "2026-03-01T00:00");

		await user.click(ui.getByRole("button", { name: /Create Promotion/i }));

		await waitFor(() => {
			expect(mockClient.promotions.create).toHaveBeenCalledTimes(1);
		});
		const arg = mockClient.promotions.create.mock.calls[0][0];
		expect(arg).toMatchObject({
			organizationId: ORG_ID,
			code: "SAVE20",
			name: "Spring 20",
			type: "percentage",
			// 20 entered => Math.round(20 * 100) = 2000
			value: 2000,
			// RM 50 => rmToCents(50) = 5000
			minimumOrderAmount: 5000,
		});
		expect(typeof arg.validFrom).toBe("string");
	});

	it("blocks submission and toasts when the percentage value exceeds 100", async () => {
		mockClient.promotions.list.mockResolvedValue([]);
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await screen.findByText("No promotions found.");
		await user.click(screen.getByRole("button", { name: /New Promotion/i }));

		const dialog = await screen.findByRole("dialog");
		const ui = within(dialog);
		await user.type(ui.getByLabelText(/^Code/i), "BIG");
		await user.type(ui.getByLabelText(/^Name/i), "Too much");
		await user.type(ui.getByLabelText(/Discount %/i), "150");
		await user.type(ui.getByLabelText(/Valid From/i), "2026-03-01T00:00");
		await user.click(ui.getByRole("button", { name: /Create Promotion/i }));

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("100%")),
		);
		expect(mockClient.promotions.create).not.toHaveBeenCalled();
	});

	it("rejects a code shorter than 3 characters", async () => {
		mockClient.promotions.list.mockResolvedValue([]);
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await screen.findByText("No promotions found.");
		await user.click(screen.getByRole("button", { name: /New Promotion/i }));

		const dialog = await screen.findByRole("dialog");
		const ui = within(dialog);
		await user.type(ui.getByLabelText(/^Code/i), "AB");
		await user.type(ui.getByLabelText(/^Name/i), "Short code");
		await user.type(ui.getByLabelText(/Discount %/i), "10");
		await user.type(ui.getByLabelText(/Valid From/i), "2026-03-01T00:00");
		await user.click(ui.getByRole("button", { name: /Create Promotion/i }));

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				expect.stringContaining("at least 3 characters"),
			),
		);
		expect(mockClient.promotions.create).not.toHaveBeenCalled();
	});
});

describe("PromotionsPage — deactivate / reactivate flows", () => {
	it("deactivates an active promotion via the confirm dialog", async () => {
		mockClient.promotions.list.mockResolvedValue([PERCENT_PROMO]);
		mockClient.promotions.deactivate.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await waitFor(() => screen.getByText("SAVE20"));
		await user.click(screen.getByRole("button", { name: /Deactivate/i }));

		// Confirm dialog → click the destructive confirm button.
		const dialog = await screen.findByRole("dialog");
		await user.click(
			within(dialog).getByRole("button", { name: /^Deactivate$/i }),
		);

		await waitFor(() => {
			expect(mockClient.promotions.deactivate).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				id: PERCENT_PROMO.id,
			});
		});
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith(
				expect.stringContaining("deactivated"),
			),
		);
	});

	it("reactivates an inactive promotion via update(isActive:true)", async () => {
		mockClient.promotions.list.mockResolvedValue([FIXED_PROMO]);
		mockClient.promotions.update.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await waitFor(() => screen.getByText("TENOFF"));
		await user.click(screen.getByRole("button", { name: /^Enable$/i }));

		await waitFor(() => {
			expect(mockClient.promotions.update).toHaveBeenCalledWith({
				organizationId: ORG_ID,
				id: FIXED_PROMO.id,
				isActive: true,
			});
		});
		expect(mockClient.promotions.deactivate).not.toHaveBeenCalled();
	});
});

describe("PromotionsPage — edit flow", () => {
	it("opens edit prefilled and saves name/description/validity via update", async () => {
		mockClient.promotions.list.mockResolvedValue([PERCENT_PROMO]);
		mockClient.promotions.update.mockResolvedValue({});
		const user = userEvent.setup();
		renderWithProviders(<PromotionsPage />);

		await waitFor(() => screen.getByText("SAVE20"));
		await user.click(screen.getByRole("button", { name: /^Edit$/i }));

		const dialog = await screen.findByRole("dialog");
		const ui = within(dialog);
		// Prefilled name from the row.
		expect((ui.getByLabelText(/^Name/i) as HTMLInputElement).value).toBe(
			"20% Off All Services",
		);
		await user.clear(ui.getByLabelText(/^Name/i));
		await user.type(ui.getByLabelText(/^Name/i), "Renamed Promo");
		await user.click(ui.getByRole("button", { name: /Save Changes/i }));

		await waitFor(() => {
			expect(mockClient.promotions.update).toHaveBeenCalledTimes(1);
		});
		const arg = mockClient.promotions.update.mock.calls[0][0];
		expect(arg).toMatchObject({
			organizationId: ORG_ID,
			id: PERCENT_PROMO.id,
			name: "Renamed Promo",
		});
	});
});
