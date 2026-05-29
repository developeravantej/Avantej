import { formatPriceShort, formatToday, getPriority } from "../approvals.helpers";
import type { PendingRow } from "../approvals.types";

export function HeroStats({
	list,
	orgName,
	filteredCount,
	onApproveAll,
	onExport,
}: {
	list: PendingRow[];
	orgName: string;
	filteredCount: number;
	onApproveAll: () => void;
	onExport: () => void;
}) {
	const totalPending = list.length;
	const pendingValueCents = list.reduce((s, r) => s + (r.totalPrice ?? 0), 0);
	const highCount = list.filter((r) => getPriority(r) === "high").length;

	// Oldest pending — computable from real data
	const oldestMs =
		list.length > 0
			? Math.max(...list.map((r) => Date.now() - new Date(r.createdAt).getTime()))
			: 0;
	const oldestHrs = Math.floor(oldestMs / (1000 * 60 * 60));
	const oldestDays = Math.floor(oldestHrs / 24);
	const oldestRemHrs = oldestHrs - oldestDays * 24;
	const oldestLabel =
		list.length === 0 ? "—" : `${oldestDays}d ${oldestRemHrs}h`;
	const isPastSLA = oldestDays >= 3;

	return (
		<section className="relative overflow-hidden rounded-3xl border border-[#e5e5e5] bg-gradient-to-br from-white to-[#fafafa] p-7">
			{/* Radial glow */}
			<div className="pointer-events-none absolute -top-32 right-0 size-[380px] rounded-full bg-[radial-gradient(circle,_rgba(214,205,177,0.35)_0%,_transparent_70%)]" />

			<div className="relative z-10">
				{/* Live status row */}
				<div className="mb-3 flex items-center gap-3">
					<span className="relative flex size-1.5">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
						<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
					</span>
					<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{orgName} · Approvals Queue · Live
					</span>
					<span className="text-[#a3a3a3]">·</span>
					<span className="text-xs text-muted-foreground">{formatToday()}</span>
				</div>

				<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
					Pending package approvals
				</div>
				<div className="mt-1 flex items-baseline gap-3">
					<span className="font-mono text-6xl font-extrabold leading-none tracking-tight tabular-nums text-[#0a0a0a]">
						{totalPending}
					</span>
				</div>

				<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
					<span>
						<span className="font-mono font-semibold tabular-nums text-[#0a0a0a]">
							{highCount}
						</span>{" "}
						high-priority
					</span>
					<span className="text-[#a3a3a3]">·</span>
					<span>
						<span className="font-mono font-semibold tabular-nums text-[#0a0a0a]">
							{formatPriceShort(pendingValueCents)}
						</span>{" "}
						in pending value
					</span>
					{list.length > 0 && (
						<>
							<span className="text-[#a3a3a3]">·</span>
							<span>
								oldest{" "}
								<span
									className={`font-mono font-semibold tabular-nums ${
										isPastSLA ? "text-rose-600" : "text-[#0a0a0a]"
									}`}
								>
									{oldestLabel}
								</span>
								{isPastSLA && (
									<span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
										past SLA
									</span>
								)}
							</span>
						</>
					)}
				</div>

				<div className="mt-7 flex items-center gap-2">
					<button
						type="button"
						onClick={onApproveAll}
						className="flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626]"
					>
						Approve all visible ({filteredCount})
					</button>
					<button
						type="button"
						onClick={onExport}
						disabled={list.length === 0}
						className="flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-medium transition-colors hover:bg-[#f3f3f3] disabled:opacity-40"
					>
						Export queue
					</button>
				</div>
			</div>
		</section>
	);
}
