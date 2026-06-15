/**
 * Revenue KPI row (Plan F.2 — Agent V).
 *
 * 4 BigNumberCards: MRR, ARR, Active Subs, Cancelled (last 30d).
 */

import { BigNumberCard } from "@/components/platform-admin/big-number-card";

function fmtDollars(cents: number, available: boolean): string {
	if (!available) return "—";
	return `$${(cents / 100).toLocaleString(undefined, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	})}`;
}

export type RevenueKpiRowProps = {
	mrr: { cents: number; estimateAvailable: boolean };
	arr: { cents: number; estimateAvailable: boolean };
	activeSubsCount: number;
	trialingSubsCount: number;
	cancelledLast30d: number;
	churnRatePct: number;
};

export function RevenueKpiRow({
	mrr,
	arr,
	activeSubsCount,
	trialingSubsCount,
	cancelledLast30d,
	churnRatePct,
}: RevenueKpiRowProps) {
	return (
		<div
			className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
			data-testid="revenue-kpis"
		>
			<BigNumberCard
				title="MRR (estimate)"
				value={fmtDollars(mrr.cents, mrr.estimateAvailable)}
				subLabel={
					mrr.estimateAvailable ? (
						<span>Sum of active + trialing tier prices</span>
					) : (
						<span>Tier pricing not yet wired</span>
					)
				}
				testId="kpi-mrr"
			/>
			<BigNumberCard
				title="ARR (estimate)"
				value={fmtDollars(arr.cents, arr.estimateAvailable)}
				subLabel={<span>MRR × 12 estimate</span>}
				testId="kpi-arr"
			/>
			<BigNumberCard
				title="Active subscriptions"
				value={activeSubsCount}
				subLabel={<span>{trialingSubsCount} on trial</span>}
				testId="kpi-active-subs"
			/>
			<BigNumberCard
				title="Cancelled (30d)"
				value={cancelledLast30d}
				subLabel={<span>Churn rate {churnRatePct.toFixed(2)}%</span>}
				band={cancelledLast30d > 0 ? "red" : "neutral"}
				testId="kpi-cancelled-30d"
			/>
		</div>
	);
}
