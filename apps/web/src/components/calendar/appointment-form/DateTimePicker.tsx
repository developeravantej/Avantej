import React from "react";
import { Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DateTimePickerProps = {
	startDate: string;
	startTime: string;
	duration: number;
	formatDuration: (minutes: number) => string;
	onChangePatch: (patch: { startDate?: string; startTime?: string; duration?: number }) => void;
	/** When provided, date and time selects are locked (class slot mode) */
	lockedByClassSlot?: boolean;
	/** Show a required-field asterisk on date label */
	required?: boolean;
};

function computeEndTime(startTime: string, duration: number): string {
	const parts = startTime.split(":").map(Number);
	const hours = parts[0] ?? 0;
	const minutes = parts[1] ?? 0;
	const totalMinutes = hours * 60 + minutes + duration;
	const endHours = Math.floor(totalMinutes / 60) % 24;
	const endMinutes = totalMinutes % 60;
	return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
}

export function DateTimePicker({
	startDate,
	startTime,
	duration,
	formatDuration,
	onChangePatch,
	lockedByClassSlot = false,
	required = false,
}: DateTimePickerProps) {
	const hourValue = startTime ? startTime.split(":")[0] : "";
	const minuteValue = startTime ? startTime.split(":")[1] : "";

	function handleHourChange(hour: string) {
		const currentMinute = startTime ? startTime.split(":")[1] ?? "00" : "00";
		onChangePatch({ startTime: `${hour.padStart(2, "0")}:${currentMinute}` });
	}

	function handleMinuteChange(minute: string) {
		const currentHour = startTime ? startTime.split(":")[0] ?? "00" : "00";
		onChangePatch({ startTime: `${currentHour}:${minute}` });
	}

	return (
		<div className="space-y-4">
			{/* Date and Time row */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{/* Date */}
				<div className="space-y-2">
					<Label htmlFor="startDate" className="text-sm font-medium text-brand-primary-1">
						Date {required ? "*" : ""}
						{lockedByClassSlot && (
							<span className="ml-1 text-xs text-brand-secondary-1">(set by class)</span>
						)}
					</Label>
					<Input
						id="startDate"
						type="date"
						value={startDate}
						onChange={(e) => onChangePatch({ startDate: e.target.value })}
						required={required}
						disabled={lockedByClassSlot}
						className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 disabled:opacity-60 disabled:cursor-not-allowed"
					/>
				</div>

				{/* Start Time */}
				<div className="space-y-2">
					<Label className="text-sm font-medium text-brand-primary-1">
						Start Time *
						{lockedByClassSlot && (
							<span className="ml-1 text-xs text-brand-secondary-1">(set by class)</span>
						)}
					</Label>
					<div className="flex gap-2">
						{/* Hour */}
						<div className="flex-1">
							<Select value={hourValue} onValueChange={handleHourChange} disabled={lockedByClassSlot}>
								<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 disabled:opacity-60 disabled:cursor-not-allowed">
									<SelectValue placeholder="Hour" />
								</SelectTrigger>
								<SelectContent className="z-[10001]">
									{Array.from({ length: 24 }, (_, h) => {
										const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
										const ampm = h < 12 ? "AM" : "PM";
										return (
											<SelectItem key={h} value={h.toString().padStart(2, "0")}>
												{hour12} {ampm}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
						</div>

						{/* Minute */}
						<div className="flex-1">
							<Select value={minuteValue} onValueChange={handleMinuteChange} disabled={lockedByClassSlot}>
								<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 disabled:opacity-60 disabled:cursor-not-allowed">
									<SelectValue placeholder="Minute" />
								</SelectTrigger>
								<SelectContent className="z-[10001]">
									{["00", "15", "30", "45"].map((m) => (
										<SelectItem key={m} value={m}>
											{m}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>
			</div>

			{/* Duration stepper */}
			<div className="space-y-2">
				<Label htmlFor="duration" className="text-sm font-medium text-brand-primary-1">
					Duration
				</Label>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onChangePatch({ duration: Math.max(5, duration - 5) })}
						className="size-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
						disabled={duration <= 5}
					>
						<Minus className="size-4" />
					</Button>

					<div className="flex-1 text-center py-2 px-3 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-md">
						<span className="text-sm font-medium text-brand-primary-1">{formatDuration(duration)}</span>
					</div>

					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onChangePatch({ duration: duration + 5 })}
						className="size-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
					>
						<Plus className="size-4" />
					</Button>
				</div>

				<div className="text-xs text-brand-secondary-1 text-center">
					START: {startTime} | END: {startTime ? computeEndTime(startTime, duration) : "--:--"}
				</div>
			</div>
		</div>
	);
}
