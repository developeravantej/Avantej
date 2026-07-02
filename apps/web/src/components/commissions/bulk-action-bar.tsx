import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MarkPaidDialog } from "@/components/commissions/mark-paid-dialog";
import { useApiMutation } from "@/hooks/useApiMutation";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = "all" | "pending" | "approved" | "paid" | "void";

interface BulkActionBarProps {
	selectedIds: string[];
	selectedRows?: { staffId: string; status: string }[];
	tab: ActiveTab;
	organizationId: string;
	canApprove: boolean;
	canProcess: boolean;
	onDone: () => void;
	totalAmountCents?: number;
}

// ─── Approve Confirmation Dialog ──────────────────────────────────────────────

function ApproveConfirmDialog({
	open,
	onOpenChange,
	count,
	onConfirm,
	isPending,
	totalAmountCents,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	count: number;
	onConfirm: () => void;
	isPending: boolean;
	totalAmountCents?: number;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						COMMISSION SUMMARY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Approve Commission Splits
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						You are about to approve {count} commission split
						{count !== 1 ? "s" : ""} totalling{" "}
						<span className="font-semibold">
							{formatPrice(totalAmountCents ?? 0, "MYR")}
						</span>
						. This will move them from Pending to Approved. Continue?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={onConfirm}
						disabled={isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isPending ? "Approving…" : "Approve"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Void Confirmation Dialog ─────────────────────────────────────────────────

function VoidConfirmDialog({
	open,
	onOpenChange,
	count,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	count: number;
	onConfirm: (reason: string) => void;
	isPending: boolean;
}) {
	const [reason, setReason] = useState("");

	function handleConfirm() {
		if (!reason.trim()) return;
		onConfirm(reason.trim());
	}

	function handleClose() {
		setReason("");
		onOpenChange(false);
	}

	return (
		<Dialog
			open={open}
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
						Void Commission Splits
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						You are about to void {count} commission split
						{count !== 1 ? "s" : ""}. Provide a required reason — this is
						recorded in the audit trail.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="void-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="void-reason"
								rows={3}
								placeholder="Explain why these splits are being voided…"
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
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={isPending || !reason.trim()}
						className="bg-red-600 hover:bg-red-700 text-white"
					>
						{isPending ? "Voiding…" : "Void Selected"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── BulkActionBar ────────────────────────────────────────────────────────────

export function BulkActionBar({
	selectedIds,
	selectedRows,
	tab,
	organizationId,
	canApprove,
	canProcess,
	onDone,
	totalAmountCents,
}: BulkActionBarProps) {
	const queryClient = useQueryClient();
	const count = selectedIds.length;

	// Canonical oRPC partial keys for every commission list these bulk actions
	// can move rows between (pending → approved → paid, or → void). The list
	// query lives in review-tab.tsx and is fetched via
	// `orpc.commissionSplits.listPendingReview.queryOptions(...)`, so a plain
	// `["commissions"]` key matches nothing — use the generated keys instead.
	const commissionListKeys = [
		orpc.commissionSplits.listPendingReview.key(),
		orpc.commissionSplits.listLedger.key(),
		orpc.commissionSplits.liabilitySummary.key(),
		orpc.commissionSplits.getMyCommissions.key(),
	];

	// Dialog state
	const [approveDialogOpen, setApproveDialogOpen] = useState(false);
	const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
	const [voidDialogOpen, setVoidDialogOpen] = useState(false);

	// ── Approve mutation ───────────────────────────────────────────────────────
	const approveMutation = useApiMutation({
		mutationFn: () =>
			client.commissionSplits.approve({
				organizationId,
				ids: selectedIds,
			}),
		successMessage: `Approved ${count} commission split${count !== 1 ? "s" : ""}.`,
		errorMessage: (err) =>
			err.message || "Failed to approve commission splits.",
		invalidate: commissionListKeys,
		onSuccess: () => {
			setApproveDialogOpen(false);
			onDone();
		},
	});

	// ── Void mutation — one-by-one (backend void takes a single id + reason) ──
	const voidMutation = useApiMutation({
		mutationFn: async (reason: string) => {
			// voidById operates on one id at a time — loop sequentially
			for (const id of selectedIds) {
				await client.commissionSplits.voidById({
					organizationId,
					id,
					reason,
				});
			}
		},
		successMessage: `Voided ${count} commission split${count !== 1 ? "s" : ""}.`,
		errorMessage: (err) => err.message || "Failed to void commission splits.",
		invalidate: commissionListKeys,
		onSuccess: () => {
			setVoidDialogOpen(false);
			onDone();
		},
	});

	if (count === 0) return null;

	// Derive actionability from the selected rows' actual statuses so the bar
	// also works on the "all" tab (where the footer "Approve all" pre-selects
	// pending rows). Falls back to the tab when row statuses aren't provided.
	const statuses = selectedRows?.map((r) => r.status);
	const allPending = statuses?.length
		? statuses.every((s) => s === "pending")
		: tab === "pending";
	const allApproved = statuses?.length
		? statuses.every((s) => s === "approved")
		: tab === "approved";
	const allActionable = statuses?.length
		? statuses.every((s) => s === "pending" || s === "approved")
		: tab === "pending" || tab === "approved";

	const showApprove = canApprove && allPending;
	const showMarkPaid = canProcess && allApproved;
	const showVoid = canApprove && allActionable;

	if (!showApprove && !showMarkPaid && !showVoid) return null;

	return (
		<>
			<div className="flex items-center gap-3 rounded-lg border bg-[#f3f3f3]/60 px-4 py-3">
				<span className="font-medium text-sm">
					{count} row{count !== 1 ? "s" : ""} selected
				</span>

				<div className="ml-auto flex items-center gap-2">
					{showApprove && (
						<Button
							size="sm"
							variant="outline"
							className="border-green-300 text-green-700 hover:bg-green-50"
							onClick={() => {
								if (selectedRows) {
									const distinctStaff = new Set(
										selectedRows.map((r) => r.staffId),
									);
									if (distinctStaff.size > 1) {
										toast.error(
											`Cannot approve splits for ${distinctStaff.size} different staff members at once. Filter by a single staff member first.`,
										);
										return;
									}
								}
								setApproveDialogOpen(true);
							}}
						>
							Approve Selected
						</Button>
					)}

					{showMarkPaid && (
						<Button
							size="sm"
							variant="outline"
							className="border-blue-300 text-blue-700 hover:bg-blue-50"
							onClick={() => setMarkPaidDialogOpen(true)}
						>
							Mark Paid
						</Button>
					)}

					{showVoid && (
						<Button
							size="sm"
							variant="outline"
							className="border-[#e5e5e5] text-rose-600 hover:bg-rose-50/5"
							onClick={() => setVoidDialogOpen(true)}
						>
							Void Selected
						</Button>
					)}
				</div>
			</div>

			{/* Approve dialog */}
			<ApproveConfirmDialog
				open={approveDialogOpen}
				onOpenChange={setApproveDialogOpen}
				count={count}
				onConfirm={() => approveMutation.mutate()}
				isPending={approveMutation.isPending}
				totalAmountCents={totalAmountCents}
			/>

			{/* Mark Paid dialog */}
			<MarkPaidDialog
				open={markPaidDialogOpen}
				onOpenChange={setMarkPaidDialogOpen}
				selectedIds={selectedIds}
				organizationId={organizationId}
				onDone={() => {
					for (const queryKey of commissionListKeys) {
						queryClient.invalidateQueries({ queryKey });
					}
					setMarkPaidDialogOpen(false);
					onDone();
				}}
			/>

			{/* Void dialog */}
			<VoidConfirmDialog
				open={voidDialogOpen}
				onOpenChange={setVoidDialogOpen}
				count={count}
				onConfirm={(reason) => voidMutation.mutate(reason)}
				isPending={voidMutation.isPending}
			/>
		</>
	);
}
