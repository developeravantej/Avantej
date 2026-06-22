import { useState } from "react";

import { RefundsTab } from "@/components/refunds/refunds-tab";
import { CancelledSalesTab } from "@/features/sales/components/CancelledSalesTab";
import { useUserContext } from "@/hooks/useUserContext";
import { cn } from "@/lib/utils";

/**
 * Launchpad panel for the "Refunds & Cancellations" card. Thin wrapper that
 * toggles between the two route-canonical surfaces rather than re-implementing
 * them:
 *  - RefundsTab — the refund review queue (approve / partial-approve / reject /
 *    process, bulk approve, audit trail, export). Gates its own actions on
 *    refund_management:approve / :process internally; the card itself is gated
 *    on refund_management:read.
 *  - CancelledSalesTab — the cancelled-sales log (fraud flagging, repeat-offender
 *    highlighting, date-range filter, CSV export). Gated here on sales:read.
 *
 * Reusing these keeps the launchpad in sync with the canonical
 * /dashboard/sales/view?tab=refunds surface instead of maintaining a second,
 * drift-prone parallel UI.
 */
export function RefundsPanel({ organizationId }: { organizationId: string }) {
	const { hasPermission } = useUserContext();
	const canReadSales = hasPermission("sales:read");

	const [view, setView] = useState<"refunds" | "cancellations">("refunds");
	// Cancelled-sales date-range filter — owned here, mirroring the Sales route.
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");

	return (
		<div className="flex h-full min-h-[460px] flex-col">
			{/* Header + view toggle */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">
						Refunds &amp; Cancellations
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Review refund requests and look up cancelled sales.
					</p>
				</div>
				<div className="inline-flex rounded-lg border border-[#e8ebf0] bg-slate-50 p-0.5">
					{(["refunds", "cancellations"] as const).map((v) => (
						<button
							key={v}
							type="button"
							onClick={() => setView(v)}
							className={cn(
								"rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition",
								view === v
									? "bg-white shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{v}
						</button>
					))}
				</div>
			</div>

			<div className="mt-4 flex-1 overflow-auto">
				{view === "refunds" ? (
					<RefundsTab organizationId={organizationId} />
				) : !canReadSales ? (
					<div className="rounded-xl border border-[#e8ebf0] p-6 text-sm text-muted-foreground">
						You don&apos;t have permission to view cancelled sales.
					</div>
				) : (
					<CancelledSalesTab
						organizationId={organizationId}
						from={from}
						to={to}
						onFromChange={setFrom}
						onToChange={setTo}
						onClearDates={() => {
							setFrom("");
							setTo("");
						}}
					/>
				)}
			</div>
		</div>
	);
}
