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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Installment } from "../types";

interface RescheduleDialogProps {
	rescheduleInstallment: Installment | null;
	onClose: () => void;
	rescheduleMutation: UseMutationResult<
		unknown,
		Error,
		{ installmentId: string; newDueDate: string; reason: string },
		unknown
	>;
}

export function RescheduleDialog({
	rescheduleInstallment,
	onClose,
	rescheduleMutation,
}: RescheduleDialogProps) {
	const todayIso = new Date().toISOString().slice(0, 10);
	// Uncontrolled refs — avoids React-controlled-input issues with date pickers
	// that don't fire synthetic onChange events reliably across all input methods.
	const dateRef = useRef<HTMLInputElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function handleClose() {
		if (dateRef.current) dateRef.current.value = "";
		if (reasonRef.current) reasonRef.current.value = "";
		onClose();
	}

	function handleSubmit() {
		const rawDate = dateRef.current?.value ?? "";
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!rescheduleInstallment || !rawDate || !reason) return;
		// The backend schema requires a full ISO datetime; the date input gives YYYY-MM-DD only.
		const newDueDate = `${rawDate}T00:00:00.000Z`;
		rescheduleMutation.mutate({
			installmentId: rescheduleInstallment.id,
			newDueDate,
			reason,
		});
	}

	return (
		<Dialog
			open={!!rescheduleInstallment}
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
						Reschedule Installment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{rescheduleInstallment
							? `Reschedule Installment ${rescheduleInstallment.installmentNumber} to a new due date.`
							: "Reschedule this installment to a new due date."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="reschedule-date">
								New Due Date <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="reschedule-date"
								ref={dateRef}
								type="date"
								min={todayIso}
								defaultValue=""
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="reschedule-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="reschedule-reason"
								ref={reasonRef}
								placeholder="Provide a reason for rescheduling…"
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
						disabled={rescheduleMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={rescheduleMutation.isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{rescheduleMutation.isPending ? "Rescheduling…" : "Reschedule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
