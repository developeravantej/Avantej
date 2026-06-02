/**
 * Reject Package confirmation dialog (admin-only). Calls
 * `packageInstances.reject` with an optional free-text reason.
 */

import { useEffect, useState } from "react";
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
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";

type RejectPackageDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	packageInstanceId: string | null;
	customerName?: string | null;
	serviceName?: string | null;
	onRejected?: () => void;
};

export function RejectPackageDialog({
	open,
	onOpenChange,
	organizationId,
	packageInstanceId,
	customerName,
	serviceName,
	onRejected,
}: RejectPackageDialogProps) {
	const [reason, setReason] = useState("");

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: open toggles externally, not a user event
	useEffect(() => {
		if (open) setReason("");
	}, [open]);

	const mutation = useApiMutation({
		mutationFn: () => {
			if (!packageInstanceId) throw new Error("Missing package");
			return client.packageInstances.reject({
				organizationId,
				packageInstanceId,
				reason: reason.trim() || undefined,
			});
		},
		successMessage: "Package rejected. Customer notified.",
		errorMessage: (err) => err?.message ?? "Failed to reject package.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			onRejected?.();
			onOpenChange(false);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PACKAGE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Reject package
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{customerName || serviceName
							? `Reject ${customerName ?? "this customer"}'s ${serviceName ?? "package"} purchase?`
							: "Reject this package purchase?"}{" "}
						The customer will be notified. This cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-2">
						<Label htmlFor="reject-reason">Reason (optional)</Label>
						<Textarea
							id="reject-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="e.g. customer requested cancellation, no eligible trainer, etc."
							rows={3}
							maxLength={500}
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending || !packageInstanceId}
					>
						{mutation.isPending ? "Rejecting…" : "Reject"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
