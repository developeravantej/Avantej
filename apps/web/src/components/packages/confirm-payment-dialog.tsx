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
import { client } from "@/utils/orpc";
import type { Installment } from "./installment-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConfirmPaymentDialogProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	installment: Installment | null;
	organizationId: string;
	/** Called after a successful payment confirmation (caller handles overview invalidation). */
	onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ConfirmPaymentDialog({
	open,
	onOpenChange,
	installment,
	organizationId,
	onSuccess,
}: ConfirmPaymentDialogProps) {
	const queryClient = useQueryClient();

	const [paymentMethod, setPaymentMethod] = useState<
		"manual_transfer" | "cash"
	>("manual_transfer");
	const [notes, setNotes] = useState("");
	const [nextIntervalDays, setNextIntervalDays] = useState("");

	function resetForm() {
		setPaymentMethod("manual_transfer");
		setNotes("");
		setNextIntervalDays("");
	}

	const confirmPaymentMutation = useMutation({
		mutationFn: (vars: {
			installmentId: string;
			paymentMethod: string;
			notes?: string;
			nextIntervalDays?: number;
		}) =>
			client.installments.confirmPayment({
				organizationId,
				installmentId: vars.installmentId,
				paymentMethod: vars.paymentMethod as "manual_transfer" | "cash",
				notes: vars.notes || undefined,
				nextIntervalDays: vars.nextIntervalDays,
			}),
		onSuccess: (_, vars) => {
			// Invalidate the per-instance timeline (the dialog knows which installment was paid)
			if (installment) {
				// We invalidate by matching the installmentId in the queryKey
				queryClient.invalidateQueries({
					predicate: (query) => {
						const key = query.queryKey;
						return (
							Array.isArray(key) &&
							key[0] === "installments-by-instance" &&
							key[1] === organizationId
						);
					},
				});
			}
			toast.success("Payment confirmed successfully.");
			resetForm();
			onOpenChange(false);
			onSuccess();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to confirm payment."),
	});

	function handleClose() {
		if (confirmPaymentMutation.isPending) return;
		resetForm();
		onOpenChange(false);
	}

	// Derive the installmentsTotal from the installment itself (not available here,
	// so we keep the description generic when selectedInstance is unknown).
	const installmentLabel = installment
		? `Installment #${installment.installmentNumber}`
		: "this installment";

	return (
		<Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Confirm Payment</DialogTitle>
					<DialogDescription>
						Confirm payment for {installmentLabel}.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					{/* Payment method */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="payment-method">Payment Method</Label>
						<Select
							value={paymentMethod}
							onValueChange={(v) =>
								setPaymentMethod(v as "manual_transfer" | "cash")
							}
						>
							<SelectTrigger id="payment-method">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="manual_transfer">Manual Transfer</SelectItem>
								<SelectItem value="cash">Cash</SelectItem>
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
						onClick={handleClose}
						disabled={confirmPaymentMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={() => {
							if (!installment) return;
							const intervalDays = nextIntervalDays
								? Number.parseInt(nextIntervalDays, 10) || undefined
								: undefined;
							confirmPaymentMutation.mutate({
								installmentId: installment.id,
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
