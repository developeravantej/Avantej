import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MarkPaidDialog } from "@/components/commissions/mark-paid-dialog";
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
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type ActiveTab = "all" | "pending" | "approved" | "paid" | "void";

interface BulkActionBarProps {
	selectedIds: string[];
	tab: ActiveTab;
	organizationId: string;
	canApprove: boolean;
	canProcess: boolean;
	onDone: () => void;
}

// ─── Approve Confirmation Dialog ──────────────────────────────────────────────

function ApproveConfirmDialog({
	open,
	onOpenChange,
	count,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	count: number;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Approve Commission Splits</DialogTitle>
					<DialogDescription>
						You are about to approve {count} commission split
						{count !== 1 ? "s" : ""}. This will move them from Pending to
						Approved. Continue?
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button onClick={onConfirm} disabled={isPending}>
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
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Void Commission Splits</DialogTitle>
					<DialogDescription>
						You are about to void {count} commission split{count !== 1 ? "s" : ""}
						. Provide a required reason — this is recorded in the audit trail.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="void-reason">
							Reason <span className="text-destructive">*</span>
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
				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={isPending || !reason.trim()}
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
	tab,
	organizationId,
	canApprove,
	canProcess,
	onDone,
}: BulkActionBarProps) {
	const queryClient = useQueryClient();
	const count = selectedIds.length;

	// Dialog state
	const [approveDialogOpen, setApproveDialogOpen] = useState(false);
	const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
	const [voidDialogOpen, setVoidDialogOpen] = useState(false);

	// ── Approve mutation ───────────────────────────────────────────────────────
	const approveMutation = useMutation({
		mutationFn: () =>
			client.commissionSplits.approve({
				organizationId,
				ids: selectedIds,
			}),
		onSuccess: () => {
			toast.success(`Approved ${count} commission split${count !== 1 ? "s" : ""}.`);
			queryClient.invalidateQueries({ queryKey: ["commissions"] });
			setApproveDialogOpen(false);
			onDone();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to approve commission splits."),
	});

	// ── Void mutation — one-by-one (backend void takes a single id + reason) ──
	const voidMutation = useMutation({
		mutationFn: async (reason: string) => {
			// Backend void operates on one id at a time per plan §6.4
			for (const id of selectedIds) {
				await client.commissionSplits.void({
					organizationId,
					id,
					reason,
				});
			}
		},
		onSuccess: () => {
			toast.success(`Voided ${count} commission split${count !== 1 ? "s" : ""}.`);
			queryClient.invalidateQueries({ queryKey: ["commissions"] });
			setVoidDialogOpen(false);
			onDone();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to void commission splits."),
	});

	if (count === 0) return null;

	const showApprove = tab === "pending" && canApprove;
	const showMarkPaid = tab === "approved" && canProcess;
	const showVoid = canApprove && (tab === "pending" || tab === "approved");

	if (!showApprove && !showMarkPaid && !showVoid) return null;

	return (
		<>
			<div className="flex items-center gap-3 rounded-lg border bg-muted/60 px-4 py-3">
				<span className="font-medium text-sm">
					{count} row{count !== 1 ? "s" : ""} selected
				</span>

				<div className="ml-auto flex items-center gap-2">
					{showApprove && (
						<Button
							size="sm"
							variant="outline"
							className="border-green-300 text-green-700 hover:bg-green-50"
							onClick={() => setApproveDialogOpen(true)}
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
							className="border-destructive/40 text-destructive hover:bg-destructive/5"
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
			/>

			{/* Mark Paid dialog */}
			<MarkPaidDialog
				open={markPaidDialogOpen}
				onOpenChange={setMarkPaidDialogOpen}
				selectedIds={selectedIds}
				organizationId={organizationId}
				onDone={() => {
					queryClient.invalidateQueries({ queryKey: ["commissions"] });
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
