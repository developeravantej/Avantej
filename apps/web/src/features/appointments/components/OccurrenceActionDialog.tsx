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

export function OccurrenceActionDialog({ appt, onAction, onClose }: OccurrenceActionDialogProps) {
	return (
		<Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Recurring Appointment</DialogTitle>
					<DialogDescription>
						What would you like to do with this occurrence?
					</DialogDescription>
				</DialogHeader>
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
					<button
						type="button"
						className="w-full mt-1 px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm text-zinc-500 transition-colors"
						onClick={onClose}
					>
						Never mind
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
