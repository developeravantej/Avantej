/**
 * Platform Admin — Refund confirm dialog (Plan F.3-A).
 *
 * Confirms a Stripe refund against a specific invoice. Supports partial
 * refunds (defaults to full remaining), reason selection, and a free-text
 * notes field that lands in the audit row only.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Invoice } from "./invoice-list";

export type RefundReason =
	| "duplicate"
	| "fraudulent"
	| "requested_by_customer";

export type RefundInput = {
	amountCents: number;
	reason: RefundReason;
	notes?: string;
};

function fmtMinor(amountMinor: number, currency: string) {
	return `${(amountMinor / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})} ${currency.toUpperCase()}`;
}

export function RefundConfirmDialog({
	open,
	invoice,
	onConfirm,
	onClose,
	isPending,
}: {
	open: boolean;
	invoice: Invoice | null;
	onConfirm: (input: RefundInput) => void;
	onClose: () => void;
	isPending: boolean;
}) {
	const maxRefundable = invoice
		? Math.max(0, invoice.amountPaid - invoice.refundedAmount)
		: 0;
	const defaultAmount = maxRefundable > 0 ? (maxRefundable / 100).toFixed(2) : "0.00";
	const [amount, setAmount] = useState(defaultAmount);
	const [reason, setReason] = useState<RefundReason>("requested_by_customer");
	const [notes, setNotes] = useState("");

	useEffect(() => {
		if (open && invoice) {
			setAmount(defaultAmount);
			setReason("requested_by_customer");
			setNotes("");
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, invoice?.id]);

	if (!invoice) return null;

	const amountCents = Math.round(parseFloat(amount || "0") * 100);
	const valid =
		amountCents > 0 && amountCents <= maxRefundable && notes.length <= 1000;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent data-testid="refund-confirm-dialog">
				<DialogHeader>
					<DialogTitle>Refund invoice</DialogTitle>
					<DialogDescription>
						Issue a real Stripe refund against invoice{" "}
						<span className="font-mono">{invoice.number ?? invoice.id}</span>.
						This action cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2 items-start">
					<AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
					<div>
						<div className="font-medium text-destructive">
							This issues a real Stripe refund.
						</div>
						<div className="text-xs text-muted-foreground">
							The customer will see the refund on their card statement within
							5–10 business days. Audited under tenant_invoice_refund.
						</div>
					</div>
				</div>

				<div className="space-y-3">
					<div>
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Original amount paid
						</Label>
						<div className="text-sm">
							{fmtMinor(invoice.amountPaid, invoice.currency)}
						</div>
						{invoice.refundedAmount > 0 && (
							<div className="text-xs text-muted-foreground">
								Already refunded:{" "}
								{fmtMinor(invoice.refundedAmount, invoice.currency)}
							</div>
						)}
					</div>

					<div>
						<Label htmlFor="refund-amount">
							Refund amount ({invoice.currency.toUpperCase()})
						</Label>
						<Input
							id="refund-amount"
							type="number"
							step="0.01"
							min="0.01"
							max={maxRefundable / 100}
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							disabled={isPending}
							data-testid="refund-amount-input"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							Max refundable: {fmtMinor(maxRefundable, invoice.currency)}
						</div>
					</div>

					<div>
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Reason
						</Label>
						<RadioGroup
							value={reason}
							onValueChange={(v) => setReason(v as RefundReason)}
							className="mt-2"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem
									value="requested_by_customer"
									id="reason-requested"
								/>
								<Label htmlFor="reason-requested" className="font-normal">
									Requested by customer
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="duplicate" id="reason-duplicate" />
								<Label htmlFor="reason-duplicate" className="font-normal">
									Duplicate
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="fraudulent" id="reason-fraudulent" />
								<Label htmlFor="reason-fraudulent" className="font-normal">
									Fraudulent
								</Label>
							</div>
						</RadioGroup>
					</div>

					<div>
						<Label htmlFor="refund-notes">Internal notes (optional)</Label>
						<Textarea
							id="refund-notes"
							placeholder="Audit-only context — e.g. ticket number, customer ask"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							disabled={isPending}
							maxLength={1000}
							data-testid="refund-notes-input"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							{notes.length}/1000
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={!valid || isPending}
						onClick={() =>
							onConfirm({
								amountCents,
								reason,
								notes: notes.trim() || undefined,
							})
						}
						data-testid="refund-confirm-btn"
					>
						{isPending ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								Refunding…
							</>
						) : (
							"Issue refund"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
