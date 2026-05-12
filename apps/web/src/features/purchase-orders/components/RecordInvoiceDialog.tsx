import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { rmToCents } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useState } from "react";

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "2-digit",
	});
}

export type RecordInvoiceDialogProps = {
	poId: string | null;
	organizationId: string;
	onClose: () => void;
	onCreated: () => void;
};

export function RecordInvoiceDialog({ poId, organizationId, onClose, onCreated }: RecordInvoiceDialogProps) {
	const [invoiceNumber, setInvoiceNumber] = useState("");
	const [goodsReceiptId, setGoodsReceiptId] = useState("");
	const [totalRM, setTotalRM] = useState("");
	const [taxRM, setTaxRM] = useState("");
	const [invoiceDate, setInvoiceDate] = useState(() => todayISO());
	const [dueDate, setDueDate] = useState("");
	const qc = useQueryClient();

	const { data: detail, isLoading: detailLoading } = useQuery({
		queryKey: ["purchaseOrders", organizationId, poId],
		queryFn: async () => {
			if (!poId || !organizationId) return null;
			return client.purchaseOrders.getById({ organizationId, id: poId });
		},
		enabled: !!poId && !!organizationId,
	});

	const { data: receipts = [] } = useQuery({
		queryKey: ["goodsReceiptsForPo", organizationId, poId],
		queryFn: async () => {
			if (!poId || !organizationId) return [];
			return client.goodsReceipts.listForPo({ organizationId, purchaseOrderId: poId });
		},
		enabled: !!poId && !!organizationId,
	});

	const postedReceipts = receipts.filter((r: any) => r.status === "posted");

	const createMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.goodsReceipts.createInvoice>[0]) =>
			client.goodsReceipts.createInvoice(input),
		successMessage: "Invoice recorded successfully.",
		errorMessage: (err) => `Failed to record invoice: ${err.message}`,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["supplierInvoices", organizationId] });
			onCreated();
			handleClose();
		},
	});

	function handleClose() {
		setInvoiceNumber("");
		setGoodsReceiptId("");
		setTotalRM("");
		setTaxRM("");
		setInvoiceDate(todayISO());
		setDueDate("");
		onClose();
	}

	function handleSubmit() {
		if (!poId || !detail?.order) return;
		if (!invoiceNumber.trim()) { toast.error("Invoice number is required."); return; }
		const total = parseFloat(totalRM);
		if (!totalRM || Number.isNaN(total) || total <= 0) { toast.error("Invoice total must be greater than 0."); return; }
		if (!invoiceDate) { toast.error("Invoice date is required."); return; }

		createMutation.mutate({
			organizationId,
			invoiceNumber: invoiceNumber.trim(),
			supplierId: detail.order.supplierId,
			purchaseOrderId: poId,
			goodsReceiptId: goodsReceiptId || undefined,
			totalCents: rmToCents(total),
			taxCents: taxRM && !Number.isNaN(parseFloat(taxRM)) ? rmToCents(parseFloat(taxRM)) : undefined,
			invoiceDate: new Date(invoiceDate).toISOString(),
			dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
		});
	}

	return (
		<Dialog open={!!poId} onOpenChange={(open) => { if (!open) handleClose(); }}>
			<DialogContent className="sm:max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Record Supplier Invoice</DialogTitle>
					<DialogDescription>
						{detail?.order
							? `Record an invoice against PO ${detail.order.purchaseOrderNumber}.`
							: "Loading purchase order…"}
					</DialogDescription>
				</DialogHeader>

				<div className="mt-4 space-y-4">
					{detailLoading && (
						<div className="flex items-center justify-center py-8">
							<LoadingSpinner size="md" />
						</div>
					)}

					{!detailLoading && (
						<>
							<div className="space-y-1.5">
								<Label htmlFor="inv-number">Invoice Number</Label>
								<Input
									id="inv-number"
									value={invoiceNumber}
									onChange={(e) => setInvoiceNumber(e.target.value)}
									placeholder="e.g. INV-2026-001"
								/>
							</div>

							{postedReceipts.length > 0 && (
								<div className="space-y-1.5">
									<Label htmlFor="inv-receipt">Goods Receipt (optional)</Label>
									<Select value={goodsReceiptId} onValueChange={setGoodsReceiptId}>
										<SelectTrigger id="inv-receipt">
											<SelectValue placeholder="Select posted receipt…" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="">None</SelectItem>
											{postedReceipts.map((r: any) => (
												<SelectItem key={r.id} value={r.id}>
													{r.receiptNumber}, {formatDate(r.receivedAt)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="inv-total">Invoice Total (RM)</Label>
									<Input
										id="inv-total"
										type="number"
										min="0"
										step="0.01"
										value={totalRM}
										onChange={(e) => setTotalRM(e.target.value)}
										placeholder="0.00"
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="inv-tax">Tax Amount (RM, optional)</Label>
									<Input
										id="inv-tax"
										type="number"
										min="0"
										step="0.01"
										value={taxRM}
										onChange={(e) => setTaxRM(e.target.value)}
										placeholder="0.00"
									/>
								</div>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="inv-date">Invoice Date</Label>
									<Input
										id="inv-date"
										type="date"
										value={invoiceDate}
										onChange={(e) => setInvoiceDate(e.target.value)}
									/>
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="inv-due">Due Date (optional)</Label>
									<Input
										id="inv-due"
										type="date"
										value={dueDate}
										onChange={(e) => setDueDate(e.target.value)}
									/>
								</div>
							</div>

							<Separator />

							<div className="flex gap-2 justify-end">
								<Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
									Cancel
								</Button>
								<Button onClick={handleSubmit} disabled={createMutation.isPending}>
									{createMutation.isPending ? "Saving…" : "Save Invoice"}
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
