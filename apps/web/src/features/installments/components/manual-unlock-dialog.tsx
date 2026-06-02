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

interface ManualUnlockDialogProps {
	open: boolean;
	selectedInstance: InstallmentOverviewItem | null;
	unlockReason: string;
	setUnlockReason: (v: string) => void;
	onClose: () => void;
	manualUnlockMutation: UseMutationResult<
		unknown,
		Error,
		{ packageInstanceId: string; reason: string }
	>;
}

export function ManualUnlockDialog({
	open,
	selectedInstance,
	unlockReason,
	setUnlockReason,
	onClose,
	manualUnlockMutation,
}: ManualUnlockDialogProps) {
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
						Manual Unlock
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Manually unlock this package. A reason is required for audit
						purposes.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="unlock-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="unlock-reason"
								placeholder="Provide a reason for manual unlock…"
								rows={3}
								value={unlockReason}
								onChange={(e) => setUnlockReason(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={manualUnlockMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={() => {
							if (!unlockReason.trim()) {
								toast.error("A reason is required to unlock the package.");
								return;
							}
							if (!selectedInstance) return;
							manualUnlockMutation.mutate({
								packageInstanceId: selectedInstance.id,
								reason: unlockReason.trim(),
							});
						}}
						disabled={manualUnlockMutation.isPending}
					>
						{manualUnlockMutation.isPending ? "Unlocking…" : "Unlock Package"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
