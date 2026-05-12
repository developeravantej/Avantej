import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../helpers/render-with-providers";
import { mockClient } from "../../helpers/mock-client";
import { DropInForm } from "@/components/attendance/drop-in-form";

vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const DEFAULT_PROPS = {
	organizationId: "org-1",
	branchId: "branch-1",
	queryKey: ["attendance"],
};

describe("DropInForm — duplicate check-in dialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.checkIns.getActivePackageForMember.mockResolvedValue(null);
	});

	it("shows dialog with minutesAgo when ALREADY_CHECKED_IN is returned", async () => {
		mockClient.checkIns.recordCheckIn.mockRejectedValue(
			new Error("ALREADY_CHECKED_IN: Already checked in 12 minutes ago"),
		);

		const user = userEvent.setup();
		renderWithProviders(<DropInForm {...DEFAULT_PROPS} />);

		// Switch to walk-in so we can submit without a UUID
		await user.click(screen.getByRole("button", { name: /walk-in/i }));
		await user.click(screen.getByRole("button", { name: /check in/i }));

		await waitFor(() => {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		});
		expect(screen.getByText(/12 minutes ago/i)).toBeInTheDocument();
	});

	it("does not show dialog on a non-duplicate error", async () => {
		mockClient.checkIns.recordCheckIn.mockRejectedValue(
			new Error("INTERNAL_SERVER_ERROR"),
		);

		const user = userEvent.setup();
		renderWithProviders(<DropInForm {...DEFAULT_PROPS} />);

		await user.click(screen.getByRole("button", { name: /walk-in/i }));
		await user.click(screen.getByRole("button", { name: /check in/i }));

		await waitFor(() => {
			expect(mockClient.checkIns.recordCheckIn).toHaveBeenCalled();
		});
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
