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

// ─── Reject Dialog ─────────────────────────────────────────────────────────────

export function RejectDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (notes: string) => void;
	isPending: boolean;
}) {
	const [notes, setNotes] = useState("");

	function handleConfirm() {
		if (!notes.trim()) return;
		onConfirm(notes.trim());
	}

	function handleClose() {
		setNotes("");
		onOpenChange(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Reject Refund</DialogTitle>
					<DialogDescription>
						Provide a reason for rejection. This will be visible in the audit trail.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="reject-notes">
							Rejection Notes <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="reject-notes"
							rows={3}
							placeholder="Explain why this refund is being rejected…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={isPending || !notes.trim()}
					>
						{isPending ? "Rejecting…" : "Reject"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
