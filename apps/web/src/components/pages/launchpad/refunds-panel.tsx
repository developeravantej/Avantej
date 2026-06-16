import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";

type RefundStatus = "pending" | "approved" | "processed" | "rejected" | "all";
type RefundMethod = "cash" | "card_reversal" | "bank_transfer" | "store_credit";

const STATUS_TABS: { id: RefundStatus; label: string }[] = [
	{ id: "pending", label: "Pending" },
	{ id: "approved", label: "Approved" },
	{ id: "processed", label: "Processed" },
	{ id: "rejected", label: "Rejected" },
	{ id: "all", label: "All" },
];

const METHODS: { id: RefundMethod; label: string }[] = [
	{ id: "cash", label: "Cash" },
	{ id: "card_reversal", label: "Card reversal" },
	{ id: "bank_transfer", label: "Bank transfer" },
	{ id: "store_credit", label: "Store credit" },
];

const TH =
	"px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]";
const TD = "px-4 py-3 text-sm text-[#0a0a0a] align-top";

const STATUS_STYLES: Record<string, string> = {
	pending: "bg-amber-100 text-amber-700",
	approved: "bg-blue-100 text-blue-700",
	processed: "bg-emerald-100 text-emerald-700",
	rejected: "bg-rose-100 text-rose-700",
	cancelled: "bg-slate-100 text-slate-600",
};

function StatusPill({ status }: { status: string }) {
	return (
		<span
			className={cn(
				"inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
				STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600",
			)}
		>
			{status}
		</span>
	);
}

function fmtDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	const d = new Date(value);
	return Number.isNaN(d.getTime())
		? "—"
		: d.toLocaleDateString("en-MY", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			});
}

export function RefundsPanel({ organizationId }: { organizationId: string }) {
	const { hasPermission } = useUserContext();
	const canReview = hasPermission("refund_management:approve");
	const canProcess = hasPermission("refund_management:process");
	const canReadSales = hasPermission("sales:read");

	const [view, setView] = useState<"refunds" | "cancellations">("refunds");
	const [status, setStatus] = useState<RefundStatus>("pending");

	// Reject dialog (reviewNotes required server-side).
	const [rejectTarget, setRejectTarget] = useState<{
		id: string;
		refundNumber: string;
	} | null>(null);
	const [rejectNotes, setRejectNotes] = useState("");

	// Process dialog (method required).
	const [processTarget, setProcessTarget] = useState<{
		id: string;
		refundNumber: string;
	} | null>(null);
	const [processMethod, setProcessMethod] = useState<RefundMethod>("cash");
	const [processReference, setProcessReference] = useState("");

	const refundsQuery = useQuery({
		...orpc.refunds.list.queryOptions({
			input: { organizationId, status, limit: 100 },
		}),
		enabled: view === "refunds",
		staleTime: 30_000,
	});

	const cancellationsQuery = useQuery({
		...orpc.cancelledSales.list.queryOptions({
			input: { organizationId, limit: 100 },
		}),
		enabled: view === "cancellations" && canReadSales,
		staleTime: 30_000,
	});

	const invalidateRefunds = [orpc.refunds.list.key()];

	const approveMutation = useApiMutation({
		mutationFn: (id: string) => client.refunds.approve({ organizationId, id }),
		successMessage: "Refund approved",
		invalidate: invalidateRefunds,
	});

	const rejectMutation = useApiMutation({
		mutationFn: (input: { id: string; reviewNotes: string }) =>
			client.refunds.reject({ organizationId, ...input }),
		successMessage: "Refund rejected",
		invalidate: invalidateRefunds,
		onSuccess: () => {
			setRejectTarget(null);
			setRejectNotes("");
		},
	});

	const processMutation = useApiMutation({
		mutationFn: (input: {
			id: string;
			refundMethod: RefundMethod;
			refundReference?: string;
		}) => client.refunds.process({ organizationId, ...input }),
		successMessage: "Refund marked as processed",
		invalidate: invalidateRefunds,
		onSuccess: () => {
			setProcessTarget(null);
			setProcessReference("");
			setProcessMethod("cash");
		},
	});

	const isMutating =
		approveMutation.isPending ||
		rejectMutation.isPending ||
		processMutation.isPending;

	return (
		<div className="flex h-full min-h-[460px] flex-col">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-lg font-semibold tracking-tight">
						Refunds &amp; Cancellations
					</h2>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Review refund requests and look up cancelled sales.
					</p>
				</div>
				{/* View toggle */}
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

			{view === "refunds" ? (
				<>
					{/* Status sub-filter */}
					<div className="mt-4 flex flex-wrap gap-1.5">
						{STATUS_TABS.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => setStatus(t.id)}
								className={cn(
									"rounded-full border px-3 py-1 text-xs font-semibold transition",
									status === t.id
										? "border-primary bg-primary/5 text-primary"
										: "border-[#e8ebf0] text-muted-foreground hover:bg-slate-50",
								)}
							>
								{t.label}
							</button>
						))}
					</div>

					<div className="mt-4 flex-1 overflow-auto rounded-xl border border-[#e8ebf0]">
						<table className="w-full border-collapse">
							<thead className="sticky top-0 bg-[#fafbfc]">
								<tr className="border-b border-[#e8ebf0]">
									<th className={TH}>Refund</th>
									<th className={TH}>Customer</th>
									<th className={cn(TH, "text-right")}>Amount</th>
									<th className={TH}>Reason</th>
									<th className={TH}>Status</th>
									<th className={TH}>Requested</th>
									<th className={cn(TH, "text-right")}>Actions</th>
								</tr>
							</thead>
							<tbody>
								{refundsQuery.isLoading ? (
									<tr>
										<td className={cn(TD, "text-muted-foreground")} colSpan={7}>
											Loading refunds…
										</td>
									</tr>
								) : refundsQuery.error ? (
									<tr>
										<td className={cn(TD, "text-rose-600")} colSpan={7}>
											{refundsQuery.error.message}
										</td>
									</tr>
								) : (refundsQuery.data?.rows.length ?? 0) === 0 ? (
									<tr>
										<td className={cn(TD, "text-muted-foreground")} colSpan={7}>
											No {status === "all" ? "" : status} refunds.
										</td>
									</tr>
								) : (
									refundsQuery.data?.rows.map((r) => (
										<tr
											key={r.id}
											className="border-b border-[#f0f2f5] last:border-0 hover:bg-slate-50/60"
										>
											<td className={cn(TD, "font-medium tabular-nums")}>
												{r.refundNumber}
												{r.salesOrderNumber ? (
													<span className="block text-xs text-muted-foreground">
														{r.salesOrderNumber}
													</span>
												) : null}
											</td>
											<td className={TD}>{r.customerName}</td>
											<td className={cn(TD, "text-right tabular-nums")}>
												{formatPrice(r.amountCents)}
											</td>
											<td className={cn(TD, "max-w-[220px]")}>
												<span className="line-clamp-2 text-muted-foreground">
													{r.reason}
												</span>
											</td>
											<td className={TD}>
												<StatusPill status={r.status} />
											</td>
											<td className={cn(TD, "whitespace-nowrap")}>
												{fmtDate(r.requestedAt)}
												{r.requestedByName ? (
													<span className="block text-xs text-muted-foreground">
														{r.requestedByName}
													</span>
												) : null}
											</td>
											<td className={cn(TD, "text-right")}>
												<div className="flex justify-end gap-2">
													{r.status === "pending" && canReview ? (
														<>
															<Button
																size="sm"
																variant="outline"
																disabled={isMutating}
																onClick={() => approveMutation.mutate(r.id)}
															>
																Approve
															</Button>
															<Button
																size="sm"
																variant="ghost"
																className="text-rose-600 hover:text-rose-700"
																disabled={isMutating}
																onClick={() =>
																	setRejectTarget({
																		id: r.id,
																		refundNumber: r.refundNumber,
																	})
																}
															>
																Reject
															</Button>
														</>
													) : r.status === "approved" && canProcess ? (
														<Button
															size="sm"
															variant="outline"
															disabled={isMutating}
															onClick={() =>
																setProcessTarget({
																	id: r.id,
																	refundNumber: r.refundNumber,
																})
															}
														>
															Process
														</Button>
													) : (
														<span className="text-xs text-muted-foreground">
															—
														</span>
													)}
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				</>
			) : (
				<div className="mt-4 flex-1 overflow-auto rounded-xl border border-[#e8ebf0]">
					{!canReadSales ? (
						<div className="p-6 text-sm text-muted-foreground">
							You don&apos;t have permission to view cancelled sales.
						</div>
					) : (
						<table className="w-full border-collapse">
							<thead className="sticky top-0 bg-[#fafbfc]">
								<tr className="border-b border-[#e8ebf0]">
									<th className={TH}>Cancellation</th>
									<th className={TH}>Customer</th>
									<th className={cn(TH, "text-right")}>Amount</th>
									<th className={TH}>Reason</th>
									<th className={TH}>Date</th>
								</tr>
							</thead>
							<tbody>
								{cancellationsQuery.isLoading ? (
									<tr>
										<td className={cn(TD, "text-muted-foreground")} colSpan={5}>
											Loading cancellations…
										</td>
									</tr>
								) : cancellationsQuery.error ? (
									<tr>
										<td className={cn(TD, "text-rose-600")} colSpan={5}>
											{cancellationsQuery.error.message}
										</td>
									</tr>
								) : (cancellationsQuery.data?.rows.length ?? 0) === 0 ? (
									<tr>
										<td className={cn(TD, "text-muted-foreground")} colSpan={5}>
											No cancelled sales.
										</td>
									</tr>
								) : (
									cancellationsQuery.data?.rows.map((c) => (
										<tr
											key={c.id}
											className="border-b border-[#f0f2f5] last:border-0 hover:bg-slate-50/60"
										>
											<td className={cn(TD, "font-medium tabular-nums")}>
												{c.cancellationNumber ?? "—"}
											</td>
											<td className={TD}>
												{c.customerName}
												{c.repeatOffenderCount > 1 ? (
													<span className="ml-1.5 inline-flex rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
														{c.repeatOffenderCount}× / 30d
													</span>
												) : null}
											</td>
											<td className={cn(TD, "text-right tabular-nums")}>
												{formatPrice(c.cancelledAmount)}
											</td>
											<td className={cn(TD, "max-w-[240px]")}>
												<span className="line-clamp-2 text-muted-foreground">
													{c.cancellationReason ?? "—"}
												</span>
											</td>
											<td className={cn(TD, "whitespace-nowrap")}>
												{fmtDate(c.cancellationDate)}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					)}
				</div>
			)}

			{/* Reject dialog */}
			<Dialog
				open={!!rejectTarget}
				onOpenChange={(open) => {
					if (!open) {
						setRejectTarget(null);
						setRejectNotes("");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Reject refund {rejectTarget?.refundNumber}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-2">
						<label
							htmlFor="reject-notes"
							className="text-sm font-medium text-foreground"
						>
							Reason for rejection
						</label>
						<Textarea
							id="reject-notes"
							value={rejectNotes}
							onChange={(e) => setRejectNotes(e.target.value)}
							placeholder="Explain why this refund is being rejected (required)."
							rows={4}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => {
								setRejectTarget(null);
								setRejectNotes("");
							}}
						>
							Cancel
						</Button>
						<Button
							className="bg-rose-600 hover:bg-rose-700"
							disabled={
								rejectNotes.trim().length === 0 || rejectMutation.isPending
							}
							onClick={() => {
								if (!rejectTarget) return;
								rejectMutation.mutate({
									id: rejectTarget.id,
									reviewNotes: rejectNotes.trim(),
								});
							}}
						>
							Reject refund
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Process dialog */}
			<Dialog
				open={!!processTarget}
				onOpenChange={(open) => {
					if (!open) {
						setProcessTarget(null);
						setProcessReference("");
						setProcessMethod("cash");
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							Process refund {processTarget?.refundNumber}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="space-y-1.5">
							<span className="text-sm font-medium text-foreground">
								Refund method
							</span>
							<Select
								value={processMethod}
								onValueChange={(v) => setProcessMethod(v as RefundMethod)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{METHODS.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<label
								htmlFor="process-ref"
								className="text-sm font-medium text-foreground"
							>
								Reference{" "}
								<span className="font-normal text-muted-foreground">
									(optional)
								</span>
							</label>
							<Input
								id="process-ref"
								value={processReference}
								onChange={(e) => setProcessReference(e.target.value)}
								placeholder="Bank ref, card auth, receipt no.…"
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							This records the refund as paid out. It does not trigger any
							payment gateway.
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => {
								setProcessTarget(null);
								setProcessReference("");
								setProcessMethod("cash");
							}}
						>
							Cancel
						</Button>
						<Button
							disabled={processMutation.isPending}
							onClick={() => {
								if (!processTarget) return;
								processMutation.mutate({
									id: processTarget.id,
									refundMethod: processMethod,
									refundReference: processReference.trim() || undefined,
								});
							}}
						>
							Mark processed
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
