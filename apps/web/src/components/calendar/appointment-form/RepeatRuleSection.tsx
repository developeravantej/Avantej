import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CustomRecurrence } from "@/types/appointments";

type RepeatRuleSectionProps = {
	recurrence: string;
	customRecurrence: CustomRecurrence | null | undefined;
	startDate: string;
	getWeekPosition: (date: Date) => string;
	onChangeRecurrence: (value: string) => void;
	onChangeCustomRecurrence: (field: string, value: unknown) => void;
	onToggleDay: (day: string) => void;
	tooltipText?: string;
};

const DAYS = [
	{ key: "M", label: "M", full: "Monday" },
	{ key: "T", label: "T", full: "Tuesday" },
	{ key: "W", label: "W", full: "Wednesday" },
	{ key: "TH", label: "T", full: "Thursday" },
	{ key: "F", label: "F", full: "Friday" },
	{ key: "S", label: "S", full: "Saturday" },
	{ key: "SU", label: "S", full: "Sunday" },
];

export function RepeatRuleSection({
	recurrence,
	customRecurrence,
	startDate,
	getWeekPosition,
	onChangeRecurrence,
	onChangeCustomRecurrence,
	onToggleDay,
	tooltipText = "Set how often this appointment repeats. Recurring appointments will multiply the credit cost.",
}: RepeatRuleSectionProps) {
	const parsedDate = startDate ? new Date(startDate) : null;

	const weeklyLabel = parsedDate
		? parsedDate.toLocaleDateString("en-US", { weekday: "long" })
		: "selected day";
	const weekPosition = parsedDate
		? getWeekPosition(parsedDate)
		: "selected week";
	const annualLabel = parsedDate
		? parsedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })
		: "MM DD";
	const dayOfMonth = parsedDate ? parsedDate.getDate() : "selected day";

	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<Label
					htmlFor="recurrence"
					className="text-sm font-medium text-brand-primary-1"
				>
					Recurrence
				</Label>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="size-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium"
						>
							?
						</button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						align="start"
						className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none"
					>
						<p className="text-black font-medium">{tooltipText}</p>
					</TooltipContent>
				</Tooltip>
			</div>

			<Select value={recurrence} onValueChange={onChangeRecurrence}>
				<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
					<SelectValue placeholder="Select recurrence" />
				</SelectTrigger>
				<SelectContent className="z-[10001]">
					<SelectItem value="none">Does not repeat</SelectItem>
					<SelectItem value="daily">Daily</SelectItem>
					<SelectItem value="weekly">Weekly on {weeklyLabel}</SelectItem>
					<SelectItem value="monthly-week">
						Monthly on the {weekPosition} {weeklyLabel}
					</SelectItem>
					<SelectItem value="annually">Annually on {annualLabel}</SelectItem>
					<SelectItem value="weekdays">Every weekday (Mon-Fri)</SelectItem>
					<SelectItem value="custom">Custom</SelectItem>
				</SelectContent>
			</Select>

			{/* Custom recurrence panel */}
			{recurrence === "custom" && (
				<div className="space-y-6 p-6 bg-brand-secondary-3/50 rounded-lg border border-brand-secondary-3 mt-2">
					<h4 className="text-lg font-semibold text-brand-primary-1">
						Custom Recurrence
					</h4>

					{/* Repeat every */}
					<div className="space-y-3">
						<Label className="text-sm font-medium text-brand-primary-1">
							Repeat every
						</Label>
						<div className="flex items-center gap-x-3">
							<Input
								type="number"
								min="1"
								max="99"
								value={customRecurrence?.frequency ?? 1}
								onChange={(e) =>
									onChangeCustomRecurrence(
										"frequency",
										parseInt(e.target.value) || 1,
									)
								}
								className="w-20 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 text-center"
							/>
							<Select
								value={customRecurrence?.timeUnit ?? "week"}
								onValueChange={(value) =>
									onChangeCustomRecurrence("timeUnit", value)
								}
							>
								<SelectTrigger className="w-32 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="z-[10001]">
									<SelectItem value="day">day</SelectItem>
									<SelectItem value="week">week</SelectItem>
									<SelectItem value="month">month</SelectItem>
									<SelectItem value="year" disabled>
										year (coming soon)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Repeat on (weekly) */}
					{customRecurrence?.timeUnit === "week" && (
						<div className="space-y-3">
							<Label className="text-sm font-medium text-brand-primary-1">
								Repeat on
							</Label>
							<div className="flex gap-2">
								{DAYS.map((day) => (
									<button
										key={day.key}
										type="button"
										onClick={() => onToggleDay(day.key)}
										className={`size-10 rounded-full border-2 flex items-center justify-center text-sm font-medium transition-colors ${
											customRecurrence?.repeatOn.includes(day.key)
												? "bg-blue-600 border-blue-600 text-white"
												: "bg-white border-brand-secondary-3 text-brand-secondary-1 hover:border-brand-secondary-2"
										}`}
										title={day.full}
									>
										{day.label}
									</button>
								))}
							</div>
						</div>
					)}

					{/* Monthly on */}
					{customRecurrence?.timeUnit === "month" && (
						<div className="space-y-3">
							<Label className="text-sm font-medium text-brand-primary-1">
								Monthly on
							</Label>
							<Select
								value={customRecurrence.monthlyType ?? "day"}
								onValueChange={(value) =>
									onChangeCustomRecurrence("monthlyType", value)
								}
							>
								<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
									<SelectValue />
								</SelectTrigger>
								<SelectContent className="z-[10001]">
									<SelectItem value="day">
										Monthly on day {dayOfMonth}
									</SelectItem>
									<SelectItem value="week">
										Monthly on the {weekPosition} {weeklyLabel}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Ends */}
					<div className="space-y-3">
						<Label className="text-sm font-medium text-brand-primary-1">
							Ends
						</Label>
						<div className="space-y-2">
							<div className="flex items-center gap-x-2">
								<input
									type="radio"
									id="ends-never"
									name="ends"
									value="never"
									checked={customRecurrence?.endsType === "never"}
									onChange={() => onChangeCustomRecurrence("endsType", "never")}
									className="size-4 text-blue-600 focus:ring-blue-500 border-brand-secondary-3"
								/>
								<Label
									htmlFor="ends-never"
									className="text-sm text-brand-primary-1 cursor-pointer"
								>
									Never
								</Label>
							</div>

							<div className="flex items-center gap-x-2">
								<input
									type="radio"
									id="ends-on"
									name="ends"
									value="on"
									checked={customRecurrence?.endsType === "on"}
									onChange={() => onChangeCustomRecurrence("endsType", "on")}
									className="size-4 text-blue-600 focus:ring-blue-500 border-brand-secondary-3"
								/>
								<Label
									htmlFor="ends-on"
									className="text-sm text-brand-primary-1 cursor-pointer"
								>
									On
								</Label>
								<div className="ml-2 px-3 py-1 bg-brand-secondary-3 border border-brand-secondary-3 rounded text-sm text-brand-secondary-1">
									<Input
										type="date"
										value={customRecurrence?.endsDate ?? ""}
										onChange={(e) =>
											onChangeCustomRecurrence("endsDate", e.target.value)
										}
										className="w-full border-0 bg-transparent focus:ring-0"
									/>
								</div>
							</div>

							<div className="flex items-center gap-x-2">
								<input
									type="radio"
									id="ends-after"
									name="ends"
									value="after"
									checked={customRecurrence?.endsType === "after"}
									onChange={() => onChangeCustomRecurrence("endsType", "after")}
									className="size-4 text-blue-600 focus:ring-blue-500 border-brand-secondary-3"
								/>
								<Label
									htmlFor="ends-after"
									className="text-sm text-brand-primary-1 cursor-pointer"
								>
									After
								</Label>
								<div className="ml-2 flex items-center gap-x-1">
									<Input
										type="number"
										min="1"
										max="999"
										value={customRecurrence?.endsOccurrences ?? 1}
										onChange={(e) =>
											onChangeCustomRecurrence(
												"endsOccurrences",
												parseInt(e.target.value) || 1,
											)
										}
										className="w-16 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 text-center"
									/>
									<span className="text-sm text-brand-secondary-1">
										occurrences
									</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
