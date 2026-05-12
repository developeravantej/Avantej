import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { useState } from "react";

export type MarkPaidDialogProps = {
	invoiceId: string | null;
	invoiceNumber: string;
	organizationId: string;
	onClose: () => void;
	onDone: () => void;
};

export function MarkPaidDialog({ invoiceId, invoiceNumber, organizationId, onClose, onDone }: MarkPaidDialogProps) {
	const [paymentReference, setPaymentReference] = useState("");
	const qc = useQueryClient();

	const paidMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.goodsReceipts.markInvoicePaid>[0]) =>
			client.goodsReceipts.markInvoicePaid(input),
		successMessage: "Invoice marked as paid.",
		errorMessage: (err) => `Failed to mark as paid: ${err.message}`,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["supplierInvoices", organizationId] });
			onDone();
			handleClose();
		},
	});

	function handleClose() {
		setPaymentReference("");
		onClose();
	}

	return (
		<Dialog open={!!invoiceId} onOpenChange={(open) => { if (!open) handleClose(); }}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Mark Invoice as Paid</DialogTitle>
					<DialogDescription>
						Confirm that payment for invoice {invoiceNumber} has been sent.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="pay-ref">Payment Reference (optional)</Label>
						<Input
							id="pay-ref"
							value={paymentReference}
							onChange={(e) => setPaymentReference(e.target.value)}
							placeholder="e.g. TXN-12345"
						/>
					</div>

					<div className="flex gap-2 justify-end">
						<Button variant="outline" onClick={handleClose} disabled={paidMutation.isPending}>
							Cancel
						</Button>
						<Button
							disabled={paidMutation.isPending}
							onClick={() => {
								if (!invoiceId) return;
								paidMutation.mutate({
									organizationId,
									invoiceId,
									paymentReference: paymentReference.trim() || undefined,
								});
							}}
						>
							{paidMutation.isPending ? "Saving…" : "Confirm Paid"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
