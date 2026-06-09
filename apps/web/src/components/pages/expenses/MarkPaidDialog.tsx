import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MarkPaidDialog({
	open,
	onOpenChange,
	paymentReference,
	setPaymentReference,
	isPending,
	onConfirm,
	onCancel,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	paymentReference: string;
	setPaymentReference: (val: string) => void;
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
						Mark as Paid
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Optionally enter a payment reference before confirming.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-1.5">
						<Label>
							Payment Reference{" "}
							<span className="text-[#737373] text-xs font-normal">
								(optional)
							</span>
						</Label>
						<Input
							placeholder="e.g. TXN-20240101-001"
							value={paymentReference}
							onChange={(e) => setPaymentReference(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? "Processing…" : "Confirm"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
