import { X } from "lucide-react";
import type { Appointment } from "../types";
import type { OccurrenceEditAction } from "@/types/appointments";

interface OccurrenceActionDialogProps {
	appt: Appointment;
	onAction: (action: OccurrenceEditAction, appt: Appointment) => void;
	onClose: () => void;
}

export function OccurrenceActionDialog({ appt, onAction, onClose }: OccurrenceActionDialogProps) {
	return (
		<div
			role="presentation"
			className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				className="bg-white rounded-lg shadow-xl p-6 w-[360px] max-w-[95vw]"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg font-semibold text-zinc-900">Recurring Appointment</h3>
					<button
						type="button"
						className="text-zinc-400 hover:text-zinc-600"
						onClick={onClose}
					>
						<X className="size-5" />
					</button>
				</div>
				<p className="text-sm text-zinc-500 mb-4">
					What would you like to do with this occurrence?
				</p>
				<div className="flex flex-col gap-2">
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
				<button
					type="button"
					className="w-full mt-3 px-4 py-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-sm text-zinc-500 transition-colors"
					onClick={onClose}
				>
					Never mind
				</button>
			</div>
		</div>
	);
}
