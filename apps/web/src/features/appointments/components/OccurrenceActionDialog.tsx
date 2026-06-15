import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Appointment } from "../types";
import type { OccurrenceEditAction } from "@/types/appointments";

interface OccurrenceActionDialogProps {
	appt: Appointment;
	onAction: (action: OccurrenceEditAction, appt: Appointment) => void;
	onClose: () => void;
}

export function OccurrenceActionDialog({
	appt,
	onAction,
	onClose,
}: OccurrenceActionDialogProps) {
	return (
		<Dialog
			open
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						APPOINTMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Recurring Appointment
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						What would you like to do with this occurrence?
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-2 pt-1">
						<button
							type="button"
							className="w-full text-left px-4 py-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm font-medium text-zinc-700 transition-colors"
							onClick={() => onAction("edit_this", appt)}
						>
							Edit this occurrence only
						</button>
						<button
							type="button"
							className="w-full text-left px-4 py-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm font-medium text-zinc-700 transition-colors"
							onClick={() => onAction("cancel_this", appt)}
						>
							Cancel this occurrence only
						</button>
						<button
							type="button"
							className="w-full text-left px-4 py-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm font-medium text-zinc-700 transition-colors"
							onClick={() => onAction("edit_future", appt)}
						>
							Edit this and all future occurrences
						</button>
						<button
							type="button"
							className="w-full text-left px-4 py-2.5 rounded-lg border border-orange-200 hover:bg-orange-50 text-sm font-medium text-orange-700 transition-colors"
							onClick={() => onAction("cancel_future", appt)}
						>
							Cancel this and all future occurrences
						</button>
						<button
							type="button"
							className="w-full text-left px-4 py-2.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm font-medium text-zinc-700 transition-colors"
							onClick={() => onAction("edit_all", appt)}
						>
							Edit all occurrences in this series
						</button>
						<button
							type="button"
							className="w-full text-left px-4 py-2.5 rounded-lg border border-red-200 hover:bg-red-50 text-sm font-medium text-red-700 transition-colors"
							onClick={() => onAction("cancel_all", appt)}
						>
							Cancel entire series
						</button>
					</div>
				</div>
				<div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<button
						type="button"
						className="w-full px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm text-zinc-500 transition-colors"
						onClick={onClose}
					>
						Never mind
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
