import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useState } from "react";

export type MatchReviewDialogProps = {
	invoiceId: string | null;
	organizationId: string;
	onClose: () => void;
	onAction: () => void;
};

export function MatchReviewDialog({
	invoiceId,
	organizationId,
	onClose,
	onAction,
}: MatchReviewDialogProps) {
	const [disputeReason, setDisputeReason] = useState("");
	const [showDisputeForm, setShowDisputeForm] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);
	const qc = useQueryClient();

	const { data: preview, isLoading } = useQuery({
		...orpc.goodsReceipts.getInvoicePreview.queryOptions({
			input: { organizationId, invoiceId: invoiceId ?? "" },
		}),
		enabled: !!invoiceId && !!organizationId,
	});

	const matchMutation = useApiMutation({
		mutationFn: (
			input: Parameters<typeof client.goodsReceipts.matchInvoice>[0],
		) => client.goodsReceipts.matchInvoice(input),
		successMessage: "Invoice matched successfully.",
		errorMessage: (err) => {
			setActionError(err.message);
			return `Match failed: ${err.message}`;
		},
		onSuccess: () => {
			qc.invalidateQueries(
				orpc.goodsReceipts.listInvoices.queryOptions({
					input: { organizationId },
				}),
			);
			onAction();
			onClose();
		},
	});

	const disputeMutation = useApiMutation({
		mutationFn: (
			input: Parameters<typeof client.goodsReceipts.disputeInvoice>[0],
		) => client.goodsReceipts.disputeInvoice(input),
		successMessage: "Invoice disputed.",
		errorMessage: (err) => {
			setActionError(err.message);
			return `Failed to dispute: ${err.message}`;
		},
		onSuccess: () => {
			qc.invalidateQueries(
				orpc.goodsReceipts.listInvoices.queryOptions({
					input: { organizationId },
				}),
			);
			onAction();
			onClose();
		},
	});

	function handleClose() {
		setDisputeReason("");
		setShowDisputeForm(false);
		setActionError(null);
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
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PURCHASE ORDERS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						3-Way Match Review
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Compare PO, receipt, and invoice totals to verify the match.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4">
						{isLoading && (
							<div className="flex items-center justify-center py-8">
								<LoadingSpinner size="md" />
							</div>
						)}

						{!isLoading && preview && (
							<>
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b">
											<th className="text-left pb-2 font-medium text-[#737373]">
												Source
											</th>
											<th className="text-right pb-2 font-medium text-[#737373]">
												Amount
											</th>
										</tr>
									</thead>
									<tbody>
										<tr className="border-b last:border-0">
											<td className="py-2">Purchase Order</td>
											<td className="py-2 text-right tabular-nums font-medium">
												{preview.poTotalCents !== null
													? formatPrice(preview.poTotalCents, "MYR")
													: "N/A"}
											</td>
										</tr>
										<tr className="border-b last:border-0">
											<td className="py-2">Goods Receipt</td>
											<td className="py-2 text-right tabular-nums font-medium">
												{preview.receiptTotalCents !== null
													? formatPrice(preview.receiptTotalCents, "MYR")
													: "N/A"}
											</td>
										</tr>
										<tr>
											<td className="py-2">Invoice</td>
											<td className="py-2 text-right tabular-nums font-medium">
												{formatPrice(preview.invoiceTotalCents, "MYR")}
											</td>
										</tr>
									</tbody>
								</table>

								<div className="text-xs text-[#737373]">
									Tolerance: {formatPrice(preview.toleranceCents, "MYR")}
								</div>

								{preview.isWithinTolerance ? (
									<div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 font-medium">
										Within Tolerance: Ready to approve
									</div>
								) : (
									<div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
										<p className="font-medium mb-1">Mismatch Detected</p>
										<ul className="list-disc list-inside space-y-0.5">
											{preview.mismatches.map((m) => (
												<li key={m}>{m}</li>
											))}
										</ul>
									</div>
								)}

								{actionError && (
									<div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
										{actionError}
									</div>
								)}

								{showDisputeForm && (
									<div className="space-y-2">
										<Label htmlFor="dispute-reason">Dispute Reason</Label>
										<Textarea
											id="dispute-reason"
											value={disputeReason}
											onChange={(e) => setDisputeReason(e.target.value)}
											placeholder="Describe the discrepancy…"
											rows={3}
										/>
									</div>
								)}
							</>
						)}
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					{showDisputeForm ? (
						<>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowDisputeForm(false)}
							>
								Back
							</Button>
							<Button
								size="sm"
								className="bg-red-600 hover:bg-red-700 text-white"
								disabled={!disputeReason.trim() || disputeMutation.isPending}
								onClick={() => {
									if (!invoiceId) return;
									setActionError(null);
									disputeMutation.mutate({
										organizationId,
										invoiceId,
										reason: disputeReason.trim(),
									});
								}}
							>
								{disputeMutation.isPending ? "Saving…" : "Confirm Dispute"}
							</Button>
						</>
					) : (
						<>
							<Button variant="outline" onClick={handleClose}>
								Close
							</Button>
							{preview?.isWithinTolerance ? (
								<Button
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
									disabled={matchMutation.isPending}
									onClick={() => {
										if (!invoiceId) return;
										setActionError(null);
										matchMutation.mutate({ organizationId, invoiceId });
									}}
								>
									{matchMutation.isPending ? "Approving…" : "Approve Match"}
								</Button>
							) : (
								preview && (
									<Button
										className="bg-red-600 hover:bg-red-700 text-white"
										onClick={() => setShowDisputeForm(true)}
									>
										Dispute Invoice
									</Button>
								)
							)}
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
