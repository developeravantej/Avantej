import { useRef } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/money";
import type { Installment } from "../types";

interface WaiveDialogProps {
	waiveInstallment: Installment | null;
	onClose: () => void;
	waiveMutation: UseMutationResult<
		unknown,
		Error,
		{ installmentId: string; reason: string },
		unknown
	>;
}

export function WaiveDialog({
	waiveInstallment,
	onClose,
	waiveMutation,
}: WaiveDialogProps) {
	// Uncontrolled ref — avoids React-controlled-input issues with automation
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function handleClose() {
		if (reasonRef.current) reasonRef.current.value = "";
		onClose();
	}

	function handleSubmit() {
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!waiveInstallment || !reason) return;
		waiveMutation.mutate({
			installmentId: waiveInstallment.id,
			reason,
		});
	}

	return (
		<Dialog
			open={!!waiveInstallment}
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
						INSTALLMENT PLANS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Waive Installment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{waiveInstallment
							? `Waive Installment ${waiveInstallment.installmentNumber} — ${formatPrice(waiveInstallment.amount ?? 0, "MYR")}.`
							: "Waive this installment."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<p className="rounded-md border border-rose-600/30 bg-rose-600/5 px-3 py-2.5 text-rose-600 text-sm">
							Waiving is permanent. The installment will not be collected.
						</p>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="waive-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="waive-reason"
								ref={reasonRef}
								placeholder="Provide a reason for waiving…"
								rows={3}
								defaultValue=""
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={waiveMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={handleSubmit}
						disabled={waiveMutation.isPending}
					>
						{waiveMutation.isPending ? "Waiving…" : "Waive Installment"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
