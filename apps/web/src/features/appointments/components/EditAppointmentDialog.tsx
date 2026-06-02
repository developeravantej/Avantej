import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
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
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				{appt &&
					editForm &&
					(() => {
						return (
							<>
								{/* Header */}
								<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
									<div className="flex items-center gap-3">
										<div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f3f3f3]">
											<Pencil className="size-4 text-[#737373]" />
										</div>
										<div className="space-y-0">
											<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
												APPOINTMENTS
											</p>
											<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
												Edit Appointment
											</DialogTitle>
											<DialogDescription className="text-sm text-[#737373] mt-0.5">
												{appt.title}
											</DialogDescription>
										</div>
									</div>
								</DialogHeader>

								{/* Form */}
								<div className="px-6 pt-4 pb-2 overflow-y-auto">
									<div className="space-y-4">
										<div className="grid grid-cols-2 gap-3">
											<div className="space-y-1.5">
												<label
													htmlFor="edit-appt-date"
													className="text-xs font-semibold text-[#737373] uppercase tracking-wide"
												>
													Date
												</label>
												<input
													id="edit-appt-date"
													type="date"
													value={editForm.date}
													onChange={(e) =>
														onFormChange((f) =>
															f ? { ...f, date: e.target.value } : f,
														)
													}
													className="w-full rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:bg-white transition-colors"
												/>
											</div>
											<div className="space-y-1.5">
												<label
													htmlFor="edit-appt-time"
													className="text-xs font-semibold text-[#737373] uppercase tracking-wide"
												>
													Time
												</label>
												<input
													id="edit-appt-time"
													type="time"
													value={editForm.time}
													onChange={(e) =>
														onFormChange((f) =>
															f ? { ...f, time: e.target.value } : f,
														)
													}
													className="w-full rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2.5 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:bg-white transition-colors"
												/>
											</div>
										</div>

										<div className="space-y-1.5">
											<span className="block text-xs font-semibold text-[#737373] uppercase tracking-wide">
												Duration
											</span>
											<div className="flex flex-wrap gap-2">
												{DURATIONS.map((d) => (
													<button
														key={d}
														type="button"
														onClick={() =>
															onFormChange((f) =>
																f ? { ...f, duration: d } : f,
															)
														}
														className={cn(
															"rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
															editForm.duration === d
																? "border-blue-500 bg-blue-500 text-white"
																: "border-[#e5e5e5] bg-[#f3f3f3] text-zinc-700 hover:bg-zinc-100",
														)}
													>
														{d < 60
															? `${d}m`
															: d === 60
																? "1h"
																: d % 60 === 0
																	? `${d / 60}h`
																	: `${Math.floor(d / 60)}h ${d % 60}m`}
													</button>
												))}
											</div>
										</div>

										<div className="space-y-1.5">
											<label
												htmlFor="edit-appt-notes"
												className="text-xs font-semibold text-[#737373] uppercase tracking-wide"
											>
												Notes
											</label>
											<textarea
												id="edit-appt-notes"
												value={editForm.notes}
												onChange={(e) =>
													onFormChange((f) =>
														f ? { ...f, notes: e.target.value } : f,
													)
												}
												placeholder="Internal notes..."
												rows={2}
												className="w-full rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:bg-white transition-colors resize-none"
											/>
										</div>

										<div className="space-y-1.5">
											<label
												htmlFor="edit-appt-description"
												className="text-xs font-semibold text-[#737373] uppercase tracking-wide"
											>
												Description
											</label>
											<textarea
												id="edit-appt-description"
												value={editForm.description}
												onChange={(e) =>
													onFormChange((f) =>
														f ? { ...f, description: e.target.value } : f,
													)
												}
												placeholder="Visible to client..."
												rows={2}
												className="w-full rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 focus:bg-white transition-colors resize-none"
											/>
										</div>
									</div>
								</div>

								{/* Footer */}
								<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
									<button
										type="button"
										onClick={onClose}
										className="rounded-xl border border-[#e5e5e5] px-4 py-2.5 text-sm text-[#737373] font-medium hover:bg-[#f3f3f3] transition-colors"
									>
										Cancel
									</button>
									<Button
										className="rounded-xl h-10 gap-2 bg-[#0a0a0a] text-white hover:bg-[#262626]"
										disabled={isPending || !editForm.date || !editForm.time}
										onClick={onSave}
									>
										{isPending ? "Saving..." : "Save Changes"}
									</Button>
								</DialogFooter>
							</>
						);
					})()}
			</DialogContent>
		</Dialog>
	);
}
