import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("@/hooks/useApiMutation", () => ({
	useApiMutation: (opts: {
		mutationFn: () => unknown;
		onSuccess?: () => void;
	}) => ({
		mutate: vi.fn().mockImplementation(async () => {
			await opts.mutationFn();
			opts.onSuccess?.();
		}),
		isPending: false,
	}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AddExceptionDialog } from "@/components/calendar/add-exception-dialog";

const baseProps = {
	open: true,
	onOpenChange: vi.fn(),
	organizationId: "org-1",
	onSuccess: vi.fn(),
};

describe("AddExceptionDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.trainerAvailability.listByBranch.mockResolvedValue([]);
		mockClient.trainerAvailability.addException.mockResolvedValue({});
	});

	it("renders dialog title for timeoff kind by default", () => {
		renderWithProviders(<AddExceptionDialog {...baseProps} />);
		expect(
			screen.getByRole("heading", { name: "Add Exception Day" }),
		).toBeInTheDocument();
	});

	it("renders dialog title for blocked kind when defaultKind=blocked", () => {
		renderWithProviders(
			<AddExceptionDialog {...baseProps} defaultKind="blocked" />,
		);
		expect(
			screen.getByRole("heading", { name: "Block Time" }),
		).toBeInTheDocument();
	});

	it("shows trainer name when preselected", () => {
		renderWithProviders(
			<AddExceptionDialog
				{...baseProps}
				preselectedTrainerId="trainer-1"
				preselectedTrainerName="Jane Trainer"
			/>,
		);
		expect(screen.getByText("Jane Trainer")).toBeInTheDocument();
		// Trainer selector dropdown should NOT be visible
		expect(screen.queryByLabelText(/^trainer$/i)).not.toBeInTheDocument();
	});

	it("shows trainer dropdown when no trainer is preselected", async () => {
		mockClient.trainerAvailability.listByBranch.mockResolvedValue([
			{ trainerId: "t-1", trainerName: "Alice Trainer" },
		]);
		renderWithProviders(<AddExceptionDialog {...baseProps} />);
		await waitFor(() => {
			expect(screen.getByLabelText(/trainer/i)).toBeInTheDocument();
		});
	});

	it("Submit button is disabled when date is empty", () => {
		renderWithProviders(
			<AddExceptionDialog
				{...baseProps}
				preselectedTrainerId="trainer-1"
				preselectedTrainerName="Jane Trainer"
			/>,
		);
		const submitBtn = screen.getByRole("button", { name: /add exception/i });
		expect(submitBtn).toBeDisabled();
	});

	it("Submit button enables after trainer + date are set", async () => {
		const user = userEvent.setup();
		renderWithProviders(
			<AddExceptionDialog
				{...baseProps}
				preselectedTrainerId="trainer-1"
				preselectedTrainerName="Jane Trainer"
			/>,
		);
		const dateInput = screen.getByLabelText(/exception date/i);
		await user.type(dateInput, "2025-07-10");
		// The button should now be enabled
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /add exception/i }),
			).not.toBeDisabled();
		});
	});

	it("kind radio buttons toggle title", async () => {
		const user = userEvent.setup();
		renderWithProviders(<AddExceptionDialog {...baseProps} />);
		expect(
			screen.getByRole("heading", { name: "Add Exception Day" }),
		).toBeInTheDocument();

		const blockedRadio = screen.getByRole("button", { name: /^blocked$/i });
		await user.click(blockedRadio);

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Block Time" }),
			).toBeInTheDocument();
		});
	});

	it("submitting calls addException with correct args", async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		renderWithProviders(
			<AddExceptionDialog
				{...baseProps}
				preselectedTrainerId="trainer-1"
				preselectedTrainerName="Jane Trainer"
				onSuccess={onSuccess}
			/>,
		);
		await user.type(screen.getByLabelText(/exception date/i), "2025-07-10");
		await user.type(screen.getByLabelText(/reason/i), "Public holiday");

		await user.click(screen.getByRole("button", { name: /add exception/i }));

		await waitFor(() => {
			expect(mockClient.trainerAvailability.addException).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: "org-1",
					trainerId: "trainer-1",
					date: "2025-07-10",
					kind: "timeoff",
					reason: "Public holiday",
				}),
			);
		});
	});

	it("Cancel button closes the dialog", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		renderWithProviders(
			<AddExceptionDialog {...baseProps} onOpenChange={onOpenChange} />,
		);
		await user.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
