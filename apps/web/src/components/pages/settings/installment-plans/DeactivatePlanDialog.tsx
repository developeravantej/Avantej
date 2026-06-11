import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { InstallmentPlanRow } from "./types";

export type DeactivatePlanDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	target: InstallmentPlanRow | null;
	warning: string | null;
	isDeactivating: boolean;
	onConfirm: () => void;
	onCancel: () => void;
};

export function DeactivatePlanDialog({
	open,
	onOpenChange,
	target,
	warning,
	isDeactivating,
	onConfirm,
	onCancel,
}: DeactivatePlanDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onCancel();
				else onOpenChange(true);
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INSTALLMENT PLANS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Disable Installment Plan
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Are you sure you want to disable{" "}
						<strong className="text-[#0a0a0a]">{target?.name}</strong>?
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					{warning && (
						<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 mb-3">
							{warning}
						</div>
					)}

					<p className="text-xs text-[#737373]">
						Inactive plans are hidden from the service form. Existing
						installment schedules are not affected.
					</p>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<button
						type="button"
						onClick={onCancel}
						disabled={isDeactivating}
						className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isDeactivating}
						className="rounded-lg bg-[#0a0a0a] text-white hover:bg-[#262626] px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isDeactivating ? "Disabling…" : "Disable"}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
