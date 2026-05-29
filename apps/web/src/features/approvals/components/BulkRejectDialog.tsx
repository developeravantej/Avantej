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
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import type { PendingRow } from "../approvals.types";

export function BulkRejectDialog({
	open,
	onOpenChange,
	organizationId,
	selectedRows,
	onDone,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	organizationId: string;
	selectedRows: PendingRow[];
	onDone: () => void;
}) {
	const [reason, setReason] = useState("");

	const mutation = useApiMutation({
		mutationFn: () =>
			client.packageInstances.bulkReject({
				organizationId,
				packageInstanceIds: selectedRows.map((r) => r.id),
				reason: reason.trim() || undefined,
			}),
		successMessage: (res: { succeededCount: number; failedCount: number }) =>
			res.failedCount === 0
				? `Rejected ${res.succeededCount} package${res.succeededCount === 1 ? "" : "s"}.`
				: `Rejected ${res.succeededCount}, ${res.failedCount} failed.`,
		errorMessage: (err) => err?.message ?? "Bulk rejection failed.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			onDone();
			onOpenChange(false);
			setReason("");
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>
						Reject {selectedRows.length} package{selectedRows.length === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						The customers will be notified. This cannot be undone — affected
						packages move to <b>cancelled</b> status.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					<Label htmlFor="bulk-reject-reason">Reason (optional)</Label>
					<Textarea
						id="bulk-reject-reason"
						placeholder="e.g. duplicate purchase, customer requested cancellation…"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						maxLength={500}
						rows={3}
					/>
					<div className="text-[11px] text-muted-foreground">
						{reason.length}/500
					</div>
				</div>

				<DialogFooter className="mt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending
							? "Rejecting…"
							: `Reject ${selectedRows.length}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
