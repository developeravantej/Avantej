import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { client, orpc } from "@/utils/orpc";

export interface RescheduleTarget {
	installmentId: string;
	installmentNumber: number;
	installmentsTotal: number;
	currentDueDate: Date | string;
	customerName: string | null;
}

export interface RescheduleInstallmentDialogProps {
	organizationId: string;
	target: RescheduleTarget | null;
	onClose: () => void;
}

export function RescheduleInstallmentDialog({
	organizationId,
	target,
	onClose,
}: RescheduleInstallmentDialogProps) {
	const queryClient = useQueryClient();
	const todayIso = new Date().toISOString().slice(0, 10);
	// Uncontrolled refs — date pickers don't fire synthetic onChange reliably.
	const dateRef = useRef<HTMLInputElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function reset() {
		if (dateRef.current) dateRef.current.value = "";
		if (reasonRef.current) reasonRef.current.value = "";
	}

	const rescheduleMutation = useMutation({
		mutationFn: (vars: { newDueDate: string; reason: string }) =>
			client.installments.reschedule({
				organizationId,
				installmentId: target?.installmentId ?? "",
				newDueDate: vars.newDueDate,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-upcoming"],
			});
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-due-soon-count"],
			});
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success("Installment rescheduled.");
			reset();
			onClose();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to reschedule."),
	});

	function handleSubmit() {
		const rawDate = dateRef.current?.value ?? "";
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!target || !rawDate || !reason) return;
		// Backend expects a full ISO datetime; the date input gives YYYY-MM-DD.
		rescheduleMutation.mutate({
			newDueDate: `${rawDate}T00:00:00.000Z`,
			reason,
		});
	}

	const currentDueLabel = target
		? new Date(target.currentDueDate).toLocaleDateString("en-MY", {
				day: "numeric",
				month: "short",
				year: "numeric",
			})
		: "";

	return (
		<Dialog
			open={!!target}
			onOpenChange={(open) => {
				if (!open) {
					reset();
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
						Reschedule Installment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `Installment ${target.installmentNumber} of ${target.installmentsTotal}${target.customerName ? ` — ${target.customerName}` : ""}. Currently due ${currentDueLabel}.`
							: "Reschedule this installment to a new due date."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="sales-reschedule-date">
								New Due Date <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="sales-reschedule-date"
								ref={dateRef}
								type="date"
								min={todayIso}
								defaultValue=""
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="sales-reschedule-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="sales-reschedule-reason"
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
						onClick={() => {
							reset();
							onClose();
						}}
						disabled={rescheduleMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						data-testid="reschedule-installment-confirm"
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
