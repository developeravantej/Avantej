import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../../helpers/mock-client";
import { BulkActionBar } from "@/components/commissions/bulk-action-bar";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const DEFAULT_PROPS = {
	selectedIds: ["split-1", "split-2"],
	tab: "pending" as const,
	organizationId: "org-1",
	canApprove: true,
	canProcess: false,
	onDone: vi.fn(),
};

describe("BulkActionBar — ApproveConfirmDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.commissionSplits.approve.mockResolvedValue({});
	});

	it("Cancel does NOT fire approve mutation", async () => {
		const user = userEvent.setup();
		renderWithProviders(<BulkActionBar {...DEFAULT_PROPS} />);

		await user.click(screen.getByRole("button", { name: /approve selected/i }));
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		await user.click(screen.getByRole("button", { name: /cancel/i }));

		expect(mockClient.commissionSplits.approve).not.toHaveBeenCalled();
	});

	it("Confirm fires approve mutation with correct ids", async () => {
		const user = userEvent.setup();
		renderWithProviders(<BulkActionBar {...DEFAULT_PROPS} />);

		await user.click(screen.getByRole("button", { name: /approve selected/i }));
		await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
		await user.click(screen.getByRole("button", { name: /^approve$/i }));

		await waitFor(() => {
			expect(mockClient.commissionSplits.approve).toHaveBeenCalledWith({
				organizationId: "org-1",
				ids: ["split-1", "split-2"],
			});
		});
	});
});
