import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({ client: mockClient, orpc: mockOrpc }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ScheduleReportDialog } from "@/components/reports/schedule-report-dialog";

const baseProps = {
	open: true,
	onOpenChange: vi.fn(),
	organizationId: "org-1",
	currentWindow: "30D" as const,
};

const existingSchedule = {
	id: "sched-1",
	reportName: "Weekly Report",
	recipients: "ops@example.com",
	frequency: "weekly",
	windowKey: "30D",
	isActive: true,
	lastError: null,
};

describe("ScheduleReportDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.scheduledReports.list.mockResolvedValue([]);
		mockClient.scheduledReports.create.mockResolvedValue({});
		mockClient.scheduledReports.delete.mockResolvedValue({});
		mockClient.scheduledReports.toggle.mockResolvedValue({});
	});

	it("renders dialog title", () => {
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		expect(screen.getByText("Schedule Email Report")).toBeInTheDocument();
	});

	it("shows loading indicator while fetching existing schedules", async () => {
		// Never resolves → stays loading
		mockClient.scheduledReports.list.mockReturnValue(new Promise(() => {}));
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() => {
			expect(screen.getByText("Loading…")).toBeInTheDocument();
		});
	});

	it("shows 'No schedules yet' when list is empty", async () => {
		mockClient.scheduledReports.list.mockResolvedValue([]);
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() => {
			expect(screen.getByText("No schedules yet.")).toBeInTheDocument();
		});
	});

	it("renders existing schedule row with Pause/delete buttons", async () => {
		mockClient.scheduledReports.list.mockResolvedValue([existingSchedule]);
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() => {
			expect(screen.getByText("Weekly Report")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: /pause/i }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: /remove schedule/i }),
			).toBeInTheDocument();
		});
	});

	it("shows paused badge for inactive schedule and Resume button", async () => {
		mockClient.scheduledReports.list.mockResolvedValue([
			{ ...existingSchedule, isActive: false },
		]);
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() => {
			expect(screen.getByText("Paused")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: /resume/i }),
			).toBeInTheDocument();
		});
	});

	it("renders create form fields", async () => {
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() => {
			expect(screen.getByLabelText(/report name/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/recipients/i)).toBeInTheDocument();
		});
	});

	it("submitting empty form shows validation errors", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() =>
			expect(screen.getByLabelText(/recipients/i)).toBeInTheDocument(),
		);

		// Clear both fields and submit to trigger validation
		await user.clear(screen.getByLabelText(/report name/i));
		await user.click(screen.getByRole("button", { name: /create schedule/i }));

		await waitFor(() => {
			expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0);
		});
	});

	it("valid form calls scheduledReports.create with correct data", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() =>
			expect(screen.getByLabelText(/recipients/i)).toBeInTheDocument(),
		);

		// Fill recipients (report name has default "Performance Report")
		await user.clear(screen.getByLabelText(/recipients/i));
		await user.type(screen.getByLabelText(/recipients/i), "ops@example.com");

		await user.click(screen.getByRole("button", { name: /create schedule/i }));

		await waitFor(() => {
			expect(mockClient.scheduledReports.create).toHaveBeenCalledWith(
				expect.objectContaining({
					organizationId: "org-1",
					recipients: "ops@example.com",
					windowKey: "30D",
				}),
			);
		});
	});

	it("delete button calls scheduledReports.delete", async () => {
		const user = userEvent.setup();
		mockClient.scheduledReports.list.mockResolvedValue([existingSchedule]);
		renderWithProviders(<ScheduleReportDialog {...baseProps} />);
		await waitFor(() =>
			expect(screen.getByText("Weekly Report")).toBeInTheDocument(),
		);

		await user.click(screen.getByRole("button", { name: /remove schedule/i }));

		await waitFor(() => {
			expect(mockClient.scheduledReports.delete).toHaveBeenCalledWith(
				expect.objectContaining({ organizationId: "org-1", id: "sched-1" }),
			);
		});
	});

	it("Close button calls onOpenChange(false)", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		renderWithProviders(
			<ScheduleReportDialog {...baseProps} onOpenChange={onOpenChange} />,
		);
		await waitFor(() =>
			expect(screen.getByLabelText(/recipients/i)).toBeInTheDocument(),
		);
		// The footer Close button has variant="outline" — find it specifically in the form footer
		const closeBtn = screen
			.getAllByRole("button", { name: /close/i })
			.find(
				(btn) =>
					!btn
						.getAttribute("aria-label")
						?.toLowerCase()
						.includes("close dialog"),
			);
		expect(closeBtn).toBeDefined();
		await user.click(closeBtn!);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
