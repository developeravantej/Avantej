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

/**
 * Reason-required confirm dialog for unlocking a payroll period. Replaces the
 * old `window.prompt` path (unautomatable + off-convention UX). Mirrors the
 * expenses RejectExpenseDialog pattern: fully controlled by the parent page,
 * destructive styling, confirm disabled until a valid reason (min 3 chars —
 * same floor the server's zod schema enforces) is entered.
 */
export function UnlockPeriodDialog({
	open,
	onOpenChange,
	reason,
	setReason,
	isPending,
	onConfirm,
	onCancel,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	reason: string;
	setReason: (val: string) => void;
	isPending: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	const reasonTooShort = reason.trim().length < 3;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PAYROLL PERIODS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Unlock Payroll Period
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Unlocking re-opens this commission window so back-dated corrections
						can be posted. The reason is recorded in the audit log.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="unlock-period-reason">
							Unlock Reason <span className="text-rose-600">*</span>
						</Label>
						<Textarea
							id="unlock-period-reason"
							placeholder="Why is this period being unlocked? (min 3 characters)"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
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
						disabled={isPending || reasonTooShort}
					>
						{isPending ? "Unlocking…" : "Unlock"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
