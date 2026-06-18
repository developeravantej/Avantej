import { useMemo, useState } from "react";
import { Play, RefreshCw, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
	type PayoutListItem,
	type ProcessForRecipientParams,
	type RecipientSummaryResult,
	useProcessForRecipient,
	useRecipientSummary,
} from "@/features/payouts/api";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
	firstOfMonthIso,
	formatAbsoluteDate,
	formatRelativeDate,
	getInitials,
	roleTypeLabel,
	todayEndIso,
} from "./helpers";
import { StatusBadge } from "./StatusBadge";

// ─── Per Recipient panel ──────────────────────────────────────────────────────

export function PerRecipientPanel({
	payouts,
	organizationId,
	canRunBatch,
	recipientId,
	onSelectRecipient,
}: {
	payouts: PayoutListItem[];
	organizationId: string;
	canRunBatch: boolean;
	recipientId: string | undefined;
	onSelectRecipient: (id: string) => void;
}) {
	const [search, setSearch] = useState("");
	const [recipientPaymentMethod, setRecipientPaymentMethod] =
		useState<ProcessForRecipientParams["paymentMethod"]>("bank_transfer");

	const recipients = useMemo(() => {
		const map = new Map<
			string,
			{ name: string; pendingCents: number; pendingCount: number }
		>();
		for (const p of payouts) {
			const existing = map.get(p.recipientId);
			if (!existing) {
				map.set(p.recipientId, {
					name: p.recipientName,
					// F-PAY-4: signed sum so reversals reduce the total
					pendingCents: p.status === "pending" ? p.amount : 0,
					pendingCount: p.status === "pending" ? 1 : 0,
				});
			} else if (p.status === "pending") {
				existing.pendingCents += p.amount; // F-PAY-4: signed sum so reversals reduce the total
				existing.pendingCount += 1;
			}
		}
		return [...map.entries()].map(([id, data]) => ({ id, ...data }));
	}, [payouts]);

	const filteredRecipients = useMemo(() => {
		if (!search.trim()) return recipients;
		const lower = search.toLowerCase();
		return recipients.filter((r) => r.name.toLowerCase().includes(lower));
	}, [recipients, search]);

	const selectedRecipient =
		recipients.find((r) => r.id === recipientId) ?? null;
	const { data: summary, isLoading: summaryLoading } = useRecipientSummary(
		organizationId,
		recipientId ?? null,
	);
	const processForRecipient = useProcessForRecipient(organizationId);

	const recipientPayouts = useMemo(() => {
		if (!recipientId) return [];
		return payouts.filter((p) => p.recipientId === recipientId);
	}, [payouts, recipientId]);

	const pendingForRecipient = useMemo(
		// F-PAY-4: signed sum so reversals reduce the total
		() =>
			recipientPayouts
				.filter((p) => p.status === "pending")
				.reduce((s, p) => s + p.amount, 0),
		[recipientPayouts],
	);

	const typedSummary = summary as RecipientSummaryResult | undefined;

	// Phase 4: fetch liabilitySummary for the current month to get the
	// recipient's byRoleType breakdown. Uses the same date range as the
	// PayoutsTab KPI prefetch (firstOfMonth → todayEnd).
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	type AnyRecord = Record<string, any>;
	const { data: liabData } = useQuery({
		...orpc.commissionSplits.liabilitySummary.queryOptions({
			input: {
				organizationId,
				from: firstOfMonthIso(),
				to: todayEndIso(),
			},
		}),
		enabled: !!recipientId,
		staleTime: 30_000,
	});
	const recipientByRoleType: Record<string, number> = useMemo(() => {
		if (!recipientId || !liabData) return {};
		// Cast via unknown: byRoleType was added in Phase 4 but dist may not yet be rebuilt.
		const trainers = ((liabData as unknown as AnyRecord).trainers ??
			[]) as AnyRecord[];
		const match = trainers.find((t) => t.memberId === recipientId);
		const byRoleType = match?.byRoleType as Record<string, number> | undefined;
		return byRoleType ?? {};
	}, [liabData, recipientId]);
	const roleTypeEntries = Object.entries(recipientByRoleType).filter(
		([, v]) => v > 0,
	);

	return (
		<div className="flex min-h-[520px]">
			{/* Sidebar */}
			<div className="flex w-[240px] shrink-0 flex-col border-r border-[#e5e5e5]">
				<div className="border-b border-[#e5e5e5] px-4 py-3">
					<input
						type="text"
						placeholder="Search recipient…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full rounded-lg border border-[#e5e5e5] bg-[#f7f7f7] px-3 py-1.5 text-xs placeholder:text-[#8a8f91] focus:outline-none focus:ring-1 focus:ring-[#0a0a0a]"
					/>
				</div>
				<div className="flex-1 overflow-auto">
					{filteredRecipients.length === 0 ? (
						<div className="p-4 text-center text-xs text-[#737373]">
							No recipients
						</div>
					) : (
						<>
							<div className="px-4 pb-1 pt-3">
								<span className="text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">
									Recipients
								</span>
							</div>
							{filteredRecipients.map((r) => {
								const isActive = r.id === recipientId;
								return (
									<button
										key={r.id}
										type="button"
										onClick={() => onSelectRecipient(r.id)}
										className={cn(
											"w-full border-l-[3px] px-4 py-2.5 text-left transition-colors",
											isActive
												? "border-l-[#0a0a0a] bg-[#f7f5ee]"
												: "border-l-transparent hover:bg-[#fcfaf6]",
										)}
									>
										<div className="flex items-center gap-3">
											<div
												className={cn(
													"flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
													isActive ? "bg-[#0a0a0a]" : "bg-[#737373]",
												)}
											>
												{getInitials(r.name)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-xs font-semibold text-[#0a0a0a]">
													{r.name}
												</div>
												<div className="font-mono text-[11px] tabular-nums text-[#737373]">
													{r.pendingCents > 0
														? `${formatPrice(r.pendingCents, "MYR")} pending`
														: "No pending"}
												</div>
											</div>
											{r.pendingCount > 0 && (
												<span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold leading-tight text-amber-700">
													{r.pendingCount}
												</span>
											)}
										</div>
									</button>
								);
							})}
						</>
					)}
				</div>
			</div>

			{/* Ledger */}
			<div className="flex min-w-0 flex-1 flex-col">
				{selectedRecipient ? (
					<>
						{/* Recipient header */}
						<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-4">
							<div className="flex items-center gap-3">
								<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] text-sm font-bold text-white">
									{getInitials(selectedRecipient.name)}
								</div>
								<div>
									<div className="text-sm font-semibold text-[#0a0a0a]">
										{selectedRecipient.name}
									</div>
									<div className="text-[11px] text-[#737373]">
										Payout history and lifetime stats
									</div>
								</div>
							</div>
							{canRunBatch && (
								<div className="flex items-center gap-2">
									{/* CPR-10: payment method selector for per-recipient processing */}
									<Select
										value={recipientPaymentMethod}
										onValueChange={(v) =>
											setRecipientPaymentMethod(
												v as ProcessForRecipientParams["paymentMethod"],
											)
										}
									>
										<SelectTrigger className="h-[34px] w-[140px] text-[12px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="bank_transfer">
												Bank Transfer
											</SelectItem>
											<SelectItem value="cash">Cash</SelectItem>
											<SelectItem value="check">Cheque</SelectItem>
											<SelectItem value="other">Other / Adjustment</SelectItem>
										</SelectContent>
									</Select>
									<button
										type="button"
										className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-[14px] py-[8px] text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-40"
										onClick={() =>
											processForRecipient.mutate(
												{
													organizationId,
													recipientId: selectedRecipient.id,
													paymentMethod: recipientPaymentMethod,
												},
												{
													// CPR-11: surface actual server error message
													onError: (err) => {
														toast.error(
															err.message ?? "Failed to process payouts",
														);
													},
												},
											)
										}
										disabled={
											processForRecipient.isPending || pendingForRecipient === 0
										}
									>
										{processForRecipient.isPending ? (
											<RefreshCw className="h-3.5 w-3.5 animate-spin" />
										) : (
											<Play className="h-3.5 w-3.5" />
										)}
										Process Pending
										{pendingForRecipient > 0 && (
											<span className="font-mono tabular-nums">
												· {formatPrice(pendingForRecipient, "MYR")}
											</span>
										)}
									</button>
								</div>
							)}
						</div>

						{/* Recipient KPI mini-band */}
						<div className="grid grid-cols-4 border-b border-[#e5e5e5] bg-[#f9f9f9]">
							{[
								{
									label: "Lifetime Paid",
									value: summaryLoading
										? null
										: formatPrice(typedSummary?.lifetimePaidCents ?? 0, "MYR"),
									color: "",
								},
								{
									label: "Current Cycle",
									value: summaryLoading
										? null
										: formatPrice(pendingForRecipient, "MYR"),
									color: "text-amber-600",
									sub: `${recipientPayouts.filter((p) => p.status === "pending").length} pending`,
								},
								{
									label: "Last Payout",
									value: summaryLoading
										? null
										: typedSummary?.lastPayoutAt
											? formatRelativeDate(typedSummary.lastPayoutAt)
											: "—",
									color: "",
								},
								{
									label: "Avg per Cycle",
									value: summaryLoading
										? null
										: formatPrice(typedSummary?.avgPerCycleCents ?? 0, "MYR"),
									color: "",
								},
							].map((kpi) => (
								<div
									key={kpi.label}
									className="border-r border-[#e5e5e5] px-5 py-3 last:border-r-0"
								>
									<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
										{kpi.label}
									</div>
									{kpi.value === null ? (
										<div className="mt-1.5 h-5 w-20 animate-pulse rounded bg-[#e5e5e5]" />
									) : (
										<div
											className={cn(
												"mt-1 font-mono text-lg font-bold tabular-nums text-[#0a0a0a]",
												kpi.color,
											)}
										>
											{kpi.value}
										</div>
									)}
									{kpi.sub && (
										<div className="mt-0.5 text-[11px] text-[#737373]">
											{kpi.sub}
										</div>
									)}
								</div>
							))}
						</div>

						{/* Lower: breakdown + history */}
						<div className="flex flex-1 overflow-hidden">
							{/* Breakdown sidebar */}
							<div className="w-[300px] shrink-0 overflow-auto border-r border-[#e5e5e5] p-5">
								<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">
									Current Cycle Breakdown
								</div>
								<div className="mb-4 rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3.5">
									<div className="flex items-center justify-between border-b border-[#e5e5e5] py-2">
										<span className="text-xs text-[#737373]">
											Gross commissions
										</span>
										<span className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">
											{formatPrice(
												recipientPayouts
													.filter((p) => p.status === "pending")
													.reduce((s, p) => s + p.grossAmountCents, 0),
												"MYR",
											)}
										</span>
									</div>
									<div className="flex items-center justify-between border-b border-[#e5e5e5] py-2">
										<span className="text-xs text-[#737373]">
											Total deductions
										</span>
										<span className="font-mono text-sm tabular-nums text-red-600">
											{(() => {
												const d = recipientPayouts
													.filter((p) => p.status === "pending")
													.reduce((s, p) => s + p.deductionsCents, 0);
												return d > 0 ? `-${formatPrice(d, "MYR")}` : "—";
											})()}
										</span>
									</div>
									<div className="mt-1 flex items-center justify-between border-t border-[#e5e5e5] pt-3">
										<span className="text-sm font-semibold text-[#0a0a0a]">
											Net Payout
										</span>
										<span className="font-mono text-base font-bold tabular-nums text-[#0a0a0a]">
											{formatPrice(pendingForRecipient, "MYR")}
										</span>
									</div>
								</div>

								{/* Phase 4: role breakdown from liabilitySummary */}
								{roleTypeEntries.length > 0 && (
									<>
										<div className="mb-2 mt-3 text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">
											By Role (This Month)
										</div>
										<div className="mb-4 space-y-1.5">
											{roleTypeEntries.map(([role, cents]) => (
												<div
													key={role}
													className="flex items-center justify-between rounded-lg border border-[#e5e5e5] bg-[#f9f9f9] px-3 py-2"
												>
													<span className="text-xs text-[#4a4f51]">
														{roleTypeLabel(role)}
													</span>
													<span className="font-mono text-xs font-semibold tabular-nums text-[#0a0a0a]">
														{formatPrice(cents, "MYR")}
													</span>
												</div>
											))}
										</div>
									</>
								)}

								<div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">
									Pending Payouts
								</div>
								{recipientPayouts.filter((p) => p.status === "pending")
									.length === 0 ? (
									<p className="text-xs text-[#737373]">
										No pending payouts for this recipient.
									</p>
								) : (
									<div className="space-y-1.5">
										{recipientPayouts
											.filter((p) => p.status === "pending")
											.map((p) => (
												<div
													key={p.id}
													className="rounded-lg border border-[#e5e5e5] bg-white p-2.5"
												>
													<div className="flex items-start justify-between gap-2">
														<div className="min-w-0">
															<p className="truncate text-xs font-semibold text-[#0a0a0a]">
																{p.description ?? p.reference ?? "Payout"}
															</p>
															<p className="text-[11px] text-[#737373]">
																{formatRelativeDate(p.createdAt)}
															</p>
														</div>
														<span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-[#0a0a0a]">
															{formatPrice(Math.abs(p.amount), "MYR")}
														</span>
													</div>
												</div>
											))}
									</div>
								)}
							</div>

							{/* Payout history */}
							<div className="flex-1 overflow-auto">
								<div className="border-b border-[#e5e5e5] px-6 py-3">
									<span className="text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">
										Payout History
									</span>
								</div>
								{recipientPayouts.length === 0 ? (
									<div className="flex h-32 items-center justify-center">
										<p className="text-sm text-[#737373]">
											No payouts for this recipient yet
										</p>
									</div>
								) : (
									<table className="w-full">
										<thead>
											<tr>
												{["Date", "Gross", "Net", "Bank Ref", "Status"].map(
													(h) => (
														<th
															key={h}
															className={cn(
																"border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a8f91] whitespace-nowrap",
																(h === "Gross" || h === "Net") && "text-right",
															)}
														>
															{h}
														</th>
													),
												)}
											</tr>
										</thead>
										<tbody>
											{recipientPayouts.map((row) => (
												<tr
													key={row.id}
													className="border-b border-[#f7f5ee] last:border-0 hover:bg-[#fcfaf6]"
												>
													<td className="px-[14px] py-[11px] align-middle">
														<span className="text-sm text-[#4a4f51]">
															{row.paidAt
																? formatAbsoluteDate(row.paidAt)
																: formatRelativeDate(row.createdAt)}
														</span>
													</td>
													<td className="px-[14px] py-[11px] text-right align-middle">
														<span className="font-mono text-sm tabular-nums text-[#4a4f51]">
															{formatPrice(
																Math.abs(row.grossAmountCents),
																"MYR",
															)}
														</span>
													</td>
													<td className="px-[14px] py-[11px] text-right align-middle">
														<span className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">
															{formatPrice(Math.abs(row.amount), "MYR")}
														</span>
													</td>
													<td className="max-w-[140px] px-[14px] py-[11px] align-middle">
														{(row.reference ?? row.description) ? (
															<span className="rounded bg-[#f3f3f3] px-1.5 py-0.5 font-mono text-xs text-[#4a4f51]">
																{row.reference ?? row.description}
															</span>
														) : (
															<span className="text-xs text-[#8a8f91]">—</span>
														)}
													</td>
													<td className="px-[14px] py-[11px] align-middle">
														<StatusBadge status={row.status} />
													</td>
												</tr>
											))}
										</tbody>
									</table>
								)}
							</div>
						</div>
					</>
				) : (
					<div className="flex flex-1 items-center justify-center">
						<div className="space-y-2 text-center">
							<Users className="mx-auto h-10 w-10 text-[#c4c4c4]" />
							<p className="text-sm font-medium text-[#737373]">
								Select a recipient to view their ledger
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
