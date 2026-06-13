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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { client, orpc } from "@/utils/orpc";

export interface WaiveInstallmentTarget {
	installmentId: string;
	installmentNumber: number;
	installmentsTotal: number;
	packageInstanceId: string;
	customerName: string | null;
}

export interface WaiveInstallmentDialogProps {
	organizationId: string;
	target: WaiveInstallmentTarget | null;
	onClose: () => void;
}

export function WaiveInstallmentDialog({
	organizationId,
	target,
	onClose,
}: WaiveInstallmentDialogProps) {
	const queryClient = useQueryClient();
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function reset() {
		if (reasonRef.current) reasonRef.current.value = "";
	}

	const waiveMutation = useMutation({
		mutationFn: (vars: { reason: string }) =>
			client.installments.waive({
				organizationId,
				installmentId: target?.installmentId ?? "",
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-upcoming"],
			});
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-due-soon-count"],
			});
			queryClient.invalidateQueries({
				queryKey: [
					"sales-installments-schedule",
					organizationId,
					target?.packageInstanceId,
				],
			});
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success("Installment waived.");
			reset();
			onClose();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to waive installment."),
	});

	function handleSubmit() {
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!target || !reason) return;
		waiveMutation.mutate({ reason });
	}

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
						Waive Installment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `Installment ${target.installmentNumber} of ${target.installmentsTotal}${target.customerName ? ` — ${target.customerName}` : ""}. This installment will be marked as waived and credits will be unlocked accordingly.`
							: "Waive this installment without requiring payment."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="waive-installment-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="waive-installment-reason"
								ref={reasonRef}
								placeholder="Provide a reason for waiving this installment…"
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
						disabled={waiveMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						data-testid="waive-installment-confirm"
						onClick={handleSubmit}
						disabled={waiveMutation.isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{waiveMutation.isPending ? "Waiving…" : "Waive Installment"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
