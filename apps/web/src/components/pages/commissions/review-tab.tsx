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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

// Local alias — mirrors @avantej-core/types (dist not rebuilt yet)
type CommissionRoleType = "trainer" | "sales" | "marketing" | "referrer";

// ─── Types ────────────────────────────────────────────────────────────────────

type PendingReviewRow = {
	id: string;
	staffId: string;
	staffName: string | null;
	calculatedAmount: number;
	notes: string | null;
	createdBy: string | null;
	createdAt: string | Date;
	/** NULL = Delivery (legacy) — originated before commission tracks. */
	roleType: string | null;
	trackId: string | null;
};

type ReviewAction = "approve" | "reject";

type DialogState =
	| { open: false }
	| { open: true; action: ReviewAction; row: PendingReviewRow };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_TYPE_LABELS: Record<CommissionRoleType | "legacy", string> = {
	trainer: "Delivery commissions",
	sales: "Sales commissions",
	marketing: "Marketing commissions",
	referrer: "Referral commissions",
	legacy: "Delivery (legacy)",
};

/** Normalise a nullable roleType to a display group key. NULL → "legacy" */
function toGroupKey(roleType: string | null): CommissionRoleType | "legacy" {
	if (!roleType) return "legacy";
	return roleType as CommissionRoleType;
}

function groupRows(rows: PendingReviewRow[]): Array<{
	key: CommissionRoleType | "legacy";
	label: string;
	rows: PendingReviewRow[];
}> {
	const map = new Map<CommissionRoleType | "legacy", PendingReviewRow[]>();
	for (const row of rows) {
		const key = toGroupKey(row.roleType);
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(row);
	}
	// Fixed display order
	const ORDER: Array<CommissionRoleType | "legacy"> = [
		"trainer",
		"legacy",
		"sales",
		"marketing",
		"referrer",
	];
	return ORDER.filter((k) => map.has(k)).map((k) => ({
		key: k,
		label: ROLE_TYPE_LABELS[k],
		rows: map.get(k)!,
	}));
}

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
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						COMMISSION SUMMARY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{isApprove ? "Approve adjustment?" : "Reject adjustment?"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{isApprove
							? "Confirm approval of this commission adjustment."
							: "Confirm rejection of this commission adjustment."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
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
							{state.row.roleType && (
								<p className="mt-1 text-xs text-[#737373]">
									{ROLE_TYPE_LABELS[toGroupKey(state.row.roleType)]}
								</p>
							)}
						</div>

						{/* Reason / note textarea */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="review-reason">
								{isApprove ? (
									"Note (optional)"
								) : (
									<>
										Reason for rejection{" "}
										<span className="text-rose-600">*</span>
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
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
							className="bg-red-600 hover:bg-red-700 text-white"
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

// ─── Row table (shared between groups) ────────────────────────────────────────

function ReviewRowTable({
	rows,
	isResolving,
	onOpenDialog,
}: {
	rows: PendingReviewRow[];
	isResolving: boolean;
	onOpenDialog: (action: ReviewAction, row: PendingReviewRow) => void;
}) {
	return (
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
					{rows.map((row) => {
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
											onClick={() => onOpenDialog("approve", row)}
											disabled={isResolving}
										>
											Approve
										</button>
										<button
											type="button"
											className="inline-flex items-center rounded-md border border-[#fecaca] bg-white px-2.5 py-1 text-[12px] font-medium text-[#b91c1c] transition-colors hover:bg-[#fef2f2] disabled:opacity-40"
											onClick={() => onOpenDialog("reject", row)}
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
	);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ReviewTab() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("commission_management:read");

	// ── Filter state ───────────────────────────────────────────────────────────
	// "all" = no filter; other values are roleType strings or "legacy" (NULL roleType)
	const [roleFilter, setRoleFilter] = useState<string>("all");

	// Map our UI filter value → API filter params
	const apiRoleFilter =
		roleFilter === "all"
			? null
			: roleFilter === "legacy"
				? null // legacy = NULL roleType; we pass trackId=null implicitly
				: roleFilter;

	// For "legacy" we need to detect and filter client-side since we can't pass "IS NULL" via API
	// The API accepts roleType?: string | null — null means "no filter", we pass undefined for "all"
	// For legacy, pass roleType as null explicitly (API returns all, we filter client side)
	// Actually we track "legacy" as null roleType; we can't send "IS NULL" sql easily — instead
	// when user picks "legacy" we pass no roleType filter and group-filter client side.
	// But the backend CAN'T distinguish "give me rows with NULL roleType". So: when roleFilter==="legacy"
	// we fetch unfiltered and let the client grouping handle it.
	const apiInput = {
		organizationId: organizationId!,
		limit: 50,
		roleType:
			roleFilter !== "all" && roleFilter !== "legacy" ? roleFilter : undefined,
	} as const;

	// ── Infinite query for cursor pagination ───────────────────────────────────
	const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useInfiniteQuery({
			queryKey: orpc.commissionSplits.listPendingReview.queryOptions({
				input: apiInput,
			}).queryKey,
			queryFn: ({
				pageParam,
			}: {
				pageParam: { earnedAt: string; id: string } | undefined;
			}) =>
				client.commissionSplits.listPendingReview({
					...apiInput,
					cursor: pageParam,
				}),
			initialPageParam: undefined as
				| { earnedAt: string; id: string }
				| undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
			enabled: !!organizationId && canRead,
		});

	// Flatten pages — rows come back as the service PendingReviewRow shape
	const rawRows = data?.pages.flatMap((page) => page.rows) ?? [];

	// Remap service row fields to component shape (service uses amountCents, createdByName)
	// `r` infers from the service `PendingReviewRow` (amountCents / note / createdByName);
	// remap to this component's local PendingReviewRow shape. Direct field mapping —
	// the previous `?? r.calculatedAmount/notes/createdBy` fallbacks referenced
	// properties that don't exist on the service row (would fail type-check once typed).
	const allRows: PendingReviewRow[] = rawRows.map((r) => ({
		id: r.id,
		staffId: r.staffId,
		staffName: r.staffName,
		calculatedAmount: r.amountCents,
		notes: r.note,
		createdBy: r.createdByName,
		createdAt: r.createdAt,
		roleType: r.roleType ?? null,
		trackId: r.trackId ?? null,
	}));

	const totalCount = data?.pages[0]?.total ?? 0;

	// Client-side filter for "legacy" (NULL roleType)
	const filteredRows =
		roleFilter === "legacy"
			? allRows.filter((r) => r.roleType == null)
			: allRows;

	// Group for display
	const groups = groupRows(filteredRows);

	// ── Dialog state ───────────────────────────────────────────────────────────
	const [dialogState, setDialogState] = useState<DialogState>({ open: false });

	// ── Mutation ───────────────────────────────────────────────────────────────
	const { mutate: resolveReview, isPending: isResolving } = useApiMutation({
		mutationFn: ({
			id,
			action,
			reason,
		}: {
			id: string;
			action: ReviewAction;
			reason: string;
		}) =>
			client.commissionSplits.resolveReview(
				action === "approve"
					? {
							organizationId: organizationId!,
							id,
							action: "approve",
							reason: reason || undefined,
						}
					: {
							organizationId: organizationId!,
							id,
							action: "reject",
							reason: reason || "rejected",
						},
			),
		successMessage: (_data, variables) =>
			`Adjustment ${
				variables.action === "approve" ? "approved" : "rejected"
			} successfully.`,
		errorMessage: (err) => err.message || "Failed to process review.",
		invalidate: [
			orpc.commissionSplits.listLedger.key(),
			orpc.commissionSplits.listPendingReview.key(),
		],
		onSuccess: () => setDialogState({ open: false }),
	});

	function openDialog(action: ReviewAction, row: PendingReviewRow) {
		setDialogState({ open: true, action, row });
	}

	function closeDialog() {
		setDialogState({ open: false });
	}

	function handleConfirm(reason: string) {
		if (!dialogState.open) return;
		resolveReview({
			id: dialogState.row.id,
			action: dialogState.action,
			reason,
		});
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
				<div className="flex items-center justify-between border-b border-[#e5e5e5] px-6 py-3 gap-3 flex-wrap">
					<span className="text-sm font-semibold text-[#0a0a0a]">
						Pending Review
					</span>
					<div className="flex items-center gap-3 flex-wrap">
						{/* Role/track filter */}
						<div className="flex items-center gap-2">
							<Label
								htmlFor="role-filter"
								className="text-xs font-medium text-[#737373] whitespace-nowrap"
							>
								Filter by type
							</Label>
							<Select value={roleFilter} onValueChange={setRoleFilter}>
								<SelectTrigger
									id="role-filter"
									className="h-8 w-44 text-xs border-[#e5e5e5]"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All types</SelectItem>
									<SelectItem value="legacy">Delivery (legacy)</SelectItem>
									<SelectItem value="trainer">Delivery</SelectItem>
									<SelectItem value="sales">Sales</SelectItem>
									<SelectItem value="marketing">Marketing</SelectItem>
									<SelectItem value="referrer">Referral</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{totalCount > 0 && (
							<span className="text-xs text-[#737373] whitespace-nowrap">
								{totalCount} pending
							</span>
						)}
					</div>
				</div>

				{/* Content */}
				{filteredRows.length === 0 ? (
					<div className="flex min-h-64 flex-col items-center justify-center gap-1 py-16">
						<p className="text-sm font-medium text-[#0a0a0a]">
							No adjustments pending review
						</p>
						<p className="text-xs text-[#737373]">
							{roleFilter !== "all"
								? "Try changing the filter above."
								: "All commission adjustments have been reviewed."}
						</p>
					</div>
				) : (
					<div>
						{groups.map((group, groupIdx) => (
							<div key={group.key}>
								{/* Group header */}
								<div
									className={`flex items-center justify-between px-6 py-2.5 ${groupIdx > 0 ? "border-t border-[#f0eeea]" : ""} bg-[#faf9f7]`}
								>
									<span className="text-[11px] font-bold uppercase tracking-widest text-[#737373]">
										{group.label}
									</span>
									<span className="inline-flex items-center rounded-full bg-[#f0eeea] px-2 py-0.5 text-[10px] font-semibold text-[#6b7170]">
										{group.rows.length}
									</span>
								</div>

								{/* Rows table */}
								<ReviewRowTable
									rows={group.rows}
									isResolving={isResolving}
									onOpenDialog={openDialog}
								/>
							</div>
						))}
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
						{filteredRows.length} adjustment
						{filteredRows.length !== 1 ? "s" : ""} shown
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
