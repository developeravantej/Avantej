import { type PayoutListItem } from "@/features/payouts/api";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { formatRelativeDate } from "./helpers";
import { StatusBadge } from "./StatusBadge";
import { PayoutRowActions } from "./PayoutRowActions";

// ─── All Payouts table ────────────────────────────────────────────────────────

export function AllPayoutsTable({
	payouts,
	organizationId,
	canProcess,
}: {
	payouts: PayoutListItem[];
	organizationId: string;
	canProcess: boolean;
}) {
	if (payouts.length === 0) {
		return (
			<div className="flex min-h-64 flex-col items-center justify-center gap-1 py-16">
				<p className="text-sm font-medium text-[#0a0a0a]">No payouts yet</p>
				<p className="text-xs text-[#737373]">
					Use "Run Batch" to create payouts from approved commission splits.
				</p>
			</div>
		);
	}

	return (
		<div className="overflow-auto">
			<table className="w-full">
				<thead>
					<tr>
						{[
							"Date",
							"Recipient",
							"Gross",
							"Deductions",
							"Net",
							"Reference",
							"Status",
							"",
						].map((h) => (
							<th
								key={h || "__actions"}
								className={cn(
									"border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a8f91] whitespace-nowrap",
									(h === "Gross" || h === "Deductions" || h === "Net") &&
										"text-right",
									h === "" && "w-10",
								)}
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{payouts.map((row) => {
						const isReversal = row.amount < 0;
						return (
							<tr
								key={row.id}
								className={cn(
									"border-b border-[#f7f5ee] last:border-0",
									isReversal ? "bg-red-50/40" : "hover:bg-[#fcfaf6]",
								)}
							>
								<td className="px-[14px] py-[11px] align-middle">
									<span className="text-sm text-[#4a4f51]">
										{formatRelativeDate(row.paidAt ?? row.createdAt)}
									</span>
								</td>
								<td className="px-[14px] py-[11px] align-middle">
									<span className="text-sm font-medium text-[#0a0a0a]">
										{row.recipientName}
									</span>
								</td>
								<td className="px-[14px] py-[11px] text-right align-middle">
									<span className="font-mono text-sm tabular-nums text-[#4a4f51]">
										{formatPrice(Math.abs(row.grossAmountCents), "MYR")}
									</span>
								</td>
								<td className="px-[14px] py-[11px] text-right align-middle">
									<span className="font-mono text-sm tabular-nums text-[#4a4f51]">
										{row.deductionsCents > 0
											? `-${formatPrice(row.deductionsCents, "MYR")}`
											: "—"}
									</span>
								</td>
								<td className="px-[14px] py-[11px] text-right align-middle">
									<span
										className={cn(
											"font-mono text-sm font-semibold tabular-nums",
											isReversal ? "text-red-600" : "text-[#0a0a0a]",
										)}
									>
										{isReversal ? "-" : ""}
										{formatPrice(Math.abs(row.amount), "MYR")}
									</span>
									{isReversal && (
										<span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
											<span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
											Reversal
										</span>
									)}
								</td>
								<td className="max-w-[160px] px-[14px] py-[11px] align-middle">
									<span className="block truncate font-mono text-xs text-[#8a8f91]">
										{row.description ?? row.reference ?? "—"}
									</span>
								</td>
								<td className="px-[14px] py-[11px] align-middle">
									<StatusBadge status={row.status} />
								</td>
								<td className="px-[14px] py-[11px] align-middle">
									<PayoutRowActions
										payout={row}
										organizationId={organizationId}
										canProcess={canProcess}
									/>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
