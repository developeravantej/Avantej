import { formatPrice } from "@/lib/money";
import type { DashboardKpisResult } from "@avantej-core/services";

/**
 * "All"-scope money cards: one card per branch, each formatted in its OWN
 * currency. The backend `revenueByBranch` rows only emit MYR today, so we
 * default to "MYR" and NEVER sum across branches (mixing currencies is invalid).
 */
export function PerCountryMoneyCards({
	kpis,
}: {
	kpis: DashboardKpisResult | undefined;
}) {
	const branches = kpis?.revenueByBranch ?? [];
	return (
		<div
			data-testid="per-country-money-cards"
			className="grid w-full grid-cols-1 gap-px overflow-hidden rounded-2xl border border-[#e5e5e5] bg-[#e5e5e5] sm:grid-cols-2"
		>
			{branches.map((b) => {
				// Forward-compatible: each card owns its currency, defaulting to MYR.
				const currency = (b as { currency?: string }).currency ?? "MYR";
				return (
					<div key={b.branchId} className="bg-white p-5">
						<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{b.branchName ?? "Unnamed"}
						</div>
						<div className="mt-1 font-mono text-2xl font-extrabold tabular-nums">
							{formatPrice(b.totalRevenue, currency)}
						</div>
						<div className="mt-1 text-xs text-muted-foreground">
							{b.orderCount} orders
						</div>
					</div>
				);
			})}
			{branches.length === 0 && (
				<div className="bg-white p-5 text-xs italic text-muted-foreground">
					No branch revenue yet for this period.
				</div>
			)}
		</div>
	);
}
