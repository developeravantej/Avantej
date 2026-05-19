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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reschedule Installment</DialogTitle>
					<DialogDescription>
						{rescheduleInstallment
							? `Reschedule Installment ${rescheduleInstallment.installmentNumber} to a new due date.`
							: "Reschedule this installment to a new due date."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="reschedule-date">
							New Due Date <span className="text-destructive">*</span>
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
							Reason <span className="text-destructive">*</span>
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

				<DialogFooter>
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
					>
						{rescheduleMutation.isPending ? "Rescheduling…" : "Reschedule"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
