/**
 * Payout state-machine action dialogs.
 *
 * Replaces the inline `window.prompt` / `window.confirm` UX with proper Dialog
 * components. All five dialogs share the same pattern:
 *
 *   - Show recipient + amount in a small info row at the top.
 *   - Collect inputs (where applicable) with validation hints.
 *   - Disable submit + show pending state during the mutation.
 *   - Auto-close on success (caller controls visibility via the `payout` prop).
 *
 * `payout === null` keeps the dialog closed; passing a row opens it.
 *
 * The mutation hooks live in `@/features/payouts/api`. State-machine guards
 * are server-side (FOR-UPDATE locks + from-state validation), so the dialog
 * just collects the input and fires.
 */
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/money";
import {
	useCancelPayout,
	useMarkPayoutFailed,
	useMarkPayoutPaid,
	useRetryPayout,
	type PayoutListItem,
} from "../api";

// ─── Shared row summary ─────────────────────────────────────────────────────

function PayoutSummaryRow({ payout }: { payout: PayoutListItem }) {
	return (
		<div className="rounded-md border border-[#e5e5e5] bg-[#fcfaf6] px-3 py-2 text-sm space-y-1">
			<div className="flex justify-between">
				<span className="text-[#737373]">Recipient</span>
				<span className="font-medium">{payout.recipientName}</span>
			</div>
			<div className="flex justify-between">
				<span className="text-[#737373]">Amount</span>
				<span className="font-semibold tabular-nums">
					{payout.amount < 0 ? "-" : ""}
					{formatPrice(Math.abs(payout.amount), "MYR")}
				</span>
			</div>
			{payout.paymentMethod ? (
				<div className="flex justify-between">
					<span className="text-[#737373]">Method</span>
					<span className="font-mono text-[11px]">{payout.paymentMethod}</span>
				</div>
			) : null}
		</div>
	);
}

// ─── MarkPaidDialog ─────────────────────────────────────────────────────────

interface MarkPaidProps {
	organizationId: string;
	payout: PayoutListItem | null;
	onClose: () => void;
}

export function MarkPaidDialog({
	organizationId,
	payout,
	onClose,
}: MarkPaidProps) {
	const [reference, setReference] = useState("");
	const mutation = useMarkPayoutPaid(organizationId);

	// Reset the field every time the dialog is re-opened for a new row so the
	// previous row's reference doesn't bleed across uses.
	useEffect(() => {
		if (payout) setReference("");
	}, [payout?.id]);

	if (!payout) return null;
	const trimmed = reference.trim();
	const valid = trimmed.length > 0 && trimmed.length <= 200;

	const handleSubmit = async () => {
		if (!valid) return;
		await mutation.mutateAsync({
			organizationId,
			id: payout.id,
			paymentReference: trimmed,
		});
		onClose();
	};

	return (
		<Dialog open={!!payout} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PAYOUT HISTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Mark payout as paid
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Record the external payment reference (wire id, cheque number,
						transfer id). Flips the payout to <strong>paid</strong> and marks
						the linked commission splits paid in the same transaction.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<PayoutSummaryRow payout={payout} />
						<div className="space-y-1.5">
							<Label htmlFor="paymentReference">
								Payment reference <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="paymentReference"
								value={reference}
								onChange={(e) => setReference(e.target.value)}
								placeholder="e.g. WIRE-2026-05-27-001"
								maxLength={200}
								autoFocus
								disabled={mutation.isPending}
								onKeyDown={(e) => {
									if (e.key === "Enter" && valid) handleSubmit();
								}}
							/>
							<p className="text-xs text-[#737373]">
								Required. Persisted on the row's notes + audit log so the
								external transaction stays linked to the commission record.
							</p>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={handleSubmit}
						disabled={!valid || mutation.isPending}
					>
						{mutation.isPending ? "Marking paid…" : "Mark paid"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── MarkFailedDialog ───────────────────────────────────────────────────────

interface MarkFailedProps {
	organizationId: string;
	payout: PayoutListItem | null;
	onClose: () => void;
}

export function MarkFailedDialog({
	organizationId,
	payout,
	onClose,
}: MarkFailedProps) {
	const [reason, setReason] = useState("");
	const mutation = useMarkPayoutFailed(organizationId);

	useEffect(() => {
		if (payout) setReason("");
	}, [payout?.id]);

	if (!payout) return null;
	const trimmed = reason.trim();
	const valid = trimmed.length > 0 && trimmed.length <= 1000;

	const handleSubmit = async () => {
		if (!valid) return;
		await mutation.mutateAsync({
			organizationId,
			id: payout.id,
			reason: trimmed,
		});
		onClose();
	};

	return (
		<Dialog open={!!payout} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PAYOUT HISTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Mark payout as failed
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Record why the payout couldn't be settled (bank rejection, bounced
						cheque, transfer error). Linked commission splits stay at{" "}
						<strong>approved</strong>
						with their <code className="text-[10px] font-mono">payoutId</code>{" "}
						intact, so a future <strong>Retry</strong> picks up where this left
						off.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<PayoutSummaryRow payout={payout} />
						<div className="space-y-1.5">
							<Label htmlFor="failureReason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="failureReason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="e.g. Bank rejected: account closed; need updated details"
								maxLength={1000}
								rows={3}
								autoFocus
								disabled={mutation.isPending}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Back
					</Button>
					<Button
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={handleSubmit}
						disabled={!valid || mutation.isPending}
					>
						{mutation.isPending ? "Marking failed…" : "Mark failed"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── CancelPayoutDialog ─────────────────────────────────────────────────────

interface CancelProps {
	organizationId: string;
	payout: PayoutListItem | null;
	onClose: () => void;
}

export function CancelPayoutDialog({
	organizationId,
	payout,
	onClose,
}: CancelProps) {
	const [reason, setReason] = useState("");
	const mutation = useCancelPayout(organizationId);

	useEffect(() => {
		if (payout) setReason("");
	}, [payout?.id]);

	if (!payout) return null;
	const trimmed = reason.trim();
	const valid = trimmed.length > 0 && trimmed.length <= 1000;

	const handleSubmit = async () => {
		if (!valid) return;
		await mutation.mutateAsync({
			organizationId,
			id: payout.id,
			reason: trimmed,
		});
		onClose();
	};

	return (
		<Dialog open={!!payout} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PAYOUT HISTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Cancel payout
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						The linked commission splits will revert to{" "}
						<strong>approved</strong> and become eligible for a future batch —
						their <code className="text-[10px] font-mono">payoutId</code> is
						cleared. The reason is persisted to the audit log.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<PayoutSummaryRow payout={payout} />
						<div className="space-y-1.5">
							<Label htmlFor="cancelReason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="cancelReason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="e.g. Recipient bank details incorrect; will re-batch after correction"
								maxLength={1000}
								rows={3}
								autoFocus
								disabled={mutation.isPending}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Back
					</Button>
					<Button
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={handleSubmit}
						disabled={!valid || mutation.isPending}
					>
						{mutation.isPending ? "Cancelling…" : "Cancel payout"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── RetryPayoutDialog (no input — just confirmation) ───────────────────────

interface RetryProps {
	organizationId: string;
	payout: PayoutListItem | null;
	onClose: () => void;
}

export function RetryPayoutDialog({
	organizationId,
	payout,
	onClose,
}: RetryProps) {
	const mutation = useRetryPayout(organizationId);

	if (!payout) return null;

	const handleSubmit = async () => {
		await mutation.mutateAsync({ organizationId, id: payout.id });
		onClose();
	};

	return (
		<Dialog open={!!payout} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PAYOUT HISTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Retry payout
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Resets the payout from <strong>failed</strong> to{" "}
						<strong>pending</strong> for another attempt. Linked commission
						splits aren't touched — their{" "}
						<code className="text-[10px] font-mono">payoutId</code> linkage is
						preserved.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<PayoutSummaryRow payout={payout} />
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Back
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={handleSubmit}
						disabled={mutation.isPending}
					>
						{mutation.isPending ? "Retrying…" : "Retry payout"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
