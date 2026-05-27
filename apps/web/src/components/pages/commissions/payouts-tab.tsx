import { useMemo, useState } from "react";
import { MoreHorizontal, Play, RefreshCw, Users } from "lucide-react";
import {
	type CancelPayoutParams,
	type MarkFailedParams,
	type MarkPaidParams,
	type PayoutListItem,
	type ProcessForRecipientParams,
	type RecipientSummaryResult,
	type RetryPayoutParams,
	useCancelPayout,
	useConfirmPayoutViaStripe,
	useLiabilitySummary,
	useMarkPayoutFailed,
	useMarkPayoutPaid,
	usePayoutsList,
	useProcessForRecipient,
	useRecipientSummary,
	useRetryPayout,
} from "@/features/payouts/api";
import { PartnerStripeCard } from "@/features/payouts/components/partner-stripe-card";
import {
	CancelPayoutDialog,
	ConfirmViaStripeDialog,
	MarkFailedDialog,
	MarkPaidDialog,
	RetryPayoutDialog,
} from "@/features/payouts/components/payout-action-dialogs";
import { RunBatchDrawer } from "@/features/payouts/components/run-batch-drawer";
import type { StaffOption } from "@/features/payouts/components/run-batch-drawer";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function firstOfMonthIso(): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function todayEndIso(): string {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
}

function formatRelativeDate(date: Date | string | null | undefined): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	const diff = Date.now() - d.getTime();
	const days = Math.floor(diff / 86_400_000);
	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}

function formatAbsoluteDate(date: Date | string | null | undefined): string {
	if (!date) return "—";
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
	const map: Record<string, { label: string; dot: string; cls: string }> = {
		pending: { label: "Pending", dot: "bg-amber-500", cls: "bg-amber-50 text-amber-700" },
		processing: { label: "Processing", dot: "bg-blue-500", cls: "bg-blue-50 text-blue-700" },
		paid: { label: "Paid", dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700" },
		failed: { label: "Failed", dot: "bg-rose-500", cls: "bg-rose-50 text-rose-700" },
		canceled: { label: "Cancelled", dot: "bg-slate-400", cls: "bg-slate-100 text-slate-500" },
	};
	const config = map[status] ?? { label: status, dot: "bg-slate-400", cls: "bg-slate-100 text-slate-500" };
	return (
		<span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", config.cls)}>
			<span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
			{config.label}
		</span>
	);
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Row action menu ──────────────────────────────────────────────────────────

// F-PAY-6: per-row state-machine actions gated by commission_payout:process
function PayoutRowActions({
	payout,
	organizationId,
	canProcess,
}: {
	payout: PayoutListItem;
	organizationId: string;
	canProcess: boolean;
}) {
	// One slot drives which dialog is open. null = closed. Each item in the
	// dropdown sets this; the dialog component then owns the form + mutation.
	type DialogKind = "markPaid" | "markFailed" | "retry" | "cancel" | "confirmStripe";
	const [activeDialog, setActiveDialog] = useState<DialogKind | null>(null);

	// Surface pending state on the trigger button. Each mutation runs inside
	// its dialog component now, so we read from the same hooks here just to
	// reflect the loading state on the row — actual `mutate` calls happen
	// in the dialog.
	const markPaid = useMarkPayoutPaid(organizationId);
	const markFailed = useMarkPayoutFailed(organizationId);
	const retry = useRetryPayout(organizationId);
	const cancel = useCancelPayout(organizationId);
	const confirmStripe = useConfirmPayoutViaStripe(organizationId);
	const isBusy =
		markPaid.isPending ||
		markFailed.isPending ||
		retry.isPending ||
		cancel.isPending ||
		confirmStripe.isPending;

	const { status } = payout;
	const isStripeConnect = payout.paymentMethod === "stripe_connect";
	const canConfirmStripe =
		(status === "pending" || status === "processing") && isStripeConnect;

	// Terminal statuses or no permission — render nothing
	if (!canProcess || status === "paid" || status === "canceled" || status === "cancelled") {
		return null;
	}

	const close = () => setActiveDialog(null);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={isBusy}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8a8f91] transition-colors hover:bg-[#f3f3f3] hover:text-[#0a0a0a] disabled:opacity-40"
					aria-label="Payout actions"
					data-testid="payout-row-actions"
				>
					{isBusy ? (
						<RefreshCw className="h-3.5 w-3.5 animate-spin" />
					) : (
						<MoreHorizontal className="h-4 w-4" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{canConfirmStripe && (
					<>
						<DropdownMenuItem
							onClick={handleConfirmStripe}
							className="text-indigo-700 focus:bg-indigo-50 focus:text-indigo-700"
						>
							Confirm via Stripe
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				)}
				{(status === "pending" || status === "processing") && (
					<>
						<DropdownMenuItem
							onClick={handleMarkPaid}
							className="text-emerald-700 focus:bg-emerald-50 focus:text-emerald-700"
						>
							Mark Paid {isStripeConnect ? "(manual ref)" : ""}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={handleMarkFailed}
							className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
						>
							Mark Failed
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={handleCancel}
							className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
						>
							Cancel
						</DropdownMenuItem>
					</>
				)}
				{status === "failed" && (
					<>
						<DropdownMenuItem
							onClick={handleRetry}
							className="text-blue-600 focus:bg-blue-50 focus:text-blue-600"
						>
							Retry
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={handleCancel}
							className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
						>
							Cancel
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// ─── All Payouts table ────────────────────────────────────────────────────────

function AllPayoutsTable({
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
				<p className="text-xs text-[#737373]">Use "Run Batch" to create payouts from approved commission splits.</p>
			</div>
		);
	}

	return (
		<div className="overflow-auto">
			<table className="w-full">
				<thead>
					<tr>
						{["Date", "Recipient", "Gross", "Deductions", "Net", "Reference", "Status", ""].map((h) => (
							<th
								key={h || "__actions"}
								className={cn(
									"border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a8f91] whitespace-nowrap",
									(h === "Gross" || h === "Deductions" || h === "Net") && "text-right",
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
								className={cn("border-b border-[#f7f5ee] last:border-0", isReversal ? "bg-red-50/40" : "hover:bg-[#fcfaf6]")}
							>
								<td className="px-[14px] py-[11px] align-middle">
									<span className="text-sm text-[#4a4f51]">{formatRelativeDate(row.paidAt ?? row.createdAt)}</span>
								</td>
								<td className="px-[14px] py-[11px] align-middle">
									<span className="text-sm font-medium text-[#0a0a0a]">{row.recipientName}</span>
								</td>
								<td className="px-[14px] py-[11px] text-right align-middle">
									<span className="font-mono text-sm tabular-nums text-[#4a4f51]">{formatPrice(Math.abs(row.grossAmountCents), "MYR")}</span>
								</td>
								<td className="px-[14px] py-[11px] text-right align-middle">
									<span className="font-mono text-sm tabular-nums text-[#4a4f51]">
										{row.deductionsCents > 0 ? `-${formatPrice(row.deductionsCents, "MYR")}` : "—"}
									</span>
								</td>
								<td className="px-[14px] py-[11px] text-right align-middle">
									<span className={cn("font-mono text-sm font-semibold tabular-nums", isReversal ? "text-red-600" : "text-[#0a0a0a]")}>
										{isReversal ? "-" : ""}{formatPrice(Math.abs(row.amount), "MYR")}
									</span>
									{isReversal && (
										<span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
											<span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Reversal
										</span>
									)}
								</td>
								<td className="max-w-[160px] px-[14px] py-[11px] align-middle">
									<span className="block truncate font-mono text-xs text-[#8a8f91]">{row.description ?? row.reference ?? "—"}</span>
								</td>
								<td className="px-[14px] py-[11px] align-middle">
									<StatusBadge status={row.status} />
								</td>
								<td className="px-[14px] py-[11px] align-middle">
									<PayoutRowActions payout={row} organizationId={organizationId} canProcess={canProcess} />
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

// ─── Per Recipient panel ──────────────────────────────────────────────────────

function PerRecipientPanel({
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
		const map = new Map<string, { name: string; pendingCents: number; pendingCount: number }>();
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

	const selectedRecipient = recipients.find((r) => r.id === recipientId) ?? null;
	const { data: summary, isLoading: summaryLoading } = useRecipientSummary(organizationId, recipientId ?? null);
	const processForRecipient = useProcessForRecipient(organizationId);

	const recipientPayouts = useMemo(() => {
		if (!recipientId) return [];
		return payouts.filter((p) => p.recipientId === recipientId);
	}, [payouts, recipientId]);

	const pendingForRecipient = useMemo(
		// F-PAY-4: signed sum so reversals reduce the total
		() => recipientPayouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.amount, 0),
		[recipientPayouts],
	);

	const typedSummary = summary as RecipientSummaryResult | undefined;

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
						<div className="p-4 text-center text-xs text-[#737373]">No recipients</div>
					) : (
						<>
							<div className="px-4 pb-1 pt-3">
								<span className="text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">Recipients</span>
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
											isActive ? "border-l-[#0a0a0a] bg-[#f7f5ee]" : "border-l-transparent hover:bg-[#fcfaf6]",
										)}
									>
										<div className="flex items-center gap-3">
											<div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", isActive ? "bg-[#0a0a0a]" : "bg-[#737373]")}>
												{getInitials(r.name)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-xs font-semibold text-[#0a0a0a]">{r.name}</div>
												<div className="font-mono text-[11px] tabular-nums text-[#737373]">
													{r.pendingCents > 0 ? `${formatPrice(r.pendingCents, "MYR")} pending` : "No pending"}
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
									<div className="text-sm font-semibold text-[#0a0a0a]">{selectedRecipient.name}</div>
									<div className="text-[11px] text-[#737373]">Payout history and lifetime stats</div>
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
											<SelectItem value="bank_transfer">Bank Transfer</SelectItem>
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
														toast.error(err.message ?? "Failed to process payouts");
													},
												},
											)
										}
										disabled={processForRecipient.isPending || pendingForRecipient === 0}
									>
										{processForRecipient.isPending ? (
											<RefreshCw className="h-3.5 w-3.5 animate-spin" />
										) : (
											<Play className="h-3.5 w-3.5" />
										)}
										Process Pending
										{pendingForRecipient > 0 && (
											<span className="font-mono tabular-nums">· {formatPrice(pendingForRecipient, "MYR")}</span>
										)}
									</button>
								</div>
							)}
						</div>

						{/* Recipient KPI mini-band */}
						<div className="grid grid-cols-4 border-b border-[#e5e5e5] bg-[#f9f9f9]">
							{[
								{ label: "Lifetime Paid", value: summaryLoading ? null : formatPrice(typedSummary?.lifetimePaidCents ?? 0, "MYR"), color: "" },
								{
									label: "Current Cycle",
									value: summaryLoading ? null : formatPrice(pendingForRecipient, "MYR"),
									color: "text-amber-600",
									sub: `${recipientPayouts.filter((p) => p.status === "pending").length} pending`,
								},
								{ label: "Last Payout", value: summaryLoading ? null : (typedSummary?.lastPayoutAt ? formatRelativeDate(typedSummary.lastPayoutAt) : "—"), color: "" },
								{ label: "Avg per Cycle", value: summaryLoading ? null : formatPrice(typedSummary?.avgPerCycleCents ?? 0, "MYR"), color: "" },
							].map((kpi) => (
								<div key={kpi.label} className="border-r border-[#e5e5e5] px-5 py-3 last:border-r-0">
									<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">{kpi.label}</div>
									{kpi.value === null ? (
										<div className="mt-1.5 h-5 w-20 animate-pulse rounded bg-[#e5e5e5]" />
									) : (
										<div className={cn("mt-1 font-mono text-lg font-bold tabular-nums text-[#0a0a0a]", kpi.color)}>{kpi.value}</div>
									)}
									{kpi.sub && <div className="mt-0.5 text-[11px] text-[#737373]">{kpi.sub}</div>}
								</div>
							))}
						</div>

						{/* Lower: breakdown + history */}
						<div className="flex flex-1 overflow-hidden">
							{/* Breakdown sidebar */}
							<div className="w-[300px] shrink-0 overflow-auto border-r border-[#e5e5e5] p-5">
								<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">Current Cycle Breakdown</div>
								<div className="mb-4 rounded-xl border border-[#e5e5e5] bg-[#f7f7f7] p-3.5">
									<div className="flex items-center justify-between border-b border-[#e5e5e5] py-2">
										<span className="text-xs text-[#737373]">Gross commissions</span>
										<span className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">
											{formatPrice(
												recipientPayouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.grossAmountCents, 0),
												"MYR",
											)}
										</span>
									</div>
									<div className="flex items-center justify-between border-b border-[#e5e5e5] py-2">
										<span className="text-xs text-[#737373]">Total deductions</span>
										<span className="font-mono text-sm tabular-nums text-red-600">
											{(() => {
												const d = recipientPayouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.deductionsCents, 0);
												return d > 0 ? `-${formatPrice(d, "MYR")}` : "—";
											})()}
										</span>
									</div>
									<div className="mt-1 flex items-center justify-between border-t border-[#e5e5e5] pt-3">
										<span className="text-sm font-semibold text-[#0a0a0a]">Net Payout</span>
										<span className="font-mono text-base font-bold tabular-nums text-[#0a0a0a]">{formatPrice(pendingForRecipient, "MYR")}</span>
									</div>
								</div>

								<div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">Pending Payouts</div>
								{recipientPayouts.filter((p) => p.status === "pending").length === 0 ? (
									<p className="text-xs text-[#737373]">No pending payouts for this recipient.</p>
								) : (
									<div className="space-y-1.5">
										{recipientPayouts.filter((p) => p.status === "pending").map((p) => (
											<div key={p.id} className="rounded-lg border border-[#e5e5e5] bg-white p-2.5">
												<div className="flex items-start justify-between gap-2">
													<div className="min-w-0">
														<p className="truncate text-xs font-semibold text-[#0a0a0a]">{p.description ?? p.reference ?? "Payout"}</p>
														<p className="text-[11px] text-[#737373]">{formatRelativeDate(p.createdAt)}</p>
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
									<span className="text-[10px] font-bold uppercase tracking-widest text-[#8a8f91]">Payout History</span>
								</div>
								{recipientPayouts.length === 0 ? (
									<div className="flex h-32 items-center justify-center">
										<p className="text-sm text-[#737373]">No payouts for this recipient yet</p>
									</div>
								) : (
									<table className="w-full">
										<thead>
											<tr>
												{["Date", "Gross", "Net", "Bank Ref", "Status"].map((h) => (
													<th
														key={h}
														className={cn(
															"border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a8f91] whitespace-nowrap",
															(h === "Gross" || h === "Net") && "text-right",
														)}
													>
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{recipientPayouts.map((row) => (
												<tr key={row.id} className="border-b border-[#f7f5ee] last:border-0 hover:bg-[#fcfaf6]">
													<td className="px-[14px] py-[11px] align-middle">
														<span className="text-sm text-[#4a4f51]">{row.paidAt ? formatAbsoluteDate(row.paidAt) : formatRelativeDate(row.createdAt)}</span>
													</td>
													<td className="px-[14px] py-[11px] text-right align-middle">
														<span className="font-mono text-sm tabular-nums text-[#4a4f51]">{formatPrice(Math.abs(row.grossAmountCents), "MYR")}</span>
													</td>
													<td className="px-[14px] py-[11px] text-right align-middle">
														<span className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">{formatPrice(Math.abs(row.amount), "MYR")}</span>
													</td>
													<td className="max-w-[140px] px-[14px] py-[11px] align-middle">
														{row.reference ?? row.description ? (
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
							<p className="text-sm font-medium text-[#737373]">Select a recipient to view their ledger</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

type SubTab = "all" | "per-recipient";

export function PayoutsTab({
	organizationId,
	recipientId,
	onSelectRecipient,
}: {
	organizationId: string;
	recipientId: string | undefined;
	onSelectRecipient: (id: string) => void;
}) {
	const { hasPermission } = useUserContext();
	const canRunBatch = hasPermission("commission_payout:process");

	const [activeSubTab, setActiveSubTab] = useState<SubTab>("all");
	const [drawerOpen, setDrawerOpen] = useState(false);

	const { data: rawPayouts, isLoading } = usePayoutsList(organizationId);
	useLiabilitySummary(organizationId, firstOfMonthIso(), todayEndIso()); // prefetch for KPI

	const { data: membersData } = useQuery({
		queryKey: ["members-staff-list", organizationId],
		queryFn: () => client.members.list({ organizationId, status: "active" }),
		enabled: canRunBatch,
		staleTime: 60_000,
	});

	const staffOptions = useMemo<StaffOption[]>(() => {
		if (!membersData) return [];
		return (membersData as Array<{ role: string; userId: string; name: string }>)
			.filter((m) => m.role !== "client")
			.map((m) => ({ id: m.userId, name: m.name }));
	}, [membersData]);

	const payouts = useMemo<PayoutListItem[]>(() => {
		if (!rawPayouts) return [];
		return (rawPayouts as PayoutListItem[]).map((p) => ({
			...p,
			grossAmountCents: p.grossAmountCents ?? p.amount,
			deductionsCents: p.deductionsCents ?? 0,
			description: p.description ?? null,
		}));
	}, [rawPayouts]);

	// KPI derivations
	const now = new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	const disbursedThisMonth = useMemo(
		() =>
			payouts
				.filter((p) => p.status === "paid" && p.paidAt != null && new Date(p.paidAt) >= monthStart)
				.reduce((s, p) => s + p.amount, 0), // F-PAY-4: signed sum so reversals reduce the total
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[payouts],
	);
	const pendingCount = useMemo(() => new Set(payouts.filter((p) => p.status === "pending").map((p) => p.recipientId)).size, [payouts]);
	const avgPayout = useMemo(() => {
		const paid = payouts.filter(
			(p) => p.status === "paid" && p.paidAt != null && new Date(p.paidAt) >= monthStart && p.amount >= 0,
		);
		// F-PAY-4: signed sum so reversals reduce the total (filter already excludes p.amount < 0)
		return paid.length === 0 ? 0 : Math.round(paid.reduce((s, p) => s + p.amount, 0) / paid.length);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payouts]);
	const lastBatchAt = useMemo(() => {
		const paid = payouts.filter((p) => p.status === "paid" && p.paidAt != null);
		return paid.length === 0 ? null : paid.reduce((t, p) => Math.max(t, new Date(p.paidAt!).getTime()), 0);
	}, [payouts]);

	const kpis = [
		{ label: "Disbursed (This Month)", value: isLoading ? null : formatPrice(disbursedThisMonth, "MYR") },
		{ label: "Pending Recipients", value: isLoading ? null : String(pendingCount) },
		{ label: "Avg Payout", value: isLoading ? null : (avgPayout > 0 ? formatPrice(avgPayout, "MYR") : "—") },
		{ label: "Last Batch", value: isLoading ? null : (lastBatchAt ? formatRelativeDate(new Date(lastBatchAt)) : "—") },
	];

	return (
		<div className="px-6 py-6">
			{/* KPI band — matches liability tab */}
			<div className="mb-4 grid grid-cols-4 gap-4">
				{kpis.map((kpi) => (
					<div key={kpi.label} className="rounded-2xl border border-[#e5e5e5] bg-white px-5 py-4">
						<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">{kpi.label}</div>
						{kpi.value === null ? (
							<div className="mt-2 h-7 w-28 animate-pulse rounded bg-[#e5e5e5]" />
						) : (
							<div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0a0a0a]">{kpi.value}</div>
						)}
					</div>
				))}
			</div>

			{/* Partner Stripe Connect onboarding (S-partner-stripe-onboarding, PR #32).
			    Lets an admin wire up a coach's Stripe Connect account so the row-level
			    `Confirm via Stripe` action can fire `stripe.transfers.create`. Only
			    visible when the operator has permission to process payouts. */}
			{canRunBatch ? (
				<PartnerStripeCard organizationId={organizationId} />
			) : null}

			{/* Main card */}
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				{/* Toolbar */}
				<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
					<span className="text-sm font-semibold text-[#0a0a0a]">Payout Records</span>
					<div className="flex items-center gap-2">
						{/* Sub-tab pills */}
						<div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
							{(["all", "per-recipient"] as SubTab[]).map((id) => (
								<button
									key={id}
									type="button"
									onClick={() => setActiveSubTab(id)}
									className={cn(
										"rounded-lg px-3 py-1 text-xs font-semibold transition",
										activeSubTab === id ? "bg-[#0a0a0a] text-white" : "text-[#737373] hover:text-[#0a0a0a]",
									)}
								>
									{id === "all" ? "All Payouts" : "Per Recipient"}
								</button>
							))}
						</div>
						{canRunBatch && (
							<button
								type="button"
								className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] px-[14px] py-[8px] text-[13px] font-semibold text-white transition-opacity hover:opacity-85"
								onClick={() => setDrawerOpen(true)}
							>
								<Play className="h-3.5 w-3.5" />
								Run Batch
							</button>
						)}
					</div>
				</div>

				{/* Content */}
				{activeSubTab === "all" ? (
					isLoading ? (
						<div className="flex min-h-48 items-center justify-center">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0a0a0a] border-t-transparent" />
						</div>
					) : (
						<AllPayoutsTable payouts={payouts} organizationId={organizationId} canProcess={canRunBatch} />
					)
				) : (
					<PerRecipientPanel
						payouts={payouts}
						organizationId={organizationId}
						canRunBatch={canRunBatch}
						recipientId={recipientId}
						onSelectRecipient={onSelectRecipient}
					/>
				)}

				{/* Footer */}
				{activeSubTab === "all" && !isLoading && (
					<div className="flex items-center border-t border-[#e5e5e5] px-6 py-4">
						<span className="text-xs text-[#6b7170]">
							{payouts.length} payout{payouts.length !== 1 ? "s" : ""} shown
						</span>
					</div>
				)}
			</div>

			{canRunBatch && (
				<RunBatchDrawer
					open={drawerOpen}
					onOpenChange={setDrawerOpen}
					organizationId={organizationId}
					staffOptions={staffOptions}
				/>
			)}
		</div>
	);
}
