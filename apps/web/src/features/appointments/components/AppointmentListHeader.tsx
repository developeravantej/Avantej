import {
	CalendarDays as _CalendarDays,
	ChevronLeft,
	ChevronRight,
	LayoutGrid,
	LayoutList,
	Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
	monthLabel: string;
	view: "list" | "card";
	onViewChange: (view: "list" | "card") => void;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	onToday: () => void;
	onAddAppointment: () => void;
};

export function AppointmentListHeader({
	monthLabel,
	view,
	onViewChange,
	onPrevMonth,
	onNextMonth,
	onToday,
	onAddAppointment,
}: Props) {
	return (
		<CardHeader className="flex flex-row items-center justify-between gap-y-0 px-6 py-4 border-b border-zinc-100 shrink-0 bg-white">
			<div className="flex items-center gap-4">
				<CardTitle className="text-xl font-semibold">Appointments</CardTitle>
				<div className="flex items-center gap-1.5">
					<Button
						variant="ghost"
						size="sm"
						className="size-8 p-0 rounded-full"
						onClick={onPrevMonth}
					>
						<ChevronLeft className="size-4" />
					</Button>
					<span className="text-base font-semibold min-w-[140px] text-center">
						{monthLabel}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="size-8 p-0 rounded-full"
						onClick={onNextMonth}
					>
						<ChevronRight className="size-4" />
					</Button>
					<button
						type="button"
						className="ml-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-full hover:bg-blue-50 border border-blue-100 transition-colors"
						onClick={onToday}
					>
						Today
					</button>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<div className="flex items-center rounded-xl border border-zinc-200 p-0.5 bg-zinc-50">
					<button
						type="button"
						onClick={() => onViewChange("list")}
						className={cn(
							"flex size-7 items-center justify-center rounded-lg transition-colors",
							view === "list"
								? "bg-white shadow-sm text-zinc-800"
								: "text-zinc-400 hover:text-zinc-600",
						)}
					>
						<LayoutList className="size-3.5" />
					</button>
					<button
						type="button"
						onClick={() => onViewChange("card")}
						className={cn(
							"flex size-7 items-center justify-center rounded-lg transition-colors",
							view === "card"
								? "bg-white shadow-sm text-zinc-800"
								: "text-zinc-400 hover:text-zinc-600",
						)}
					>
						<LayoutGrid className="size-3.5" />
					</button>
				</div>
				<Button
					size="sm"
					onClick={onAddAppointment}
					className="gap-2 rounded-xl"
				>
					<Plus className="size-4" />
					Add Appointment
				</Button>
			</div>
		</CardHeader>
	);
}
