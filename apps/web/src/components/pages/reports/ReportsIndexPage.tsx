import { getRouteApi } from "@tanstack/react-router";
import type { ComponentType } from "react";

import { useUserContext } from "@/hooks/useUserContext";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";

import { ReportsPage } from "./ReportsPage";
import type { ReportTabProps, ReportTaxBasis } from "./tabs/report-tab-shared";
import { AppointmentsDetailedTab } from "./tabs/AppointmentsDetailedTab";
import { ArAgingTab } from "./tabs/ArAgingTab";
import { CoachProductivityTab } from "./tabs/CoachProductivityTab";
import { CollectionsTab } from "./tabs/CollectionsTab";
import { ExpiringCreditsTab } from "./tabs/ExpiringCreditsTab";
import { RedemptionsTab } from "./tabs/RedemptionsTab";
import { RefundsCancellationsTab } from "./tabs/RefundsCancellationsTab";
import { SalesMixTab } from "./tabs/SalesMixTab";
import { SalesReportTab } from "./tabs/SalesReportTab";
import { ServicesOwedTab } from "./tabs/ServicesOwedTab";

const route = getRouteApi("/_authenticated/dashboard/_layout/reports/view");

const TABS: Array<{
	id: string;
	label: string;
	Component: ComponentType<ReportTabProps>;
}> = [
	{ id: "sales", label: "Sales", Component: SalesReportTab },
	{ id: "collections", label: "Collections", Component: CollectionsTab },
	{ id: "outstanding", label: "Outstanding", Component: ArAgingTab },
	{ id: "expiring", label: "Expiring Credits", Component: ExpiringCreditsTab },
	{
		id: "coaches",
		label: "Coach Productivity",
		Component: CoachProductivityTab,
	},
	{
		id: "refunds",
		label: "Refunds & Cancellations",
		Component: RefundsCancellationsTab,
	},
	{ id: "mix", label: "Sales Mix", Component: SalesMixTab },
	{
		id: "appointments",
		label: "Appointments",
		Component: AppointmentsDetailedTab,
	},
	{ id: "redemptions", label: "Redemptions", Component: RedemptionsTab },
	{ id: "owed", label: "Services Owed", Component: ServicesOwedTab },
];

function defaultFrom(): string {
	const d = new Date();
	d.setDate(d.getDate() - 30);
	return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * WS2 Reports index — pill-tab wrapper around the original performance
 * overview (ReportsPage) plus the ten operational row-level reports.
 * Tab + filters live in the URL (tenant pill-tab convention).
 */
export function ReportsIndexPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { tab, from, to, taxBasis } = route.useSearch();
	const navigate = route.useNavigate();

	const activeTab = TABS.find((t) => t.id === tab);
	const fromDay = from || defaultFrom();
	const toDay = to || defaultTo();

	function patchSearch(updates: Record<string, string>) {
		navigate({ search: (prev) => ({ ...prev, ...updates }) });
	}

	if (!organizationId) {
		return (
			<div className="space-y-4" style={{ color: "#0a0a0a" }}>
				<h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>
				<p style={{ color: "#737373" }}>No organisation selected.</p>
			</div>
		);
	}

	const tabProps: ReportTabProps = {
		organizationId,
		from: `${fromDay}T00:00:00.000Z`,
		to: `${toDay}T23:59:59.999Z`,
		taxBasis: taxBasis as ReportTaxBasis,
		canExport: hasPermission("reports:export"),
	};

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3]">
			{/* ── Pill tab bar ── */}
			<div
				className="sticky top-0 z-10 border-b px-7 pt-5 pb-0"
				style={{ background: "#f3f3f3", borderColor: "#e5e5e5" }}
			>
				<div className="flex flex-wrap items-end gap-1 overflow-x-auto">
					{[{ id: "overview", label: "Overview" }, ...TABS].map((t) => {
						const active =
							t.id === "overview" ? !activeTab : activeTab?.id === t.id;
						return (
							<button
								key={t.id}
								type="button"
								onClick={() => patchSearch({ tab: t.id })}
								className="whitespace-nowrap rounded-t-xl px-3.5 py-2 text-xs font-semibold transition"
								style={
									active
										? {
												background: "#fff",
												color: "#0a0a0a",
												border: "1px solid #e5e5e5",
												borderBottom: "1px solid #fff",
												marginBottom: "-1px",
											}
										: { color: "#737373" }
								}
							>
								{t.label}
							</button>
						);
					})}
				</div>
			</div>

			{!activeTab ? (
				// Overview keeps its own -m-6 chrome; re-wrap to cancel ours.
				<div className="m-6">
					<ReportsPage />
				</div>
			) : (
				<div className="space-y-4 px-7 py-6" style={{ color: "#0a0a0a" }}>
					{/* ── Shared report filter bar ── */}
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-[18px] font-extrabold tracking-tight">
							{activeTab.label}
						</h1>
						<div className="ml-auto flex flex-wrap items-center gap-2">
							<ScopeSwitcher className="w-56" />
							<input
								type="date"
								className="h-8 w-36 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none"
								value={fromDay}
								onChange={(e) => patchSearch({ from: e.target.value })}
							/>
							<span className="text-xs text-[#737373]">→</span>
							<input
								type="date"
								className="h-8 w-36 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none"
								value={toDay}
								onChange={(e) => patchSearch({ to: e.target.value })}
							/>
							{/* Tax basis toggle */}
							<div
								className="flex items-center gap-0.5 rounded-xl border p-1"
								style={{ borderColor: "#e5e5e5", background: "#fff" }}
							>
								{(
									[
										["tax_inclusive", "Incl. tax"],
										["pre_tax", "Pre-tax"],
									] as const
								).map(([value, label]) => (
									<button
										key={value}
										type="button"
										onClick={() => patchSearch({ taxBasis: value })}
										className="rounded-lg px-2.5 py-1 text-xs font-semibold transition"
										style={
											taxBasis === value
												? { background: "#0a0a0a", color: "#fff" }
												: { color: "#737373" }
										}
									>
										{label}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Reset per-tab state (pagination) when filters change */}
					<activeTab.Component
						key={`${activeTab.id}-${fromDay}-${toDay}-${taxBasis}`}
						{...tabProps}
					/>
				</div>
			)}
		</div>
	);
}
