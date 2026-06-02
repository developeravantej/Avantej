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
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
				data-testid="cancel-instance-dialog"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PACKAGE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Cancel Package?
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{instanceLabel ? `Cancelling "${instanceLabel}".` : ""}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4 py-2">
						{/* Warning */}
						<div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
							<p className="text-sm text-rose-600">
								This is irreversible. The customer's credits will not be
								restored.
							</p>
						</div>

						{/* Reason */}
						<div className="space-y-1.5">
							<Label htmlFor="cancel-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="cancel-reason"
								placeholder="Describe the reason for cancellation…"
								rows={3}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								className={reasonTooShort ? "border-rose-600" : ""}
								data-testid="cancel-reason-input"
							/>
							{reasonTooShort && (
								<p className="text-xs text-rose-600">
									Reason must be at least 5 characters.
								</p>
							)}
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
						className="bg-red-600 hover:bg-red-700 text-white"
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
