import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CalendarAppointment } from "@/lib/appointment-mapper";

export interface EditForm {
	date: string;
	time: string;
	duration: number;
	notes: string;
	description: string;
}

interface EditAppointmentDialogProps {
	appt: CalendarAppointment | null;
	editForm: EditForm | null;
	isPending: boolean;
	onFormChange: (updater: (f: EditForm | null) => EditForm | null) => void;
	onClose: () => void;
	onSave: () => void;
}

const DURATIONS = [15, 30, 45, 60, 75, 90, 120] as const;

export function EditAppointmentDialog({
	appt,
	editForm,
	isPending,
	onFormChange,
	onClose,
	onSave,
}: EditAppointmentDialogProps) {
	return (
		<Dialog
			open={appt !== null}
			onOpenChange={(open) => { if (!open) onClose(); }}
		>
			<DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl gap-0">
				{appt && editForm && (() => {
					return (
						<>
							{/* Header */}
							<div className="px-6 pt-6 pb-5 border-b border-gray-100">
								<div className="flex items-center gap-3">
									<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
										<Pencil className="size-4 text-gray-500" />
									</div>
									<DialogHeader className="p-0 space-y-0">
										<DialogTitle className="text-base font-bold text-gray-900">Edit Appointment</DialogTitle>
										<DialogDescription className="text-xs text-muted-foreground mt-0.5">{appt.title}</DialogDescription>
									</DialogHeader>
								</div>
							</div>

							{/* Form */}
							<div className="px-6 py-5 space-y-4 bg-white">
								<div className="grid grid-cols-2 gap-3">
									<div className="space-y-1.5">
										<label htmlFor="edit-appt-date" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</label>
										<input
											id="edit-appt-date"
											type="date"
											value={editForm.date}
											onChange={(e) => onFormChange((f) => f ? { ...f, date: e.target.value } : f)}
											className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors"
										/>
									</div>
									<div className="space-y-1.5">
										<label htmlFor="edit-appt-time" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</label>
										<input
											id="edit-appt-time"
											type="time"
											value={editForm.time}
											onChange={(e) => onFormChange((f) => f ? { ...f, time: e.target.value } : f)}
											className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors"
										/>
									</div>
								</div>

								<div className="space-y-1.5">
									<span className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Duration</span>
									<div className="flex flex-wrap gap-2">
										{DURATIONS.map((d) => (
											<button
												key={d}
												type="button"
												onClick={() => onFormChange((f) => f ? { ...f, duration: d } : f)}
												className={cn(
													"rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
													editForm.duration === d
														? "border-blue-500 bg-blue-500 text-white"
														: "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
												)}
											>
												{d < 60 ? `${d}m` : d === 60 ? "1h" : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`}
											</button>
										))}
									</div>
								</div>

								<div className="space-y-1.5">
									<label htmlFor="edit-appt-notes" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</label>
									<textarea
										id="edit-appt-notes"
										value={editForm.notes}
										onChange={(e) => onFormChange((f) => f ? { ...f, notes: e.target.value } : f)}
										placeholder="Internal notes..."
										rows={2}
										className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors resize-none"
									/>
								</div>

								<div className="space-y-1.5">
									<label htmlFor="edit-appt-description" className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</label>
									<textarea
										id="edit-appt-description"
										value={editForm.description}
										onChange={(e) => onFormChange((f) => f ? { ...f, description: e.target.value } : f)}
										placeholder="Visible to client..."
										rows={2}
										className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:bg-white transition-colors resize-none"
									/>
								</div>
							</div>

							{/* Actions */}
							<div className="px-6 pb-6 pt-0 bg-white flex gap-2.5">
								<button
									type="button"
									onClick={onClose}
									className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 font-medium hover:bg-gray-50 transition-colors"
								>
									Cancel
								</button>
								<Button
									className="flex-1 rounded-xl h-10 gap-2"
									disabled={isPending || !editForm.date || !editForm.time}
									onClick={onSave}
								>
									{isPending ? "Saving..." : "Save Changes"}
								</Button>
							</div>
						</>
					);
				})()}
			</DialogContent>
		</Dialog>
	);
}
