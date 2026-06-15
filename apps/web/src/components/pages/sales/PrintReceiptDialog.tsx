import { Printer } from "lucide-react";
import type { ReceiptData } from "@/components/pos/receipt-view";
import { ReceiptView } from "@/components/pos/receipt-view";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export interface PrintReceiptDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	receiptLoading: boolean;
	receiptError: boolean;
	receiptData: ReceiptData | null;
	onRetry: () => void;
}

export function PrintReceiptDialog({
	open,
	onOpenChange,
	receiptLoading,
	receiptError,
	receiptData,
	onRetry,
}: PrintReceiptDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						POINT OF SALE
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Print Receipt
					</DialogTitle>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					{receiptLoading ? (
						<div className="flex flex-col items-center justify-center gap-3 py-10">
							<div className="h-5 w-40 rounded bg-[#e5e5e5] animate-pulse" />
							<div className="h-4 w-32 rounded bg-[#e5e5e5] animate-pulse" />
							<p className="mt-2 text-sm text-[#737373]">Loading receipt…</p>
						</div>
					) : receiptError || receiptData == null ? (
						<div
							className="flex flex-col items-center justify-center gap-3 py-10"
							data-testid="receipt-unavailable-message"
						>
							<p className="font-medium text-rose-600">Receipt unavailable</p>
							<p className="text-center text-sm text-[#737373]">
								Receipt data could not be loaded. Please try again or contact
								support.
							</p>
							<Button variant="outline" size="sm" onClick={onRetry}>
								Retry
							</Button>
						</div>
					) : (
						<ReceiptView data={receiptData} />
					)}
				</div>
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2 print:hidden">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Close
					</Button>
					{!receiptLoading && !receiptError && receiptData != null && (
						<Button
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
							onClick={() => window.print()}
						>
							<Printer className="mr-2 h-4 w-4" />
							Print
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
