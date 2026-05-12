import { CalendarRange, Mail } from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

type AvailabilitySlot = {
	id: string;
	trainerId: string;
	dayOfWeek: string;
	startTime: string;
	endTime: string;
};

export type TrainerAvailabilityRow = {
	trainerId: string;
	trainerName: string;
	trainerEmail: string;
	slots: AvailabilitySlot[];
};

interface TrainerAvailabilitySheetProps {
	trainer: TrainerAvailabilityRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const DAY_ORDER: Array<{ key: string; label: string }> = [
	{ key: "monday", label: "Monday" },
	{ key: "tuesday", label: "Tuesday" },
	{ key: "wednesday", label: "Wednesday" },
	{ key: "thursday", label: "Thursday" },
	{ key: "friday", label: "Friday" },
	{ key: "saturday", label: "Saturday" },
	{ key: "sunday", label: "Sunday" },
];

export function TrainerAvailabilitySheet({
	trainer,
	open,
	onOpenChange,
}: TrainerAvailabilitySheetProps) {
	const slotsByDay = new Map<string, AvailabilitySlot[]>();
	if (trainer) {
		for (const slot of trainer.slots) {
			const list = slotsByDay.get(slot.dayOfWeek) ?? [];
			list.push(slot);
			slotsByDay.set(slot.dayOfWeek, list);
		}
		for (const list of slotsByDay.values()) {
			list.sort((a, b) => a.startTime.localeCompare(b.startTime));
		}
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-md"
			>
				<SheetHeader className="border-b border-border/40">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
							<CalendarRange className="h-5 w-5 text-primary" />
						</div>
						<div className="min-w-0">
							<SheetTitle className="truncate text-lg">
								{trainer?.trainerName ?? "Trainer"}
							</SheetTitle>
							{trainer?.trainerEmail ? (
								<SheetDescription className="flex items-center gap-1.5 text-xs">
									<Mail className="h-3 w-3" />
									<span className="truncate">{trainer.trainerEmail}</span>
								</SheetDescription>
							) : null}
						</div>
					</div>
				</SheetHeader>

				<div className="flex flex-col gap-3 px-4 pb-6">
					{!trainer ? (
						<p className="text-sm text-muted-foreground">No trainer selected.</p>
					) : (
						DAY_ORDER.map(({ key, label }) => {
							const daySlots = slotsByDay.get(key) ?? [];
							return (
								<div
									key={key}
									className="rounded-xl border border-border/40 bg-card p-4 shadow-sm"
								>
									<div className="mb-2 flex items-center justify-between">
										<h3 className="text-sm font-semibold">{label}</h3>
										{daySlots.length === 0 ? (
											<span className="text-xs text-muted-foreground">
												Unavailable
											</span>
										) : (
											<span className="text-xs text-muted-foreground">
												{daySlots.length} window{daySlots.length === 1 ? "" : "s"}
											</span>
										)}
									</div>
									{daySlots.length > 0 && (
										<ul className="flex flex-col gap-1">
											{daySlots.map((slot) => (
												<li
													key={slot.id}
													className="flex items-center gap-2 text-sm tabular-nums"
												>
													<span className="font-medium">
														{slot.startTime}
													</span>
													<span className="text-muted-foreground">–</span>
													<span className="font-medium">{slot.endTime}</span>
												</li>
											))}
										</ul>
									)}
								</div>
							);
						})
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
