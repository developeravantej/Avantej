import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";
import { SalesStatusBadge } from "./SalesStatusBadge";

export function StatusHistoryCard({
	organizationId,
	salesOrderId,
}: {
	organizationId: string;
	salesOrderId: string;
}) {
	const { data, isLoading } = useQuery({
		...orpc.salesOrders.statusHistory.queryOptions({
			input: { organizationId, salesOrderId },
		}),
	});

	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-base font-bold text-[#0a0a0a]">Status History</h2>
			</div>

			{isLoading ? (
				<div className="space-y-3">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-14 w-full rounded bg-[#e5e5e5] animate-pulse"
						/>
					))}
				</div>
			) : !data?.rows.length ? (
				<p className="text-sm text-[#737373]">No history available.</p>
			) : (
				<ol className="relative ml-3 space-y-4 border-l border-[#e5e5e5]">
					{data.rows.map((entry) => (
						<li key={entry.id} className="ml-4">
							<div className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#737373]" />
							<div className="flex flex-wrap items-center gap-2">
								{entry.fromStatus !== null ? (
									<span className="text-sm text-[#737373]">
										<SalesStatusBadge status={entry.fromStatus} />
										{" → "}
									</span>
								) : (
									<span className="text-sm italic text-[#737373]">
										Initial state →{" "}
									</span>
								)}
								<SalesStatusBadge status={entry.toStatus} />
							</div>
							<p className="mt-0.5 font-mono tabular-nums text-[10px] text-[#737373]">
								{entry.changedByName} &middot;{" "}
								{new Date(entry.changedAt).toLocaleString()}
							</p>
							{entry.reason && (
								<p className="mt-0.5 text-xs text-[#737373]">
									Reason: {entry.reason}
								</p>
							)}
							{entry.notes && (
								<p className="mt-0.5 text-xs text-[#737373]">
									Notes: {entry.notes}
								</p>
							)}
						</li>
					))}
				</ol>
			)}
		</div>
	);
}
