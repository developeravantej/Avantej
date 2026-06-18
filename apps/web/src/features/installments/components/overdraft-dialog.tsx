import type { UseMutationResult } from "@tanstack/react-query";
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
import type { InstallmentOverviewItem } from "../types";

interface OverdraftDialogProps {
	open: boolean;
	selectedInstance: InstallmentOverviewItem | null;
	organizationId: string;
	overdraftReason: string;
	setOverdraftReason: (v: string) => void;
	onClose: () => void;
	setOverdraftMutation: UseMutationResult<
		unknown,
		Error,
		{
			organizationId: string;
			packageInstanceId: string;
			enabled: boolean;
			reason: string;
		}
	>;
}

export function OverdraftDialog({
	open,
	selectedInstance,
	organizationId,
	overdraftReason,
	setOverdraftReason,
	onClose,
	setOverdraftMutation,
}: OverdraftDialogProps) {
	const currentOverdraft = !!(
		selectedInstance as { allowCreditOverdraft?: boolean } | null
	)?.allowCreditOverdraft;

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
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
						{selectedInstance &&
						(selectedInstance as { allowCreditOverdraft?: boolean })
							.allowCreditOverdraft
							? "Disable Overdraft"
							: "Allow Overdraft"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{selectedInstance &&
						(selectedInstance as { allowCreditOverdraft?: boolean })
							.allowCreditOverdraft
							? "Disabling overdraft will prevent credit consumption when the package is locked."
							: "Allowing overdraft lets the customer continue booking even when the package is locked due to a missed installment."}{" "}
						A reason is required for audit purposes.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="overdraft-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="overdraft-reason"
								placeholder="Provide a reason…"
								rows={3}
								value={overdraftReason}
								onChange={(e) => setOverdraftReason(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={setOverdraftMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={() => {
							if (!selectedInstance || !overdraftReason.trim()) {
								toast.error("A reason is required.");
								return;
							}
							setOverdraftMutation.mutate({
								organizationId: organizationId ?? "",
								packageInstanceId: selectedInstance.id,
								enabled: !currentOverdraft,
								reason: overdraftReason.trim(),
							});
						}}
						disabled={!overdraftReason.trim() || setOverdraftMutation.isPending}
					>
						{setOverdraftMutation.isPending ? "Saving…" : "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
