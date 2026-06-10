import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import {
	type PayoutListItem,
	useLiabilitySummary,
	usePayoutsList,
} from "@/features/payouts/api";
import { RunBatchDrawer } from "@/features/payouts/components/run-batch-drawer";
import type { StaffOption } from "@/features/payouts/components/run-batch-drawer";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
	firstOfMonthIso,
	formatRelativeDate,
	todayEndIso,
} from "./payouts/helpers";
import { AllPayoutsTable } from "./payouts/AllPayoutsTable";
import { PerRecipientPanel } from "./payouts/PerRecipientPanel";

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
		...orpc.members.list.queryOptions({
			input: { organizationId, status: "active" },
		}),
		enabled: canRunBatch,
		staleTime: 60_000,
	});

	const staffOptions = useMemo<StaffOption[]>(() => {
		if (!membersData) return [];
		return (
			membersData as Array<{ role: string; userId: string; name: string }>
		)
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
				.filter(
					(p) =>
						p.status === "paid" &&
						p.paidAt != null &&
						new Date(p.paidAt) >= monthStart,
				)
				.reduce((s, p) => s + p.amount, 0), // F-PAY-4: signed sum so reversals reduce the total
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[payouts],
	);
	const pendingCount = useMemo(
		() =>
			new Set(
				payouts.filter((p) => p.status === "pending").map((p) => p.recipientId),
			).size,
		[payouts],
	);
	const avgPayout = useMemo(() => {
		const paid = payouts.filter(
			(p) =>
				p.status === "paid" &&
				p.paidAt != null &&
				new Date(p.paidAt) >= monthStart &&
				p.amount >= 0,
		);
		// F-PAY-4: signed sum so reversals reduce the total (filter already excludes p.amount < 0)
		return paid.length === 0
			? 0
			: Math.round(paid.reduce((s, p) => s + p.amount, 0) / paid.length);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [payouts]);
	const lastBatchAt = useMemo(() => {
		const paid = payouts.filter((p) => p.status === "paid" && p.paidAt != null);
		return paid.length === 0
			? null
			: paid.reduce((t, p) => Math.max(t, new Date(p.paidAt!).getTime()), 0);
	}, [payouts]);

	const kpis = [
		{
			label: "Disbursed (This Month)",
			value: isLoading ? null : formatPrice(disbursedThisMonth, "MYR"),
		},
		{
			label: "Pending Recipients",
			value: isLoading ? null : String(pendingCount),
		},
		{
			label: "Avg Payout",
			value: isLoading
				? null
				: avgPayout > 0
					? formatPrice(avgPayout, "MYR")
					: "—",
		},
		{
			label: "Last Batch",
			value: isLoading
				? null
				: lastBatchAt
					? formatRelativeDate(new Date(lastBatchAt))
					: "—",
		},
	];

	return (
		<div className="px-6 py-6">
			{/* KPI band — matches liability tab */}
			<div className="mb-4 grid grid-cols-4 gap-4">
				{kpis.map((kpi) => (
					<div
						key={kpi.label}
						className="rounded-2xl border border-[#e5e5e5] bg-white px-5 py-4"
					>
						<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							{kpi.label}
						</div>
						{kpi.value === null ? (
							<div className="mt-2 h-7 w-28 animate-pulse rounded bg-[#e5e5e5]" />
						) : (
							<div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0a0a0a]">
								{kpi.value}
							</div>
						)}
					</div>
				))}
			</div>

			{/* Main card */}
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				{/* Toolbar */}
				<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
					<span className="text-sm font-semibold text-[#0a0a0a]">
						Payout Records
					</span>
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
										activeSubTab === id
											? "bg-[#0a0a0a] text-white"
											: "text-[#737373] hover:text-[#0a0a0a]",
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
						<AllPayoutsTable
							payouts={payouts}
							organizationId={organizationId}
							canProcess={canRunBatch}
						/>
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
