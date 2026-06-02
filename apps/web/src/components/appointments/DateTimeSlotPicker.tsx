import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable date + time picker for appointment scheduling.
 *
 * Uses native <input type="date"> / <input type="time"> deliberately: native
 * inputs are keyboard/programmatically settable (Radix Select cannot be
 * browser-automated — it checks event.isTrusted), and the wall-clock values map
 * cleanly to the schedule API contract (date "YYYY-MM-DD" + time "HH:MM").
 *
 * The parent owns the wall-clock → ISO assembly so it matches the existing edit
 * flow exactly: new Date(y, mo-1, d, h, min).toISOString() (browser TZ).
 */
export function DateTimeSlotPicker({
	date,
	time,
	onDateChange,
	onTimeChange,
	disabled,
	className,
	dateLabel,
	timeLabel,
}: {
	/** "YYYY-MM-DD" */
	date: string;
	/** "HH:MM" */
	time: string;
	onDateChange: (date: string) => void;
	onTimeChange: (time: string) => void;
	disabled?: boolean;
	className?: string;
	dateLabel?: string;
	timeLabel?: string;
}) {
	return (
		<div className={cn("flex items-end gap-2", className)}>
			<label className="flex-1">
				{dateLabel && (
					<span className="mb-1 block text-[11px] font-medium text-muted-foreground">
						{dateLabel}
					</span>
				)}
				<Input
					type="date"
					value={date}
					disabled={disabled}
					onChange={(e) => onDateChange(e.target.value)}
				/>
			</label>
			<label className="w-28">
				{timeLabel && (
					<span className="mb-1 block text-[11px] font-medium text-muted-foreground">
						{timeLabel}
					</span>
				)}
				<Input
					type="time"
					value={time}
					disabled={disabled}
					onChange={(e) => onTimeChange(e.target.value)}
				/>
			</label>
		</div>
	);
}

/** Assemble a browser-TZ ISO instant from wall-clock parts (matches edit flow). */
export function assembleIso(date: string, time: string): string {
	const [y, mo, d] = date.split("-").map(Number);
	const [h, min] = time.split(":").map(Number);
	return new Date(
		y ?? 0,
		(mo ?? 1) - 1,
		d ?? 1,
		h ?? 0,
		min ?? 0,
		0,
		0,
	).toISOString();
}
