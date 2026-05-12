import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { client } from "@/utils/orpc";
import type { InstallmentOverviewItem } from "./installment-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ManualUnlockDialogProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	packageInstance: InstallmentOverviewItem | null;
	organizationId: string;
	/** Called after successful unlock (caller handles overview invalidation). */
	onSuccess: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ManualUnlockDialog({
	open,
	onOpenChange,
	packageInstance,
	organizationId,
	onSuccess,
}: ManualUnlockDialogProps) {
	const queryClient = useQueryClient();
	const [unlockReason, setUnlockReason] = useState("");

	const manualUnlockMutation = useMutation({
		mutationFn: (vars: { packageInstanceId: string; reason: string }) =>
			client.installments.manualUnlock({
				organizationId,
				packageInstanceId: vars.packageInstanceId,
				reason: vars.reason,
			}),
		onSuccess: () => {
			// Invalidate the per-instance timeline for this package
			if (packageInstance) {
				queryClient.invalidateQueries({
					queryKey: [
						"installments-by-instance",
						organizationId,
						packageInstance.id,
					],
				});
			}
			toast.success("Package unlocked successfully.");
			setUnlockReason("");
			onOpenChange(false);
			onSuccess();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to unlock package."),
	});

	function handleClose() {
		if (manualUnlockMutation.isPending) return;
		setUnlockReason("");
		onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
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
						onClick={handleClose}
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
							if (!packageInstance) return;
							manualUnlockMutation.mutate({
								packageInstanceId: packageInstance.id,
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
