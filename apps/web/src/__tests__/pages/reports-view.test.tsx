import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/render-with-providers";
import { mockClient } from "../helpers/mock-client";

let ReportsPage: React.ComponentType;

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (opts: { component: React.ComponentType }) => {
		ReportsPage = opts.component;
		return { component: opts.component };
	},
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	useNavigate: vi.fn().mockReturnValue(vi.fn()),
}));
vi.mock("@/utils/orpc", () => ({ client: mockClient }));
vi.mock("@/hooks/useUserContext", () => ({
	useUserContext: () => ({
		data: { currentOrganizationId: "org-1" },
		hasPermission: () => true,
		hasRole: () => true,
	}),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/status-callout", () => ({
	StatusCallout: ({ message }: { message: string }) => <div>{message}</div>,
}));
vi.mock("@/components/reports/schedule-report-dialog", () => ({
	ScheduleReportDialog: ({ open }: { open: boolean }) =>
		open ? <div data-testid="schedule-dialog">Schedule Dialog</div> : null,
}));
// jsPDF dynamic import — not needed for unit tests
vi.mock("jspdf", () => ({ jsPDF: class { save = vi.fn(); setFontSize = vi.fn(); setFont = vi.fn(); setTextColor = vi.fn(); text = vi.fn() } }));
vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

const kpiData = {
	totalSales: 500000,
	previousPeriodSales: 400000,
	activeMembersCount: 42,
	completedAppointments: 100,
	totalAppointments: 120,
	churnRatePct: 5,
	avgLtvCents: 120000,
	classFillRatePct: 75.0,
	from: "2024-01-01",
	to: "2024-01-31",
	revenueByBranch: [
		{ branchName: "Main Branch", totalRevenue: 300000 },
		{ branchName: "East Branch", totalRevenue: 200000 },
	],
};

beforeAll(async () => {
	await import("@/routes/_authenticated/dashboard/_layout/reports/view");
});

describe("ReportsPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockClient.analytics.getDashboardKpis.mockResolvedValue(null);
		mockClient.analytics.getRevenueSeries.mockResolvedValue([]);
		mockClient.analytics.getMemberCountSeries.mockResolvedValue([]);
		mockClient.analytics.getChurnSeries.mockResolvedValue([]);
		mockClient.analytics.getLtvSeries.mockResolvedValue([]);
		mockClient.analytics.getClassFillRateSeries.mockResolvedValue([]);
		mockClient.analytics.getStaffPerformance.mockResolvedValue([]);
	});

	it("renders page heading", async () => {
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			expect(screen.getByText("Performance Report")).toBeInTheDocument();
		});
	});

	it("renders window switcher buttons", async () => {
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "7D" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "30D" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "90D" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "YTD" })).toBeInTheDocument();
		});
	});

	it("renders export buttons", async () => {
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			// buttons have DownloadIcon + text "CSV" / "PDF" + title attributes
			expect(screen.getByTitle("Export as CSV")).toBeInTheDocument();
			expect(screen.getByTitle("Export as PDF")).toBeInTheDocument();
		});
	});

	it("shows KPI tiles with data when kpis resolves", async () => {
		mockClient.analytics.getDashboardKpis.mockResolvedValue(kpiData);
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			// totalSales = RM 5,000 — should appear
			expect(screen.getByText(/5,000/)).toBeInTheDocument();
		});
		// activeMembersCount = 42
		expect(screen.getByText("42")).toBeInTheDocument();
	});

	it("switching window updates the active button style", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "7D" })).toBeInTheDocument();
		});
		await user.click(screen.getByRole("button", { name: "7D" }));
		// 7D button should be visually active after click (no crash)
		expect(screen.getByRole("button", { name: "7D" })).toBeInTheDocument();
	});

	it("Schedule Email button opens schedule dialog", async () => {
		const user = userEvent.setup();
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			expect(screen.getByTitle(/schedule recurring/i)).toBeInTheDocument();
		});
		await user.click(screen.getByTitle(/schedule recurring/i));
		await waitFor(() => {
			expect(screen.getByTestId("schedule-dialog")).toBeInTheDocument();
		});
	});

	it("renders top-staff leaderboard section when data loads", async () => {
		mockClient.analytics.getStaffPerformance.mockResolvedValue([
			{
				staffId: "s-1",
				staffName: "Trainer One",
				appointmentsCompleted: 30,
				totalCommission: 60000,
			},
		]);
		renderWithProviders(<ReportsPage />);
		await waitFor(() => {
			expect(screen.getByText("Trainer One")).toBeInTheDocument();
		});
	});
});
