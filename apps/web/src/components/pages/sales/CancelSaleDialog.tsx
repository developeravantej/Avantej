import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";

const CANCELLATION_REASON_CATEGORIES = [
	{ value: "customer_changed_mind", label: "Customer changed mind" },
	{ value: "payment_failed", label: "Payment failed" },
	{ value: "wrong_item", label: "Wrong item" },
	{ value: "fraud_suspected", label: "Fraud suspected" },
	{ value: "system_error", label: "System error" },
	{ value: "other", label: "Other" },
] as const;

type CancellationReasonCategory =
	(typeof CANCELLATION_REASON_CATEGORIES)[number]["value"];

export interface CancelSaleDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	orderId: string;
	cancelledBy: string;
	totalAmount: number;
	onSuccess: () => void;
}

export function CancelSaleDialog({
	open,
	onOpenChange,
	organizationId,
	orderId,
	cancelledBy,
	totalAmount,
	onSuccess,
}: CancelSaleDialogProps) {
	const [reason, setReason] = useState("");
	const [reasonCategory, setReasonCategory] = useState<
		CancellationReasonCategory | ""
	>("");
	const { mutate: cancelSale, isPending } = useApiMutation({
		mutationFn: () =>
			client.salesOrders.cancel({
				organizationId,
				id: orderId,
				cancelledBy,
				reason: reason.trim() || undefined,
				refundAmount: totalAmount,
				cancellationReasonCategory: (reasonCategory || undefined) as
					| CancellationReasonCategory
					| undefined,
			}),
		successMessage: "Sale cancelled successfully",
		errorMessage: (err) => err.message || "Failed to cancel sale",
		// Broad-invalidate the sales list and cancelled-sales list via their real
		// oRPC router keys so both refresh regardless of their input filters.
		invalidate: [orpc.salesOrders.list.key(), orpc.cancelledSales.list.key()],
		onSuccess: () => {
			onOpenChange(false);
			setReason("");
			setReasonCategory("");
			onSuccess();
		},
	});

	const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 5;
	const canSubmit = reason.trim().length >= 5 && !isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
				data-testid="cancel-sale-dialog"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						POINT OF SALE
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Cancel Sale
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						This action cannot be undone. The order will be marked as cancelled
						and a cancellation record will be created.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="cancel-category" className="text-sm font-medium">
								Category{" "}
								<span className="font-normal text-[#737373]">(optional)</span>
							</Label>
							<Select
								value={reasonCategory || "none"}
								onValueChange={(v) =>
									setReasonCategory(
										v === "none" ? "" : (v as CancellationReasonCategory),
									)
								}
							>
								<SelectTrigger
									id="cancel-category"
									className="w-full"
									data-testid="cancel-category-select"
								>
									<SelectValue placeholder="Select a category…" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No category</SelectItem>
									{CANCELLATION_REASON_CATEGORIES.map((cat) => (
										<SelectItem key={cat.value} value={cat.value}>
											{cat.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="cancel-reason" className="text-sm font-medium">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="cancel-reason"
								placeholder="Provide a reason for cancellation (min 5 characters)"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								rows={3}
								data-testid="cancel-sale-reason-input"
							/>
							{reasonTooShort && (
								<p className="text-xs text-rose-600">
									Reason must be at least 5 characters.
								</p>
							)}
						</div>
					</div>
				</div>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Keep Sale
					</Button>
					<Button
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={() => cancelSale()}
						disabled={!canSubmit}
						data-testid="cancel-sale-confirm-button"
					>
						{isPending ? "Cancelling..." : "Cancel Sale"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
