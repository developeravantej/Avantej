import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { rmToCents } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type ContestedRow = {
	id: string;
	staffId: string;
	staffName: string;
	amountCents: number;
	note: string | null;
	contestedCategory: string | null;
	contestedReason: string | null;
	contestedAt: string | null;
	contestedFromStatus: string | null;
	roleType: string | null;
};

type ResolveAction = "uphold" | "void" | "adjust";

type DialogState =
	| { open: false }
	| { open: true; action: ResolveAction; row: ContestedRow };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
	wrong_amount: "Amount is wrong",
	wrong_staff: "Wrong staff member",
	should_not_earn: "Should not have earned",
	missing_split: "A split is missing",
	other: "Other",
};

function formatDate(value: string | null): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

// ─── Resolve dialog ───────────────────────────────────────────────────────────

function ResolveDialog({
	state,
	onClose,
	onConfirm,
	isPending,
}: {
	state: DialogState;
	onClose: () => void;
	onConfirm: (note: string, adjustmentRm: string) => void;
	isPending: boolean;
}) {
	const [note, setNote] = useState("");
	const [adjustmentRm, setAdjustmentRm] = useState("");

	function handleClose() {
		setNote("");
		setAdjustmentRm("");
		onClose();
	}

	if (!state.open) return null;

	const { action, row } = state;
	const isAdjust = action === "adjust";
	const adjustInvalid =
		isAdjust &&
		(!Number.isFinite(Number.parseFloat(adjustmentRm)) ||
			Number.parseFloat(adjustmentRm) === 0);

	const titles: Record<ResolveAction, string> = {
		uphold: "Uphold dispute?",
		void: "Void this commission?",
		adjust: "Adjust commission",
	};
	const descriptions: Record<ResolveAction, string> = {
		uphold:
			"Restore the split to its previous status. The staff member's commission stands as originally calculated.",
		void: "Void this commission split. The staff member will not be paid for it.",
		adjust:
			"Void the disputed split and create a corrected manual adjustment for the staff member.",
	};

	return (
		<Dialog
			open={state.open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						RESOLVE DISPUTE
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{titles[action]}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{descriptions[action]}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 space-y-4">
					<div className="rounded-lg border border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-sm space-y-1">
						<div className="flex items-center justify-between">
							<span className="font-medium text-[#0a0a0a]">
								{row.staffName}
							</span>
							<span className="font-mono font-semibold tabular-nums text-[#0a0a0a]">
								{formatPrice(row.amountCents, "MYR")}
							</span>
						</div>
						{row.contestedCategory && (
							<p className="text-xs text-[#737373]">
								{CATEGORY_LABELS[row.contestedCategory] ??
									row.contestedCategory}
							</p>
						)}
						{row.contestedReason && (
							<p className="text-xs text-[#4a4f51] italic">
								“{row.contestedReason}”
							</p>
						)}
					</div>

					{isAdjust && (
						<div className="space-y-2">
							<Label htmlFor="adjust-amount">
								Corrected amount (RM) <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="adjust-amount"
								type="number"
								step="0.01"
								placeholder="0.00 (negative for a clawback)"
								value={adjustmentRm}
								onChange={(e) => setAdjustmentRm(e.target.value)}
							/>
							<p className="text-xs text-[#737373]">
								Creates a new manual split for this amount. Large amounts enter
								pending review.
							</p>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="resolve-note">Note (optional)</Label>
						<Textarea
							id="resolve-note"
							rows={2}
							placeholder="Add a note for the audit trail…"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						className={
							action === "uphold"
								? "bg-[#15803d] text-white hover:bg-[#166534]"
								: action === "void"
									? "bg-red-600 hover:bg-red-700 text-white"
									: "bg-[#0a0a0a] text-white hover:bg-[#262626]"
						}
						onClick={() => onConfirm(note.trim(), adjustmentRm)}
						disabled={isPending || adjustInvalid}
					>
						{isPending
							? "Working…"
							: action === "uphold"
								? "Uphold"
								: action === "void"
									? "Void"
									: "Adjust"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DisputesTab() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canResolve = hasPermission("commission_management:approve");

	const apiInput = { organizationId: organizationId!, limit: 50 } as const;

	const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: orpc.commissionSplits.listContested.queryOptions({
				input: apiInput,
			}).queryKey,
			queryFn: ({
				pageParam,
			}: {
				pageParam: { contestedAt: string; id: string } | undefined;
			}) =>
				client.commissionSplits.listContested({
					...apiInput,
					cursor: pageParam,
				}),
			initialPageParam: undefined as
				| { contestedAt: string; id: string }
				| undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			enabled: !!organizationId,
		});

	const rows: ContestedRow[] = (data?.pages.flatMap((p) => p.rows) ?? []).map(
		(r) => ({
			id: r.id,
			staffId: r.staffId,
			staffName: r.staffName,
			amountCents: r.amountCents,
			note: r.note,
			contestedCategory: r.contestedCategory,
			contestedReason: r.contestedReason,
			contestedAt: r.contestedAt,
			contestedFromStatus: r.contestedFromStatus,
			roleType: r.roleType,
		}),
	);
	const totalCount = data?.pages[0]?.total ?? 0;

	const [dialogState, setDialogState] = useState<DialogState>({ open: false });

	const { mutate: resolve, isPending } = useApiMutation({
		mutationFn: ({
			id,
			action,
			note,
			adjustmentRm,
		}: {
			id: string;
			action: ResolveAction;
			note: string;
			adjustmentRm: string;
		}) =>
			action === "adjust"
				? client.commissionSplits.resolveDispute({
						organizationId: organizationId!,
						splitId: id,
						action: "adjust",
						note: note || undefined,
						adjustmentAmountCents: rmToCents(Number.parseFloat(adjustmentRm)),
					})
				: client.commissionSplits.resolveDispute({
						organizationId: organizationId!,
						splitId: id,
						action,
						note: note || undefined,
					}),
		successMessage: (_d, variables) =>
			variables.action === "uphold"
				? "Dispute upheld — commission restored."
				: variables.action === "void"
					? "Commission voided."
					: "Commission adjusted.",
		errorMessage: (err) => err.message || "Failed to resolve dispute.",
		invalidate: [
			orpc.commissionSplits.listContested.key(),
			orpc.commissionSplits.listPendingReview.key(),
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.liabilitySummary.key(),
		],
		onSuccess: () => setDialogState({ open: false }),
	});

	function handleConfirm(note: string, adjustmentRm: string) {
		if (!dialogState.open) return;
		resolve({
			id: dialogState.row.id,
			action: dialogState.action,
			note,
			adjustmentRm,
		});
	}

	// ── Guards ───────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-[#6b7170]">
				Select an organization to view disputes.
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

	return (
		<div className="px-6 pb-6">
			<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
				<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3">
					<span className="text-sm font-semibold text-[#0a0a0a]">
						Disputed Commissions
					</span>
					{totalCount > 0 && (
						<span className="text-xs text-[#737373]">
							{totalCount} disputed
						</span>
					)}
				</div>

				{rows.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center gap-1 py-16">
						<p className="text-sm font-medium text-[#0a0a0a]">
							No disputed commissions
						</p>
						<p className="text-xs text-[#737373]">
							When a staff member disputes a commission it will appear here.
						</p>
					</div>
				) : (
					<div className="overflow-auto">
						<table className="w-full">
							<thead>
								<tr>
									{["Staff", "Amount", "Reason", "Disputed", "Actions"].map(
										(h) => (
											<th
												key={h}
												className={`border-b border-[#e5e5e5] px-[14px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[.06em] whitespace-nowrap text-[#8a8f91] ${
													h === "Amount" || h === "Actions" ? "text-right" : ""
												}`}
											>
												{h}
											</th>
										),
									)}
								</tr>
							</thead>
							<tbody>
								{rows.map((row) => (
									<tr
										key={row.id}
										className="border-b border-[#f7f5ee] hover:bg-[#fcfaf6] last:border-0"
									>
										<td className="px-[14px] py-[11px] align-middle">
											<span className="text-sm font-medium text-[#0a0a0a]">
												{row.staffName}
											</span>
										</td>
										<td className="px-[14px] py-[11px] text-right align-middle">
											<span className="font-mono text-sm font-semibold tabular-nums text-[#0a0a0a]">
												{formatPrice(row.amountCents, "MYR")}
											</span>
										</td>
										<td className="px-[14px] py-[11px] align-middle max-w-[280px]">
											<div className="text-sm text-[#0a0a0a]">
												{row.contestedCategory
													? (CATEGORY_LABELS[row.contestedCategory] ??
														row.contestedCategory)
													: "—"}
											</div>
											{row.contestedReason && (
												<div className="text-xs text-[#737373] line-clamp-2">
													{row.contestedReason}
												</div>
											)}
										</td>
										<td className="px-[14px] py-[11px] align-middle whitespace-nowrap">
											<span className="text-sm text-[#4a4f51]">
												{formatDate(row.contestedAt)}
											</span>
										</td>
										<td className="px-[14px] py-[11px] pr-4 text-right align-middle">
											{canResolve ? (
												<div className="inline-flex items-center gap-2">
													<button
														type="button"
														className="inline-flex items-center rounded-md border border-[#bbf7d0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#15803d] transition-colors hover:bg-[#f0fdf4] disabled:opacity-40"
														onClick={() =>
															setDialogState({
																open: true,
																action: "uphold",
																row,
															})
														}
														disabled={isPending}
													>
														Uphold
													</button>
													<button
														type="button"
														className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-40"
														onClick={() =>
															setDialogState({
																open: true,
																action: "adjust",
																row,
															})
														}
														disabled={isPending}
													>
														Adjust
													</button>
													<button
														type="button"
														className="inline-flex items-center rounded-md border border-[#fecaca] bg-white px-2.5 py-1 text-[12px] font-medium text-[#b91c1c] transition-colors hover:bg-[#fef2f2] disabled:opacity-40"
														onClick={() =>
															setDialogState({
																open: true,
																action: "void",
																row,
															})
														}
														disabled={isPending}
													>
														Void
													</button>
												</div>
											) : (
												<span className="text-xs text-[#8a8f91]">
													View only
												</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

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
			</div>

			<ResolveDialog
				state={dialogState}
				onClose={() => setDialogState({ open: false })}
				onConfirm={handleConfirm}
				isPending={isPending}
			/>
		</div>
	);
}
