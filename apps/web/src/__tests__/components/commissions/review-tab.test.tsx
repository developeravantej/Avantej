import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";
import { ReviewTab } from "@/components/pages/commissions/review-tab";

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1" },
		hasPermission: () => true,
	}),
}));

// The service `listPendingReview` row uses `amountCents` / `note` / `createdByName`;
// ReviewTab remaps `amountCents` → its local `calculatedAmount`. This test guards
// that mapping: pick the wrong field and the commission amount silently renders
// `RM 0.00` (passes type-check, passes the role-grouping e2e). See audit-swarm A1/P2-1.
const SERVICE_ROW = {
	id: "split-1",
	staffId: "staff-1",
	staffName: "Ahmad Firdaus",
	amountCents: 12345,
	note: null,
	appointmentId: null,
	salesOrderId: null,
	createdAt: "2026-06-01T00:00:00.000Z",
	createdByUserId: null,
	createdByName: "Manager",
	earnedAt: "2026-06-01T00:00:00.000Z",
	roleType: "trainer",
	trackId: null,
};

describe("ReviewTab — amountCents → RM remap", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.commissionSplits.listPendingReview.mockResolvedValue({
			rows: [SERVICE_ROW],
			total: 1,
			nextCursor: null,
		});
	});

	it("renders the service amountCents (12345) as RM 123.45", async () => {
		renderWithProviders(<ReviewTab />);

		await waitFor(() =>
			expect(screen.getByText("RM 123.45")).toBeInTheDocument(),
		);
		// Guard the silent-mismap failure mode explicitly.
		expect(screen.queryByText("RM 0.00")).not.toBeInTheDocument();
	});
});
