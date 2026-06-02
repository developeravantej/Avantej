import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";

export type MarkPaidDialogProps = {
	invoiceId: string | null;
	invoiceNumber: string;
	organizationId: string;
	onClose: () => void;
	onDone: () => void;
};

export function MarkPaidDialog({
	invoiceId,
	invoiceNumber,
	organizationId,
	onClose,
	onDone,
}: MarkPaidDialogProps) {
	const [paymentReference, setPaymentReference] = useState("");
	const qc = useQueryClient();

	const paidMutation = useApiMutation({
		mutationFn: (
			input: Parameters<typeof client.goodsReceipts.markInvoicePaid>[0],
		) => client.goodsReceipts.markInvoicePaid(input),
		successMessage: "Invoice marked as paid.",
		errorMessage: (err) => `Failed to mark as paid: ${err.message}`,
		onSuccess: () => {
			qc.invalidateQueries(
				orpc.goodsReceipts.listInvoices.queryOptions({
					input: { organizationId },
				}),
			);
			onDone();
			handleClose();
		},
	});

	function handleClose() {
		setPaymentReference("");
		onClose();
	}

	return (
		<Dialog
			open={!!invoiceId}
			onOpenChange={(open) => {
				if (!open) handleClose();
			}}
		>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PURCHASE ORDERS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Mark Invoice as Paid
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Confirm that payment for invoice {invoiceNumber} has been sent.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-1.5">
						<Label htmlFor="pay-ref">Payment Reference (optional)</Label>
						<Input
							id="pay-ref"
							value={paymentReference}
							onChange={(e) => setPaymentReference(e.target.value)}
							placeholder="e.g. TXN-12345"
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={paidMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
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
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
