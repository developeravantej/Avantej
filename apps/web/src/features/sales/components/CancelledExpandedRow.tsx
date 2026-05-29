import { formatPrice } from "@/lib/money";
import { formatCancellationTime, formatCategoryLabel } from "@/features/sales/sales-view.constants";
import type { CancelledSaleRow } from "@/features/sales/sales-view.types";
import { LineItemsTable } from "@/features/sales/components/LineItemsTable";
import { RefundStatusBadge } from "@/features/sales/components/SalesBadges";

export function CancelledExpandedRow({ row }: { row: CancelledSaleRow }) {
	const ts = formatCancellationTime(row.cancellationDate);
	return (
		<tr className="bg-[#fafafa]">
			<td colSpan={9} className="px-10 py-5 border-t border-[#e5e5e5]">
				<div className="grid grid-cols-3 gap-6">
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Cancellation Context
						</p>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-[#737373]">Cancelled at</span>
								<span className="text-[#0a0a0a]">{ts ? `${ts.date}, ${ts.time}` : "—"}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#737373]">By staff</span>
								<span className="text-[#0a0a0a]">{row.cancelledBy ?? "—"}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#737373]">Category</span>
								<span className="text-[#0a0a0a]">{formatCategoryLabel(row.cancellationReasonCategory)}</span>
							</div>
							{row.cancellationReason && (
								<div className="flex justify-between gap-4">
									<span className="text-[#737373] shrink-0">Reason</span>
									<span className="text-right text-[#0a0a0a]">{row.cancellationReason}</span>
								</div>
							)}
							<div className="flex justify-between">
								<span className="text-[#737373]">Order</span>
								<span className="font-mono tabular-nums text-xs text-[#0a0a0a]">{row.salesOrderId ?? "—"}</span>
							</div>
						</div>
					</div>
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Original Sale Items
						</p>
						<LineItemsTable items={row.lineItems} />
					</div>
					<div>
						<p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Refund Details
						</p>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-[#737373]">Refunded</span>
								<span className="font-mono tabular-nums text-[#0a0a0a]">
									{formatPrice(row.cancelledAmount ?? 0, "MYR")}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-[#737373]">Status</span>
								<RefundStatusBadge row={row} />
							</div>
						</div>
					</div>
				</div>
			</td>
		</tr>
	);
}
