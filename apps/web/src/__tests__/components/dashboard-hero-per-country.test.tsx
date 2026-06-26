import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DashboardKpisResult } from "@avantej-core/services";
import { TooltipProvider } from "@/components/ui/tooltip";

// <Link> ("New Sale" CTA) needs router context jsdom lacks — stub to children.
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { HeroSection } from "@/components/pages/dashboard/HeroSection";

function makeKpis(): DashboardKpisResult {
	return {
		period: "this_month",
		from: new Date("2026-06-01T00:00:00Z"),
		to: new Date("2026-06-30T23:59:59Z"),
		totalSales: 500000, // RM 5,000.00 — the single combined tile
		salesOrderCount: 42,
		previousPeriodSales: 0,
		previousPeriodOrderCount: 0,
		totalAppointments: 0,
		completedAppointments: 0,
		activeMembersCount: 12,
		revenueByBranch: [
			{
				branchId: "b-kl",
				branchName: "KL",
				totalRevenue: 300000,
				orderCount: 25,
			},
			{
				branchId: "b-jb",
				branchName: "JB",
				totalRevenue: 200000,
				orderCount: 17,
			},
		],
		churnRatePct: 0,
		avgLtvCents: 0,
		classFillRatePct: 0,
	};
}

function renderHero(isAllScope: boolean) {
	const kpis = makeKpis();
	return render(
		<TooltipProvider>
			<HeroSection
				orgName="Avantej Gym"
				period="this_month"
				revenueDelta={null}
				kpis={kpis}
				kpisLoading={false}
				kpisError={false}
				onRetryKpis={() => {}}
				todayKpis={undefined}
				todayLoading={false}
				todayError={false}
				onRetryToday={() => {}}
				largestToday={null}
				largestLoading={false}
				largestError={false}
				onRetryLargest={() => {}}
				newTodayCount={undefined}
				isAllScope={isAllScope}
			/>
		</TooltipProvider>,
	);
}

describe("HeroSection — per-country money cards", () => {
	test("single-node scope renders the combined MYR revenue tile (no per-country cards)", () => {
		renderHero(false);
		expect(screen.getByText("RM 5,000.00")).toBeInTheDocument();
		expect(screen.queryByTestId("per-country-money-cards")).toBeNull();
	});

	test("All scope renders one money card per branch (each own currency) instead of the single tile", () => {
		renderHero(true);
		const cards = screen.getByTestId("per-country-money-cards");
		expect(cards).toBeInTheDocument();
		// each branch card shows its own name + its own formatted revenue
		expect(screen.getByText("KL")).toBeInTheDocument();
		expect(screen.getByText("JB")).toBeInTheDocument();
		expect(screen.getByText("RM 3,000.00")).toBeInTheDocument();
		expect(screen.getByText("RM 2,000.00")).toBeInTheDocument();
		// never sum currencies: the combined RM 5,000.00 tile is NOT rendered in All scope
		expect(screen.queryByText("RM 5,000.00")).toBeNull();
	});
});
