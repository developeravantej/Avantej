import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import type { KpiSummary } from "@/features/sales/sales-view.types";
import { PeriodSelector } from "@/features/sales/components/PeriodSelector";

export function KpiStrip({
	kpiSummary,
	kpiLoading,
	kpiPeriod,
	onPeriodChange,
}: {
	kpiSummary: KpiSummary | undefined;
	kpiLoading: boolean;
	kpiPeriod: "today" | "week" | "month";
	onPeriodChange: (v: "today" | "week" | "month") => void;
}) {
	const netCollectedCents =
		kpiSummary != null
			? kpiSummary.totalSalesCents - kpiSummary.totalRefundedCents
			: null;

	const tiles = [
		{
			label:
				kpiPeriod === "today"
					? "Today's Revenue"
					: kpiPeriod === "week"
						? "Week's Revenue"
						: "Month's Revenue",
			value: kpiSummary ? formatPrice(kpiSummary.totalSalesCents, "MYR") : null,
			sub: kpiSummary ? `${kpiSummary.salesCount} transactions` : null,
			accent: false as const,
			testId: "sales-kpi-revenue",
		},
		{
			label: "Outstanding",
			value: kpiSummary
				? formatPrice(kpiSummary.outstandingCents, "MYR")
				: null,
			sub:
				kpiSummary && kpiSummary.outstandingCents > 0
					? "partial / overdue"
					: "all clear",
			accent:
				kpiSummary != null && kpiSummary.outstandingCents > 0
					? ("red" as const)
					: (false as const),
			testId: "sales-kpi-outstanding",
		},
		{
			label: "Refunded",
			value: kpiSummary
				? formatPrice(kpiSummary.totalRefundedCents, "MYR")
				: null,
			sub: null,
			accent: false as const,
			testId: "sales-kpi-refunded",
		},
		{
			label: "Net Collected",
			value:
				netCollectedCents != null
					? formatPrice(netCollectedCents, "MYR")
					: null,
			sub: "After refunds",
			accent: false as const,
			testId: "sales-kpi-confirmed",
		},
	];

	return (
		<div
			className="shrink-0 border-b border-[#e5e5e5] bg-white px-6 py-4"
			data-testid="sales-kpi-strip"
		>
			<div className="mb-3 flex items-center justify-between">
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
					Overview
				</p>
				<PeriodSelector value={kpiPeriod} onChange={onPeriodChange} />
			</div>
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
				{tiles.map((tile) => (
					<div
						key={tile.label}
						data-testid={tile.testId}
						className={cn(
							"rounded-2xl border border-[#e5e5e5] bg-white p-4",
							tile.accent === "red" && "border-rose-200 bg-rose-50",
						)}
					>
						{kpiLoading ? (
							<div>
								<div className="h-3 w-24 animate-pulse rounded bg-[#e5e5e5]" />
								<div className="mt-3 h-6 w-28 animate-pulse rounded bg-[#e5e5e5]" />
								<div className="mt-2 h-3 w-20 animate-pulse rounded bg-[#e5e5e5]" />
							</div>
						) : (
							<>
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
									{tile.label}
								</p>
								<p
									className={cn(
										"mt-1 font-mono tabular-nums text-2xl font-bold text-[#0a0a0a]",
										tile.accent === "red" && "text-rose-600",
									)}
								>
									{tile.value ?? "—"}
								</p>
								{tile.sub && (
									<p className="mt-1 text-xs text-[#737373]">{tile.sub}</p>
								)}
							</>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
