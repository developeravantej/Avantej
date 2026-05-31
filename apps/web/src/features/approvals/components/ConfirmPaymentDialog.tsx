import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import type { PendingRow } from "../approvals.types";

type OfflineMethod = "manual_transfer" | "cash" | "card" | "fpx";

const METHOD_LABELS: Record<OfflineMethod, string> = {
	manual_transfer: "Manual transfer",
	cash: "Cash",
	card: "Card (terminal)",
	fpx: "FPX",
};

/**
 * Confirm that an off-platform payment has been RECEIVED for a package awaiting
 * payment. Calls the package-level `packageInstances.confirmPayment` procedure,
 * which marks single payments paid or confirms the next installment. Online
 * (Stripe) payments are NOT confirmed here — they auto-confirm via webhook.
 */
export function ConfirmPaymentDialog({
	open,
	onOpenChange,
	organizationId,
	row,
	onConfirmed,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	organizationId: string;
	row: PendingRow | null;
	onConfirmed: () => void;
}) {
	// Default the method selector to the recorded payment method when it's an
	// offline method, otherwise manual_transfer.
	const recorded = row?.paymentMethod;
	const initialMethod: OfflineMethod =
		recorded === "cash" || recorded === "card" || recorded === "fpx"
			? recorded
			: "manual_transfer";
	const [paymentMethod, setPaymentMethod] =
		useState<OfflineMethod>(initialMethod);
	const [notes, setNotes] = useState("");

	const mutation = useApiMutation({
		mutationFn: () =>
			client.packageInstances.confirmPayment({
				organizationId,
				packageInstanceId: row?.id ?? "",
				paymentMethod,
				notes: notes.trim() || undefined,
			}),
		successMessage: (res: { alreadyConfirmed?: boolean }) =>
			res?.alreadyConfirmed
				? "Payment was already confirmed."
				: "Payment confirmed — package is ready for trainer assignment.",
		errorMessage: (err) => err?.message ?? "Failed to confirm payment.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			onConfirmed();
			onOpenChange(false);
			setNotes("");
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				hideCloseButton
				className="sm:max-w-[460px] p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PENDING APPROVALS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Confirm payment received
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{row?.customerName ? `${row.customerName} — ` : ""}
						{row?.serviceName ?? "this package"}. Marks the payment as received
						so the package can be assigned to a trainer. Use this only once the
						money has actually arrived.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 space-y-4">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="confirm-payment-method">Payment method</Label>
						<Select
							value={paymentMethod}
							onValueChange={(v) => setPaymentMethod(v as OfflineMethod)}
						>
							<SelectTrigger id="confirm-payment-method">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(METHOD_LABELS) as OfflineMethod[]).map((m) => (
									<SelectItem key={m} value={m}>
										{METHOD_LABELS[m]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="confirm-payment-notes">
							Notes{" "}
							<span className="text-[#737373] font-normal text-xs">
								(optional)
							</span>
						</Label>
						<Textarea
							id="confirm-payment-notes"
							placeholder="e.g. bank ref, received at front desk…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							maxLength={500}
							rows={2}
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending || !row}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{mutation.isPending ? "Confirming…" : "Confirm payment"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
