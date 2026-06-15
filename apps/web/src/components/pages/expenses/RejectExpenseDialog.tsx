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

export function RejectExpenseDialog({
	open,
	onOpenChange,
	rejectionReason,
	setRejectionReason,
	isPending,
	onConfirm,
	onCancel,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	rejectionReason: string;
	setRejectionReason: (val: string) => void;
	isPending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						EXPENSE TRACKER
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Reject Expense
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Please provide a reason for rejecting this expense claim.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-1.5">
						<Label>
							Rejection Reason <span className="text-rose-600">*</span>
						</Label>
						<Textarea
							placeholder="Explain why this expense is being rejected..."
							value={rejectionReason}
							onChange={(e) => setRejectionReason(e.target.value)}
							rows={3}
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						className="bg-red-600 hover:bg-red-700 text-white"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? "Rejecting…" : "Reject"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
