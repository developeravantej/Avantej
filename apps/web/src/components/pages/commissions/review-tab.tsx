import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingReviewRow = {
	id: string;
	staffId: string;
	staffName: string | null;
	calculatedAmount: number;
	notes: string | null;
	createdBy: string | null;
	createdAt: string | Date;
};

type ReviewAction = "approve" | "reject";

type DialogState =
	| { open: false }
	| { open: true; action: ReviewAction; row: PendingReviewRow };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function formatAmount(amountCents: number): {
	display: string;
	isNegative: boolean;
} {
	const isNegative = amountCents < 0;
	const display = `RM ${(Math.abs(amountCents) / 100).toFixed(2)}`;
	return { display: isNegative ? `-${display}` : display, isNegative };
}

// ─── Review Dialog ────────────────────────────────────────────────────────────

function ReviewDialog({
	state,
	onClose,
	onConfirm,
	isPending,
}: {
	state: DialogState;
	onClose: () => void;
	onConfirm: (reason: string) => void;
	isPending: boolean;
}) {
	const [reason, setReason] = useState("");

	function handleClose() {
		setReason("");
		onClose();
	}

	function handleConfirm() {
		onConfirm(reason.trim());
	}

	if (!state.open) return null;

	const isApprove = state.action === "approve";
	const { display: amountDisplay, isNegative } = formatAmount(
		state.row.calculatedAmount,
	);

	return (
		<Dialog
			open={state.open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						{isApprove ? "Approve adjustment?" : "Reject adjustment?"}
					</DialogTitle>
					<DialogDescription>
						{isApprove ? "Confirm approval of this commission adjustment." : "Confirm rejection of this commission adjustment."}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-1">
					{/* Summary */}
					<div className="rounded-lg border border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-sm">
						<div className="flex items-center justify-between">
							<span className="font-medium text-[#0a0a0a]">
								{state.row.staffName ?? "Unknown Staff"}
							</span>
							<span
								className={`font-mono font-semibold tabular-nums ${
									isNegative ? "text-red-600" : "text-[#0a0a0a]"
								}`}
							>
								{amountDisplay}
							</span>
						</div>
					</div>

					{/* Reason / note textarea */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="review-reason">
							{isApprove ? (
								"Note (optional)"
							) : (
								<>
									Reason for rejection{" "}
									<span className="text-destructive">*</span>
								</>
							)}
						</Label>
						<Textarea
							id="review-reason"
							rows={3}
							placeholder={
								isApprove
									? "Add an optional note…"
									: "Explain why this adjustment is being rejected…"
							}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					{isApprove ? (
						<Button
							className="bg-[#15803d] text-white hover:bg-[#166534]"
							onClick={handleConfirm}
							disabled={isPending}
						>
							{isPending ? "Approving…" : "Approve"}
						</Button>
					) : (
						<Button
							variant="destructive"
							onClick={handleConfirm}
							disabled={isPending || !reason.trim()}
						>
							{isPending ? "Rejecting…" : "Reject"}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReviewTab() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const canRead = hasPermission("commission_management:read");

	// ── Infinite query for cursor pagination ───────────────────────────────────
	const {
		data,
		isLoading,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useInfiniteQuery({
		queryKey: ["commissions", "pendingReview", organizationId],
		queryFn: ({ pageParam }: { pageParam: any }) =>
			client.commissionSplits.listPendingReview({
				organizationId: organizationId!,
				limit: 50,
				cursor: pageParam,
			} as any),
		initialPageParam: undefined as any,
		getNextPageParam: (lastPage: any) => lastPage.nextCursor ?? undefined,
		enabled: !!organizationId && canRead,
	});

	// Flatten pages into a single list
	const allRows: PendingReviewRow[] =
		(data?.pages.flatMap((page) => page.rows) ?? []) as any;
	const totalCount = data?.pages[0]?.total ?? 0;

	// ── Dialog state ───────────────────────────────────────────────────────────
	const [dialogState, setDialogState] = useState<DialogState>({ open: false });

	// ── Mutation ───────────────────────────────────────────────────────────────
	const { mutate: resolveReview, isPending: isResolving } = useMutation({
		mutationFn: ({
			id,
			action,
			reason,
		}: {
			id: string;
			action: ReviewAction;
			reason: string;
		}) =>
			client.commissionSplits.resolveReview({
				organizationId: organizationId!,
				id,
				action,
				reason: reason || undefined,
			} as any),
		onSuccess: (_data, variables) => {
			const label = variables.action === "approve" ? "approved" : "rejected";
			toast.success(`Adjustment ${label} successfully.`);
			// Invalidate relevant query keys
			queryClient.invalidateQueries({ queryKey: ["commissions"] });
			queryClient.invalidateQueries({
				queryKey: ["commissionSplits", "pendingReviewTotal"],
			});
			queryClient.invalidateQueries({
				queryKey: ["commissions", "pendingReview"],
			});
			setDialogState({ open: false });
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to process review.",
			);
		},
	});

	function openDialog(action: ReviewAction, row: PendingReviewRow) {
		setDialogState({ open: true, action, row });
	}

	function closeDialog() {
		setDialogState({ open: false });
	}

	function handleConfirm(reason: string) {
		if (!dialogState.open) return;
		resolveReview({ id: dialogState.row.id, action: dialogState.action, reason });
	}

	// ── Guards ─────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				Select an organization to view pending reviews.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to review commission adjustments.
					</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center text-sm text-[#6b7170]">
				Loading…
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<div className="px-6 pb-6">
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				{/* Toolbar */}
				<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
					<span className="text-sm font-semibold text-[#0a0a0a]">
						Pending Review
					</span>
					{totalCount > 0 && (
						<span className="text-xs text-[#737373]">
							{totalCount} adjustment{totalCount !== 1 ? "s" : ""} pending
						</span>
					)}
				</div>

				{/* Table */}
				{allRows.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center gap-1 py-16">
						<p className="text-sm font-medium text-[#0a0a0a]">
							No adjustments pending review
						</p>
						<p className="text-xs text-[#737373]">
							All commission adjustments have been reviewed.
						</p>
					</div>
				) : (
					<div className="overflow-auto">
						<table className="w-full">
							<thead>
								<tr>
									{[
										"Staff Name",
										"Amount",
										"Note",
										"Created By",
										"Date",
										"Actions",
									].map((h) => (
										<th
											key={h}
											className={`border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] whitespace-nowrap text-[#8a8f91] ${
												h === "Amount" ? "text-right" : ""
											} ${h === "Actions" ? "text-right" : ""}`}
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{allRows.map((row) => {
									const { display: amountDisplay, isNegative } = formatAmount(
										row.calculatedAmount,
									);
									return (
										<tr
											key={row.id}
											className="border-b border-[#f7f5ee] hover:bg-[#fcfaf6] last:border-0"
										>
											{/* Staff Name */}
											<td className="px-[14px] py-[11px] align-middle">
												<span className="text-sm font-medium text-[#0a0a0a]">
													{row.staffName ?? "—"}
												</span>
											</td>

											{/* Amount */}
											<td className="px-[14px] py-[11px] text-right align-middle">
												<span
													className={`font-mono text-sm font-semibold tabular-nums ${
														isNegative ? "text-red-600" : "text-[#0a0a0a]"
													}`}
												>
													{amountDisplay}
												</span>
											</td>

											{/* Note */}
											<td className="px-[14px] py-[11px] align-middle max-w-[220px]">
												{row.notes ? (
													<span className="text-sm text-[#4a4f51] line-clamp-2">
														{row.notes}
													</span>
												) : (
													<span className="text-sm text-[#8a8f91]">—</span>
												)}
											</td>

											{/* Created By */}
											<td className="px-[14px] py-[11px] align-middle">
												<span className="text-sm text-[#4a4f51]">
													{row.createdBy ?? "—"}
												</span>
											</td>

											{/* Date */}
											<td className="px-[14px] py-[11px] align-middle whitespace-nowrap">
												<span className="text-sm text-[#4a4f51]">
													{formatDate(row.createdAt)}
												</span>
											</td>

											{/* Actions */}
											<td className="px-[14px] py-[11px] pr-4 text-right align-middle">
												<div className="inline-flex items-center gap-2">
													<button
														type="button"
														className="inline-flex items-center rounded-md border border-[#bbf7d0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#15803d] transition-colors hover:bg-[#f0fdf4] disabled:opacity-40"
														onClick={() => openDialog("approve", row)}
														disabled={isResolving}
													>
														Approve
													</button>
													<button
														type="button"
														className="inline-flex items-center rounded-md border border-[#fecaca] bg-white px-2.5 py-1 text-[12px] font-medium text-[#b91c1c] transition-colors hover:bg-[#fef2f2] disabled:opacity-40"
														onClick={() => openDialog("reject", row)}
														disabled={isResolving}
													>
														Reject
													</button>
												</div>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}

				{/* Load more */}
				{hasNextPage && (
					<div className="flex items-center justify-center border-t border-[#e5e5e5] py-4">
						<button
							type="button"
							className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-[14px] py-[8px] text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-40"
							onClick={() => fetchNextPage()}
							disabled={isFetchingNextPage}
						>
							{isFetchingNextPage ? "Loading…" : "Load more"}
						</button>
					</div>
				)}

				{/* Footer */}
				<div className="flex items-center border-t border-[#e5e5e5] px-6 py-4">
					<span className="text-xs text-[#6b7170]">
						{allRows.length} adjustment{allRows.length !== 1 ? "s" : ""} shown
						{totalCount > allRows.length
							? ` · ${totalCount - allRows.length} more available`
							: ""}
					</span>
				</div>
			</div>

			{/* Review dialog */}
			<ReviewDialog
				state={dialogState}
				onClose={closeDialog}
				onConfirm={handleConfirm}
				isPending={isResolving}
			/>
		</div>
	);
}
