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
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Manual Unlock</DialogTitle>
					<DialogDescription>
						Manually unlock this package. A reason is required for audit
						purposes.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="unlock-reason">
							Reason <span className="text-destructive">*</span>
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

				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={manualUnlockMutation.isPending}
					>
						Cancel
					</Button>
					<Button
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
