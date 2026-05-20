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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Waive Installment</DialogTitle>
					<DialogDescription>
						{waiveInstallment
							? `Waive Installment ${waiveInstallment.installmentNumber} — ${formatPrice(waiveInstallment.amount ?? 0, "MYR")}.`
							: "Waive this installment."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-destructive text-sm">
						Waiving is permanent. The installment will not be collected.
					</p>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="waive-reason">
							Reason <span className="text-destructive">*</span>
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

				<DialogFooter>
					<Button
						variant="outline"
						onClick={handleClose}
						disabled={waiveMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
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
