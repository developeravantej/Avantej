import { cn } from "@/lib/utils";
import type { Appointment } from "../types";
import { statusStyle } from "../utils";

function formatTime(date: Date) {
	return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

interface CalendarCellProps {
	date: Date;
	appts: Appointment[];
	isTodayDate: boolean;
	inPeriod: boolean;
	minHeight: string;
	onCellClick: (date: Date) => void;
}

export function CalendarCell({ date, appts, isTodayDate, inPeriod, minHeight, onCellClick }: CalendarCellProps) {
	const preview =
		appts.find((a) => a.status === "pending") ??
		appts.find((a) => a.status === "confirmed") ??
		appts[0] ??
		null;

	return (
		<div
			role="button"
			tabIndex={0}
			className={cn(
				"bg-white p-2 cursor-pointer transition-colors hover:bg-blue-50/40 flex flex-col gap-1",
				minHeight,
				!inPeriod && "bg-gray-50 text-gray-400",
				isTodayDate && "bg-blue-50 ring-2 ring-inset ring-blue-300",
			)}
			onClick={() => onCellClick(date)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onCellClick(date);
				}
			}}
		>
			<div className="flex items-center justify-between">
				<span className={cn("text-sm font-medium", isTodayDate && "text-blue-600 font-bold")}>{date.getDate()}</span>
				{appts.length > 0 && (
					<span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
						{appts.length}
					</span>
				)}
			</div>

			{preview && (() => {
				const s = statusStyle(preview.status);
				return (
					<div
						role="button"
						tabIndex={0}
						className={cn("rounded border-l-[3px] px-1.5 py-1 text-xs leading-tight", s.bg, s.border, s.text)}
						onClick={(e) => { e.stopPropagation(); onCellClick(date); }}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								e.stopPropagation();
								onCellClick(date);
							}
						}}
					>
						<div className="font-medium truncate">{preview.title}</div>
						<div className="opacity-75 truncate">{formatTime(new Date(preview.start))}</div>
					</div>
				);
			})()}

			{appts.length > 1 && (
				<div className="text-xs text-gray-400 text-right">+{appts.length - 1} more</div>
			)}
		</div>
	);
}
