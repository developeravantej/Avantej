/**
 * TimePresetEditor
 *
 * Extracted from service-form.tsx (Phase 4 god-file cleanup).
 * Renders the recurring-days checkboxes and per-day time-slot pickers
 * for services with schedulingType === "time-preset".
 */

const DAY_ORDER = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
] as const;

export type DayOfWeek = (typeof DAY_ORDER)[number];

export interface TimePresetConfig {
	recurringDays: string[];
	timeSlotsPerDay: Record<string, string[]>;
}

interface TimePresetEditorProps {
	config: TimePresetConfig;
	isPending: boolean;
	onDayToggle: (day: string) => void;
	onAddSlot: (day: string) => void;
	onRemoveSlot: (day: string, index: number) => void;
	onUpdateSlot: (day: string, index: number, value: string) => void;
}

export function TimePresetEditor({
	config,
	isPending,
	onDayToggle,
	onAddSlot,
	onRemoveSlot,
	onUpdateSlot,
}: TimePresetEditorProps) {
	return (
		<div className="rounded-2xl border border-brand-secondary-3 bg-card p-6 space-y-4">
			<h4 className="font-subheading text-sm text-foreground">Time-Preset Configuration</h4>

			{/* Recurring Days */}
			<div>
				<span className="block text-sm font-medium text-foreground mb-2">
					Recurring Days <span className="text-destructive">*</span>
				</span>
				<div className="grid grid-cols-7 gap-2">
					{DAY_ORDER.map((day) => (
						<div key={day} className="flex items-center">
							<input
								type="checkbox"
								id={`day-${day}`}
								checked={config.recurringDays.includes(day)}
								onChange={() => onDayToggle(day)}
								disabled={isPending}
								className="size-4 accent-primary text-primary focus:ring-ring border-brand-secondary-3 rounded"
							/>
							<label htmlFor={`day-${day}`} className="ml-1 text-xs text-foreground">
								{day.slice(0, 3)}
							</label>
						</div>
					))}
				</div>
			</div>

			{/* Time Slots per Day */}
			<div>
				<span className="block text-sm font-medium text-foreground mb-2">
					Time Slots per Day <span className="text-destructive">*</span>
				</span>
				<div className="space-y-4">
					{config.recurringDays
						.toSorted(
							(a, b) =>
								DAY_ORDER.indexOf(a as DayOfWeek) -
								DAY_ORDER.indexOf(b as DayOfWeek),
						)
						.map((day) => (
							<div key={day} className="border border-brand-secondary-3 rounded-lg p-3">
								<div className="flex items-center justify-between mb-2">
									<h5 className="text-sm font-medium text-foreground">{day}</h5>
									<button
										type="button"
										onClick={() => onAddSlot(day)}
										disabled={isPending}
										className="inline-flex items-center px-2 py-1 border border-brand-secondary-3 shadow-xs text-xs leading-4 font-medium rounded-md text-foreground bg-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											className="size-3 mr-1"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fillRule="evenodd"
												d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
												clipRule="evenodd"
											/>
										</svg>
										Add Time
									</button>
								</div>
								<div className="space-y-2">
									{(config.timeSlotsPerDay[day] || []).map((time, index) => (
										<div key={index} className="flex items-center gap-2">
											<input
												type="time"
												value={time}
												onChange={(e) => onUpdateSlot(day, index, e.target.value)}
												disabled={isPending}
												className="p-2 rounded-md border border-input bg-white shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
											/>
											<button
												type="button"
												onClick={() => onRemoveSlot(day, index)}
												disabled={
													isPending ||
													(config.timeSlotsPerDay[day] || []).length === 1
												}
												className="p-2 text-muted-foreground hover:text-muted-foreground disabled:opacity-40"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													className="size-4"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path
														fillRule="evenodd"
														d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
														clipRule="evenodd"
													/>
												</svg>
											</button>
										</div>
									))}
									{(!config.timeSlotsPerDay[day] ||
										config.timeSlotsPerDay[day].length === 0) && (
										<p className="text-sm text-muted-foreground italic">
											No time slots configured for {day}
										</p>
									)}
								</div>
							</div>
						))}
					{config.recurringDays.length === 0 && (
						<p className="text-sm text-muted-foreground italic">
							Select recurring days above to configure time slots
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
