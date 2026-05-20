import type { UseMutationResult } from "@tanstack/react-query";
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
import type { Installment, InstallmentOverviewItem } from "../types";

interface ConfirmPaymentDialogProps {
	confirmInstallment: Installment | null;
	selectedInstance: InstallmentOverviewItem | null;
	paymentMethod: "manual_transfer" | "cash" | "card" | "fpx" | "stripe";
	setPaymentMethod: (v: "manual_transfer" | "cash" | "card" | "fpx" | "stripe") => void;
	notes: string;
	setNotes: (v: string) => void;
	nextIntervalDays: string;
	setNextIntervalDays: (v: string) => void;
	onClose: () => void;
	confirmPaymentMutation: UseMutationResult<
		unknown,
		Error,
		{
			installmentId: string;
			paymentMethod: string;
			notes?: string;
			nextIntervalDays?: number;
		}
	>;
}

export function ConfirmPaymentDialog({
	confirmInstallment,
	selectedInstance,
	paymentMethod,
	setPaymentMethod,
	notes,
	setNotes,
	nextIntervalDays,
	setNextIntervalDays,
	onClose,
	confirmPaymentMutation,
}: ConfirmPaymentDialogProps) {
	return (
		<Dialog
			open={!!confirmInstallment}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Confirm Payment</DialogTitle>
					<DialogDescription>
						{confirmInstallment && selectedInstance
							? `Confirm payment for Installment ${confirmInstallment.installmentNumber} of ${selectedInstance.installmentsTotal ?? "?"}.`
							: "Confirm this installment payment."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					{/* Payment method */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="payment-method">Payment Method</Label>
						<Select
							value={paymentMethod}
							onValueChange={(v) =>
								setPaymentMethod(v as "manual_transfer" | "cash" | "card" | "fpx" | "stripe")
							}
						>
							<SelectTrigger id="payment-method">
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

					{/* Notes */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="confirm-notes">Notes (optional)</Label>
						<Textarea
							id="confirm-notes"
							placeholder="Add any notes…"
							rows={2}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>

					{/* Next interval days override */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="next-interval">
							Override Next Interval (days, optional)
						</Label>
						<Input
							id="next-interval"
							type="number"
							min="1"
							step="1"
							placeholder="e.g. 30"
							value={nextIntervalDays}
							onChange={(e) => setNextIntervalDays(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={confirmPaymentMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => {
							if (!confirmInstallment) return;
							const intervalDays = nextIntervalDays
								? Number.parseInt(nextIntervalDays, 10) || undefined
								: undefined;
							confirmPaymentMutation.mutate({
								installmentId: confirmInstallment.id,
								paymentMethod,
								notes: notes.trim() || undefined,
								nextIntervalDays: intervalDays,
							});
						}}
						disabled={confirmPaymentMutation.isPending}
					>
						{confirmPaymentMutation.isPending ? "Confirming…" : "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
