import { AlertTriangle } from "lucide-react";
import { useState } from "react";
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
import { useCancelPackageInstance } from "@/features/packages/api";

interface CancelInstanceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	instanceId: string;
	organizationId: string;
	instanceLabel?: string;
}

export function CancelInstanceDialog({
	open,
	onOpenChange,
	instanceId,
	organizationId,
	instanceLabel,
}: CancelInstanceDialogProps) {
	const [reason, setReason] = useState("");
	const cancelMutation = useCancelPackageInstance(organizationId);

	function handleConfirm() {
		if (reason.trim().length < 5) return;
		cancelMutation.mutate(
			{ organizationId, id: instanceId, reason: reason.trim() },
			{
				onSuccess: () => {
					setReason("");
					onOpenChange(false);
				},
			},
		);
	}

	function handleOpenChange(v: boolean) {
		if (!v) setReason("");
		onOpenChange(v);
	}

	const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 5;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md" data-testid="cancel-instance-dialog">
				<DialogHeader>
					<DialogTitle>Cancel Package?</DialogTitle>
					<DialogDescription>
						{instanceLabel ? `Cancelling "${instanceLabel}".` : ""}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Warning */}
					<div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
						<p className="text-sm text-destructive">
							This is irreversible. The customer's credits will not be restored.
						</p>
					</div>

					{/* Reason */}
					<div className="space-y-1.5">
						<Label htmlFor="cancel-reason">
							Reason <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="cancel-reason"
							placeholder="Describe the reason for cancellation…"
							rows={3}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							className={reasonTooShort ? "border-destructive" : ""}
							data-testid="cancel-reason-input"
						/>
						{reasonTooShort && (
							<p className="text-xs text-destructive">Reason must be at least 5 characters.</p>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={cancelMutation.isPending}
					>
						Keep Package
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={handleConfirm}
						disabled={reason.trim().length < 5 || cancelMutation.isPending}
						data-testid="cancel-instance-confirm-button"
					>
						{cancelMutation.isPending ? "Cancelling…" : "Cancel Package"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
