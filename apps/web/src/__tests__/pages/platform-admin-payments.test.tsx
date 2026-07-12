import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient, mockOrpc } from "../helpers/mock-client";

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

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stub the heavy tab bodies — this file tests the page shell wiring only.
vi.mock("@/components/pages/platform-admin-payments/OverviewTab", () => ({
	OverviewTab: ({
		data,
		isLoading,
	}: {
		data?: { applicationFeesThisMonth: number };
		isLoading: boolean;
	}) => (
		<div data-testid="overview-tab">
			{isLoading
				? "loading"
				: data
					? `fees:${data.applicationFeesThisMonth}`
					: "empty"}
		</div>
	),
}));
vi.mock("@/components/pages/platform-admin-payments/DriftTab", () => ({
	DriftTab: () => <div data-testid="drift-tab" />,
}));
vi.mock("@/components/pages/platform-admin-payments/DisputesTab", () => ({
	DisputesTab: () => <div data-testid="disputes-tab" />,
}));
vi.mock("@/components/pages/platform-admin-payments/StuckTab", () => ({
	StuckTab: () => <div data-testid="stuck-tab" />,
}));

import { toast } from "sonner";
import { PlatformAdminPaymentsPage } from "@/components/pages/platform-admin-payments/PlatformAdminPaymentsPage";

const overviewData = {
	applicationFeesThisMonth: 12345,
	saasRevenueThisMonth: 99900,
	drift: { critical: 2, warn: 1, info: 0 },
	openDisputes: 3,
	stuckOnboardings: 1,
	lastReconciliation: null,
};

describe("PlatformAdminPaymentsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.platformAdminPayments.overview.mockResolvedValue(overviewData);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("wires the overview query into the Overview tab and count badges", async () => {
		renderWithProviders(<PlatformAdminPaymentsPage />);
		await waitFor(() => {
			expect(screen.getByTestId("overview-tab")).toHaveTextContent(
				"fees:12345",
			);
		});
		expect(mockClient.platformAdminPayments.overview).toHaveBeenCalledWith({});
		// Drift trigger shows the critical count; Disputes shows open count
		expect(screen.getByRole("tab", { name: /drift/i })).toHaveTextContent("2");
		expect(screen.getByRole("tab", { name: /disputes/i })).toHaveTextContent(
			"3",
		);
		expect(
			screen.getByRole("tab", { name: /stuck onboardings/i }),
		).toHaveTextContent("1");
	});

	it("Run reconciliation fires runReconciliationNow and toasts the drift summary", async () => {
		mockClient.platformAdminPayments.runReconciliationNow.mockResolvedValue({
			runId: "run-1",
			acctsScanned: 2,
			resourcesExamined: 10,
			driftFound: 4,
			criticalCount: 1,
			warnCount: 0,
			infoCount: 3,
			durationMs: 100,
		});
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminPaymentsPage />);
		await user.click(
			screen.getByRole("button", { name: /run reconciliation/i }),
		);
		await waitFor(() => {
			expect(
				mockClient.platformAdminPayments.runReconciliationNow,
			).toHaveBeenCalledWith({});
		});
		await waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith(
				expect.stringContaining("4 drift rows (1 critical)"),
			);
		});
	});

	it("Run backfill fires runWebhookBackfillNow and toasts the replay summary", async () => {
		mockClient.platformAdminPayments.runWebhookBackfillNow.mockResolvedValue({
			acctsScanned: 2,
			eventsExamined: 20,
			replayed: 5,
			alreadyProcessed: 15,
			errors: 0,
		});
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminPaymentsPage />);
		await user.click(screen.getByRole("button", { name: /run backfill/i }));
		await waitFor(() => {
			expect(
				mockClient.platformAdminPayments.runWebhookBackfillNow,
			).toHaveBeenCalledWith({});
		});
		await waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith(
				expect.stringContaining("5 replayed, 15 already processed"),
			);
		});
	});

	it("failed reconciliation surfaces a toast.error, not a success", async () => {
		mockClient.platformAdminPayments.runReconciliationNow.mockRejectedValue(
			new Error("stripe unavailable"),
		);
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminPaymentsPage />);
		await user.click(
			screen.getByRole("button", { name: /run reconciliation/i }),
		);
		await waitFor(() => {
			expect(toast.error).toHaveBeenCalledWith("stripe unavailable");
		});
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("both trigger buttons are disabled while their mutation is in flight", async () => {
		let resolveRecon!: (v: unknown) => void;
		mockClient.platformAdminPayments.runReconciliationNow.mockImplementation(
			() =>
				new Promise((r) => {
					resolveRecon = r;
				}),
		);
		const user = userEvent.setup();
		renderWithProviders(<PlatformAdminPaymentsPage />);

		const reconBtn = screen.getByRole("button", {
			name: /run reconciliation/i,
		});
		await user.click(reconBtn);
		await waitFor(() => {
			expect(reconBtn).toBeDisabled();
		});

		resolveRecon({
			runId: "r",
			driftFound: 0,
			criticalCount: 0,
			warnCount: 0,
			infoCount: 0,
			acctsScanned: 0,
			resourcesExamined: 0,
			durationMs: 1,
		});
		await waitFor(() => {
			expect(reconBtn).toBeEnabled();
		});

		// Backfill: same guard
		let resolveBackfill!: (v: unknown) => void;
		mockClient.platformAdminPayments.runWebhookBackfillNow.mockImplementation(
			() =>
				new Promise((r) => {
					resolveBackfill = r;
				}),
		);
		const backfillBtn = screen.getByRole("button", { name: /run backfill/i });
		await user.click(backfillBtn);
		await waitFor(() => {
			expect(backfillBtn).toBeDisabled();
		});
		resolveBackfill({
			acctsScanned: 0,
			eventsExamined: 0,
			replayed: 0,
			alreadyProcessed: 0,
			errors: 0,
		});
		await waitFor(() => {
			expect(backfillBtn).toBeEnabled();
		});
	});

	it("polls the overview every 30 seconds (refetchInterval)", async () => {
		vi.useFakeTimers();
		renderWithProviders(<PlatformAdminPaymentsPage />);

		// Settle the initial fetch
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(mockClient.platformAdminPayments.overview).toHaveBeenCalledTimes(1);

		// 29s: still just the one call
		await act(async () => {
			await vi.advanceTimersByTimeAsync(29_000);
		});
		expect(mockClient.platformAdminPayments.overview).toHaveBeenCalledTimes(1);

		// Crossing the 30s boundary triggers the poll
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		expect(mockClient.platformAdminPayments.overview).toHaveBeenCalledTimes(2);

		// And it keeps polling — another full interval, another call
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(mockClient.platformAdminPayments.overview).toHaveBeenCalledTimes(3);
	});
});
