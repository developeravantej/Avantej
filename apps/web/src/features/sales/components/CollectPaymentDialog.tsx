import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

type PaymentMethod = "manual_transfer" | "cash" | "card" | "fpx" | "stripe";

export interface CollectPaymentTarget {
	installmentId: string;
	installmentNumber: number;
	installmentsTotal: number;
	customerName: string | null;
	serviceName: string | null;
	amountDue: number;
}

export interface CollectPaymentDialogProps {
	organizationId: string;
	target: CollectPaymentTarget | null;
	onClose: () => void;
}

export function CollectPaymentDialog({
	organizationId,
	target,
	onClose,
}: CollectPaymentDialogProps) {
	const queryClient = useQueryClient();
	const [paymentMethod, setPaymentMethod] =
		useState<PaymentMethod>("manual_transfer");
	const [notes, setNotes] = useState("");
	const [nextIntervalDays, setNextIntervalDays] = useState("");

	function resetForm() {
		setPaymentMethod("manual_transfer");
		setNotes("");
		setNextIntervalDays("");
	}

	const confirmMutation = useMutation({
		mutationFn: (installmentId: string) =>
			client.installments.confirmPayment({
				organizationId,
				installmentId,
				paymentMethod,
				notes: notes.trim() || undefined,
				nextIntervalDays: nextIntervalDays
					? Number.parseInt(nextIntervalDays, 10) || undefined
					: undefined,
			}),
		onSuccess: () => {
			// Prefix-match invalidation: refreshes the tab list and the due-soon badge
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-upcoming"],
			});
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-due-soon-count"],
			});
			// Keep the dedicated installments admin page in sync too
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success("Payment confirmed successfully.");
			resetForm();
			onClose();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to confirm payment."),
	});

	return (
		<Dialog
			open={!!target}
			onOpenChange={(open) => {
				if (!open) {
					resetForm();
					onClose();
				}
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INSTALLMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Collect Payment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `Installment ${target.installmentNumber} of ${target.installmentsTotal} — ${formatPrice(target.amountDue, "MYR")}${target.customerName ? ` from ${target.customerName}` : ""}${target.serviceName ? ` (${target.serviceName})` : ""}.`
							: "Confirm this installment payment."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="collect-payment-method">Payment Method</Label>
							<Select
								value={paymentMethod}
								onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
							>
								<SelectTrigger id="collect-payment-method">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="manual_transfer">
										Manual Transfer
									</SelectItem>
									<SelectItem value="cash">Cash</SelectItem>
									<SelectItem value="card">Card</SelectItem>
									<SelectItem value="fpx">FPX</SelectItem>
									<SelectItem value="stripe">Stripe</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="collect-notes">Notes (optional)</Label>
							<Textarea
								id="collect-notes"
								placeholder="Add any notes…"
								rows={2}
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="collect-next-interval">
								Override Next Interval (days, optional)
							</Label>
							<Input
								id="collect-next-interval"
								type="number"
								min="1"
								step="1"
								placeholder="e.g. 30"
								value={nextIntervalDays}
								onChange={(e) => setNextIntervalDays(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => {
							resetForm();
							onClose();
						}}
						disabled={confirmMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						data-testid="collect-payment-confirm"
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={() => {
							if (!target) return;
							confirmMutation.mutate(target.installmentId);
						}}
						disabled={confirmMutation.isPending}
					>
						{confirmMutation.isPending ? "Confirming…" : "Confirm Payment"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
