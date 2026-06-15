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
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						REFUNDS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Reject Refund
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Provide a reason for rejection. This will be visible in the audit
						trail.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="reject-notes">
								Rejection Notes <span className="text-rose-600">*</span>
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
				</div>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						className="bg-red-600 hover:bg-red-700 text-white"
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
