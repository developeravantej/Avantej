import { createFileRoute, useSearch } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Play, RefreshCw, Users } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
	usePayoutsList,
	useLiabilitySummary,
	useRecipientSummary,
	useProcessForRecipient,
	type PayoutListItem,
	type RecipientSummaryResult,
} from "@/features/payouts/api";
import { RunBatchDrawer } from "@/features/payouts/components/run-batch-drawer";
import type { StaffOption } from "@/features/payouts/components/run-batch-drawer";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Route definition
// ---------------------------------------------------------------------------

const searchSchema = z.object({
	tab: z.enum(["all", "per-recipient"]).optional().default("all"),
	recipientId: z.string().optional(),
});

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/payouts/view",
)({
	beforeLoad: async () => {
		await requirePermission("commission_payout:read");
	},
	validateSearch: searchSchema,
	component: PayoutsPage,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
		<span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", config.cls)}>
			<span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
			{config.label}
		</span>
	);
}

/** Two-letter avatar initials from a full name. */
function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Org KPI strip (4 tiles above tabs)
// ---------------------------------------------------------------------------

function OrgKpiStrip({
	payouts,
	liabilityTotals,
	isLoading,
}: {
	payouts: PayoutListItem[];
	liabilityTotals: { approvedUnpaidCents?: number; paidCents?: number } | undefined;
	isLoading: boolean;
}) {
	const now = new Date();
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

	const disbursedThisMonth = useMemo(
		() =>
			payouts
				.filter((p) => p.status === "paid" && p.paidAt != null && new Date(p.paidAt) >= monthStart)
				.reduce((sum, p) => sum + Math.abs(p.amount), 0),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[payouts],
	);

	const pendingRecipients = useMemo(() => {
		const ids = new Set(payouts.filter((p) => p.status === "pending").map((p) => p.recipientId));
		return ids.size;
	}, [payouts]);

	const avgPayout = useMemo(() => {
		const paidThisMonth = payouts.filter(
			(p) => p.status === "paid" && p.paidAt != null && new Date(p.paidAt) >= monthStart,
		);
		if (paidThisMonth.length === 0) return 0;
		return Math.round(paidThisMonth.reduce((s, p) => s + Math.abs(p.amount), 0) / paidThisMonth.length);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payouts]);

	const lastBatchAt = useMemo(() => {
		const paidRows = payouts.filter((p) => p.status === "paid" && p.paidAt != null);
		if (paidRows.length === 0) return null;
		return paidRows.reduce((latest, p) => {
			const t = new Date(p.paidAt!).getTime();
			return t > latest ? t : latest;
		}, 0);
	}, [payouts]);

	const tiles = [
		{ label: "Disbursed (This Month)", value: formatPrice(disbursedThisMonth, "MYR"), testId: "kpi-disbursed" },
		{ label: "Pending Recipients", value: String(pendingRecipients), testId: "kpi-pending-recipients" },
		{ label: "Avg Payout", value: avgPayout > 0 ? formatPrice(avgPayout, "MYR") : "—", testId: "kpi-avg-payout" },
		{ label: "Last Batch", value: lastBatchAt ? formatRelativeDate(new Date(lastBatchAt)) : "—", testId: "kpi-last-batch" },
	];

	return (
		<div className="grid grid-cols-4 divide-x border-b" data-testid="org-kpi-strip">
			{tiles.map((tile) => (
				<div key={tile.label} className="px-6 py-4" data-testid={tile.testId}>
					<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{tile.label}</p>
					{isLoading ? (
						<div className="mt-2 h-6 w-28 animate-pulse rounded bg-muted" />
					) : (
						<p className="mt-1 text-xl font-semibold font-mono tabular-nums">{tile.value}</p>
					)}
				</div>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tab pills
// ---------------------------------------------------------------------------

type TabId = "all" | "per-recipient";

const TABS: { id: TabId; label: string }[] = [
	{ id: "all", label: "All Payouts" },
	{ id: "per-recipient", label: "Per Recipient" },
];

// ---------------------------------------------------------------------------
// All Payouts tab — Gross / Deductions / Net / Reference
// ---------------------------------------------------------------------------

function AllPayoutsTab({
	payouts,
	isLoading,
}: {
	payouts: PayoutListItem[];
	isLoading: boolean;
}) {
	if (isLoading) {
		return (
			<div className="flex h-48 items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (payouts.length === 0) {
		return (
			<div className="flex min-h-64 items-center justify-center">
				<div className="text-center space-y-1">
					<Banknote className="h-8 w-8 text-muted-foreground mx-auto" />
					<p className="text-sm font-medium text-muted-foreground">No payouts yet</p>
					<p className="text-xs text-muted-foreground">Use "Run Batch" to create payouts from approved commission splits.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-auto" data-testid="payouts-table">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/30">
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Date</TableHead>
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Recipient</TableHead>
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide text-right">Gross</TableHead>
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide text-right">Deductions</TableHead>
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide text-right">Net</TableHead>
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Reference</TableHead>
						<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Status</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{payouts.map((row) => {
						const isReversal = row.amount < 0;
						return (
							<TableRow
								key={row.id}
								className={cn("hover:bg-muted/20 transition-colors", isReversal && "bg-red-50/40")}
							>
								<TableCell className="py-3 text-sm text-muted-foreground">
									{formatRelativeDate(row.paidAt ?? row.createdAt)}
								</TableCell>
								<TableCell className="py-3 text-sm font-medium">{row.recipientName}</TableCell>
								<TableCell className="py-3 text-right font-mono tabular-nums text-sm">
									{formatPrice(Math.abs(row.grossAmountCents), "MYR")}
								</TableCell>
								<TableCell className="py-3 text-right font-mono tabular-nums text-sm text-muted-foreground">
									{row.deductionsCents > 0 ? `-${formatPrice(row.deductionsCents, "MYR")}` : "—"}
								</TableCell>
								<TableCell className="py-3 text-right">
									<span className={cn("font-mono tabular-nums text-sm font-semibold", isReversal ? "text-destructive" : "text-foreground")}>
										{isReversal ? "-" : ""}{formatPrice(Math.abs(row.amount), "MYR")}
									</span>
									{isReversal && (
										<span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Reversal</span>
									)}
								</TableCell>
								<TableCell className="py-3 font-mono text-xs text-muted-foreground max-w-[160px] truncate">
									{row.description ?? row.reference ?? "—"}
								</TableCell>
								<TableCell className="py-3">
									<StatusBadge status={row.status} />
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Per Recipient tab — V3 ledger layout
// ---------------------------------------------------------------------------

function PerRecipientTab({
	payouts,
	isLoading,
	organizationId,
	canRunBatch,
	onSelectRecipient,
}: {
	payouts: PayoutListItem[];
	isLoading: boolean;
	organizationId: string;
	canRunBatch: boolean;
	onSelectRecipient: (recipientId: string) => void;
}) {
	const { recipientId } = useSearch({ from: "/_authenticated/dashboard/_layout/payouts/view" });
	const [search, setSearch] = useState("");

	// Derive unique recipients from list
	const recipients = useMemo(() => {
		const map = new Map<string, { name: string; pendingCents: number; pendingCount: number }>();
		for (const p of payouts) {
			const existing = map.get(p.recipientId);
			if (!existing) {
				map.set(p.recipientId, {
					name: p.recipientName,
					pendingCents: p.status === "pending" ? Math.abs(p.amount) : 0,
					pendingCount: p.status === "pending" ? 1 : 0,
				});
			} else {
				if (p.status === "pending") {
					existing.pendingCents += Math.abs(p.amount);
					existing.pendingCount += 1;
				}
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

	const { data: summary, isLoading: summaryLoading } = useRecipientSummary(
		organizationId,
		recipientId ?? null,
	);

	const processForRecipient = useProcessForRecipient(organizationId);

	const recipientPayouts = useMemo(() => {
		if (!recipientId) return [];
		return payouts.filter((p) => p.recipientId === recipientId);
	}, [payouts, recipientId]);

	// Current cycle pending amount for Process Pending button label
	const pendingForRecipient = useMemo(
		() => recipientPayouts.filter((p) => p.status === "pending").reduce((s, p) => s + Math.abs(p.amount), 0),
		[recipientPayouts],
	);

	function handleProcessPending() {
		if (!recipientId) return;
		processForRecipient.mutate({
			organizationId,
			recipientId,
			paymentMethod: "bank_transfer",
		});
	}

	if (isLoading) {
		return (
			<div className="flex h-48 items-center justify-center">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	const typedSummary = summary as RecipientSummaryResult | undefined;

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			{/* Sidebar — recipient list */}
			<div className="w-[260px] shrink-0 border-r flex flex-col overflow-hidden">
				{/* Search */}
				<div className="px-4 py-3 border-b">
					<input
						type="text"
						placeholder="Search recipient…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
					/>
				</div>

				{/* Recipient list */}
				<div className="flex-1 overflow-auto">
					{filteredRecipients.length === 0 ? (
						<div className="p-4 text-xs text-muted-foreground text-center">No recipients found</div>
					) : (
						<>
							<div className="px-4 pt-3 pb-1">
								<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recipients</span>
							</div>
							{filteredRecipients.map((r) => {
								const isActive = r.id === recipientId;
								return (
									<button
										key={r.id}
										type="button"
										onClick={() => onSelectRecipient(r.id)}
										className={cn(
											"w-full px-4 py-2.5 text-left transition-colors",
											isActive
												? "bg-muted border-l-[3px] border-l-foreground"
												: "hover:bg-muted/40 border-l-[3px] border-l-transparent",
										)}
									>
										<div className="flex items-center gap-3">
											{/* Avatar */}
											<div
												className={cn(
													"h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white",
													isActive ? "bg-foreground" : "bg-muted-foreground",
												)}
											>
												{getInitials(r.name)}
											</div>
											<div className="flex-1 min-w-0">
												<div className="text-xs font-semibold truncate">{r.name}</div>
												<div className="text-[11px] text-muted-foreground font-mono tabular-nums">
													{r.pendingCents > 0 ? `${formatPrice(r.pendingCents, "MYR")} pending` : "No pending"}
												</div>
											</div>
											{r.pendingCount > 0 && (
												<span className="shrink-0 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 leading-tight">
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

			{/* Main ledger panel */}
			<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
				{selectedRecipient ? (
					<>
						{/* Recipient header */}
						<div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
							<div className="flex items-center gap-4">
								<div className="h-12 w-12 rounded-full bg-foreground flex items-center justify-center text-background text-base font-bold shrink-0">
									{getInitials(selectedRecipient.name)}
								</div>
								<div>
									<div className="flex items-center gap-2">
										<h2 className="text-base font-bold">{selectedRecipient.name}</h2>
									</div>
									<div className="text-xs text-muted-foreground mt-0.5">Payout history and lifetime stats</div>
								</div>
							</div>
							{canRunBatch && (
								<div className="flex items-center gap-2">
									<Button
										size="sm"
										variant="outline"
										onClick={handleProcessPending}
										disabled={processForRecipient.isPending || pendingForRecipient === 0}
										data-testid="process-pending-button"
									>
										{processForRecipient.isPending ? (
											<RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
										) : (
											<Play className="h-3.5 w-3.5 mr-1.5" />
										)}
										Process Pending
										{pendingForRecipient > 0 && (
											<span className="ml-1.5 font-mono tabular-nums">
												· {formatPrice(pendingForRecipient, "MYR")}
											</span>
										)}
									</Button>
								</div>
							)}
						</div>

						{/* Inline KPI row (border-separated tiles) */}
						<div className="grid grid-cols-4 divide-x border-b bg-muted/20 shrink-0">
							<div className="px-6 py-4">
								<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Lifetime Paid</p>
								{summaryLoading ? (
									<div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted" />
								) : (
									<p className="mt-1 text-xl font-semibold font-mono tabular-nums">
										{formatPrice(typedSummary?.lifetimePaidCents ?? 0, "MYR")}
									</p>
								)}
							</div>
							<div className="px-6 py-4">
								<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Current Cycle</p>
								{summaryLoading ? (
									<div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted" />
								) : (
									<p className="mt-1 text-xl font-semibold font-mono tabular-nums text-amber-600">
										{formatPrice(pendingForRecipient, "MYR")}
									</p>
								)}
								<p className="text-[11px] text-muted-foreground mt-0.5">
									{recipientPayouts.filter((p) => p.status === "pending").length} pending split{recipientPayouts.filter((p) => p.status === "pending").length !== 1 ? "s" : ""}
								</p>
							</div>
							<div className="px-6 py-4">
								<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Last Payout</p>
								{summaryLoading ? (
									<div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted" />
								) : (
									<p className="mt-1 text-xl font-semibold font-mono tabular-nums">
										{typedSummary?.lastPayoutAt ? formatRelativeDate(typedSummary.lastPayoutAt) : "—"}
									</p>
								)}
							</div>
							<div className="px-6 py-4">
								<p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Avg per Cycle</p>
								{summaryLoading ? (
									<div className="mt-2 h-5 w-24 animate-pulse rounded bg-muted" />
								) : (
									<p className="mt-1 text-xl font-semibold font-mono tabular-nums">
										{formatPrice(typedSummary?.avgPerCycleCents ?? 0, "MYR")}
									</p>
								)}
							</div>
						</div>

						{/* Lower split: breakdown (340px) + history table */}
						<div className="flex flex-1 min-h-0 overflow-hidden">
							{/* Current cycle breakdown */}
							<div className="w-[340px] shrink-0 border-r overflow-auto p-5">
								<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Current Cycle Breakdown</p>

								{/* Deductions card */}
								<div className="rounded-xl border bg-muted/20 p-3.5 mb-4 space-y-0">
									<div className="flex justify-between items-center py-2 border-b border-border/60">
										<span className="text-xs text-muted-foreground">Gross commissions</span>
										<span className="font-mono tabular-nums text-sm font-semibold">
											{formatPrice(
												recipientPayouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.grossAmountCents, 0),
												"MYR",
											)}
										</span>
									</div>
									<div className="flex justify-between items-center py-2 border-b border-border/60">
										<span className="text-xs text-muted-foreground">Total deductions</span>
										<span className="font-mono tabular-nums text-sm text-destructive">
											{(() => {
												const d = recipientPayouts.filter((p) => p.status === "pending").reduce((s, p) => s + p.deductionsCents, 0);
												return d > 0 ? `-${formatPrice(d, "MYR")}` : "—";
											})()}
										</span>
									</div>
									<div className="flex justify-between items-center pt-3 mt-1 border-t border-border">
										<span className="text-sm font-bold">Net Payout</span>
										<span className="font-mono tabular-nums text-base font-bold">
											{formatPrice(pendingForRecipient, "MYR")}
										</span>
									</div>
								</div>

								{/* Pending payout rows */}
								<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Pending Payouts</p>
								{recipientPayouts.filter((p) => p.status === "pending").length === 0 ? (
									<p className="text-xs text-muted-foreground">No pending payouts for this recipient.</p>
								) : (
									<div className="space-y-1.5">
										{recipientPayouts
											.filter((p) => p.status === "pending")
											.map((p) => (
												<div key={p.id} className="rounded-lg border bg-background p-2.5">
													<div className="flex justify-between items-start gap-2">
														<div className="min-w-0">
															<p className="text-xs font-semibold truncate">{p.description ?? p.reference ?? "Payout"}</p>
															<p className="text-[11px] text-muted-foreground">{formatRelativeDate(p.createdAt)}</p>
														</div>
														<span className="font-mono tabular-nums text-xs font-semibold shrink-0">
															{formatPrice(Math.abs(p.amount), "MYR")}
														</span>
													</div>
												</div>
											))}
									</div>
								)}
							</div>

							{/* Payout history table */}
							<div className="flex-1 overflow-auto">
								<div className="px-6 py-4 border-b">
									<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payout History</p>
								</div>
								{recipientPayouts.length === 0 ? (
									<div className="flex h-48 items-center justify-center">
										<p className="text-sm text-muted-foreground">No payouts for this recipient yet</p>
									</div>
								) : (
									<Table>
										<TableHeader>
											<TableRow className="bg-muted/20">
												<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Date</TableHead>
												<TableHead className="text-[11px] font-semibold uppercase tracking-wide text-right">Gross</TableHead>
												<TableHead className="text-[11px] font-semibold uppercase tracking-wide text-right">Net</TableHead>
												<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Bank Ref</TableHead>
												<TableHead className="text-[11px] font-semibold uppercase tracking-wide">Status</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{recipientPayouts.map((row) => (
												<TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
													<TableCell className="py-3 text-sm text-muted-foreground">
														{row.paidAt ? formatAbsoluteDate(row.paidAt) : formatRelativeDate(row.createdAt)}
													</TableCell>
													<TableCell className="py-3 text-right font-mono tabular-nums text-sm">
														{formatPrice(Math.abs(row.grossAmountCents), "MYR")}
													</TableCell>
													<TableCell className="py-3 text-right font-mono tabular-nums text-sm font-semibold">
														{formatPrice(Math.abs(row.amount), "MYR")}
													</TableCell>
													<TableCell className="py-3 max-w-[140px] truncate">
														{row.reference ?? row.description ? (
															<span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
																{row.reference ?? row.description}
															</span>
														) : (
															<span className="text-xs text-muted-foreground">—</span>
														)}
													</TableCell>
													<TableCell className="py-3">
														<StatusBadge status={row.status} />
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</div>
						</div>
					</>
				) : (
					<div className="flex flex-1 items-center justify-center">
						<div className="text-center space-y-2">
							<Users className="h-10 w-10 text-muted-foreground mx-auto" />
							<p className="text-sm font-medium text-muted-foreground">Select a recipient to view their ledger</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function PayoutsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const navigate = Route.useNavigate();
	const { tab } = useSearch({ from: "/_authenticated/dashboard/_layout/payouts/view" });
	const activeTab: TabId = tab ?? "all";

	const canReadPayouts = hasPermission("commission_payout:read");
	const canRunBatch = hasPermission("commission_payout:update");

	const { data: rawPayouts, isLoading: isPayoutsLoading } = usePayoutsList(organizationId);

	const { data: liabilityData, isLoading: isLiabilityLoading } = useLiabilitySummary(
		organizationId,
		firstOfMonthIso(),
		todayEndIso(),
	);

	// Staff list for Run Batch drawer
	const { data: membersData } = useQuery({
		queryKey: ["members-staff-list", organizationId],
		queryFn: () =>
			client.members.list({ organizationId: organizationId ?? "", status: "active" }),
		enabled: !!organizationId && canRunBatch,
		staleTime: 60_000,
	});

	const staffOptions = useMemo<StaffOption[]>(() => {
		if (!membersData) return [];
		return (membersData as Array<{ role: string; userId: string; name: string }>)
			.filter((m) => m.role !== "client")
			.map((m) => ({ id: m.userId, name: m.name }));
	}, [membersData]);

	const [drawerOpen, setDrawerOpen] = useState(false);

	const liabilityTotals = (
		liabilityData as {
			totals?: { approvedUnpaidCents?: number; paidCents?: number; netPayableCents?: number };
		} | null
	)?.totals;

	const payouts = useMemo<PayoutListItem[]>(() => {
		if (!rawPayouts) return [];
		return (rawPayouts as PayoutListItem[]).map((p) => ({
			...p,
			grossAmountCents: p.grossAmountCents ?? p.amount,
			deductionsCents: p.deductionsCents ?? 0,
			description: p.description ?? null,
		}));
	}, [rawPayouts]);

	// ── Guards ──────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="-m-6 flex h-screen flex-col items-center justify-center text-muted-foreground bg-white">
				Select an organization to view payouts.
			</div>
		);
	}

	if (!canReadPayouts) {
		return (
			<div className="-m-6 flex h-screen flex-col items-center justify-center bg-white">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm text-muted-foreground">You don't have permission to view payouts.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="-m-6 flex h-screen flex-col bg-white">
			{/* Page header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4 border-b">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<Banknote className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-lg font-semibold">Payouts</h1>
						<p className="text-xs text-muted-foreground">Manage commission payouts and batch disbursements</p>
					</div>
				</div>
				{canRunBatch && (
					<Button size="sm" onClick={() => setDrawerOpen(true)} data-testid="run-batch-button">
						<Play className="h-3.5 w-3.5 mr-1.5" />
						Run Batch
					</Button>
				)}
			</div>

			{/* Org KPI strip */}
			<OrgKpiStrip
				payouts={payouts}
				liabilityTotals={liabilityTotals}
				isLoading={isPayoutsLoading || isLiabilityLoading}
			/>

			{/* Sub-tabs */}
			<div className="flex shrink-0 items-center gap-1 px-6 pt-4 pb-0 border-b">
				{TABS.map(({ id, label }) => (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={activeTab === id}
						onClick={() =>
							navigate({
								search: (prev) => ({
									...prev,
									tab: id,
									recipientId: id === "all" ? undefined : prev.recipientId,
								}),
							})
						}
						className={cn(
							"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
							activeTab === id
								? "border-primary text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{label}
					</button>
				))}
			</div>

			{/* Tab content — fills remaining height */}
			<div className={cn("flex min-h-0 flex-1 overflow-hidden", activeTab === "all" && "flex-col")}>
				{activeTab === "all" ? (
					<AllPayoutsTab
						payouts={payouts}
						isLoading={isPayoutsLoading}
					/>
				) : (
					<PerRecipientTab
						payouts={payouts}
						isLoading={isPayoutsLoading}
						organizationId={organizationId}
						canRunBatch={canRunBatch}
						onSelectRecipient={(id) =>
							navigate({
								search: (prev) => ({ ...prev, tab: "per-recipient", recipientId: id }),
							})
						}
					/>
				)}
			</div>

			{/* Run Batch drawer */}
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
