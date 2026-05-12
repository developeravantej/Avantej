import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, Save, CalendarClock, Mail } from "lucide-react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;

const DAY_LABELS: Record<string, string> = {
	monday: "Monday",
	tuesday: "Tuesday",
	wednesday: "Wednesday",
	thursday: "Thursday",
	friday: "Friday",
	saturday: "Saturday",
	sunday: "Sunday",
};

/** 30-minute increments from 06:00 to 23:00 */
const TIME_OPTIONS: string[] = (() => {
	const options: string[] = [];
	for (let hour = 6; hour <= 23; hour++) {
		options.push(`${String(hour).padStart(2, "0")}:00`);
		if (hour < 23) {
			options.push(`${String(hour).padStart(2, "0")}:30`);
		}
	}
	return options;
})();

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotState = {
	dayOfWeek: string;
	startTime: string;
	endTime: string;
};

export interface CoachIntakeEditorProps {
	organizationId: string;
	trainerId: string;
	trainerName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CoachIntakeEditor({
	organizationId,
	trainerId,
	trainerName,
	open,
	onOpenChange,
	onSaved,
}: CoachIntakeEditorProps) {
	const [slots, setSlots] = useState<SlotState[]>([]);

	// ── Fetch existing intake slots ──────────────────────────────────────────

	const { data: intakeData, isLoading } = useQuery({
		queryKey: ["coachIntakeSlots", trainerId],
		queryFn: () => client.coachIntake.listSlots({ organizationId, trainerId }),
		enabled: !!organizationId && !!trainerId && open,
	});

	// Populate local state from fetched data
	useEffect(() => {
		if (intakeData) {
			setSlots(
				intakeData.map((slot: any) => ({
					dayOfWeek: slot.dayOfWeek,
					startTime: slot.startTime,
					endTime: slot.endTime,
				})),
			);
		}
	}, [intakeData]);

	// Reset slots when sheet closes
	useEffect(() => {
		if (!open) {
			setSlots([]);
		}
	}, [open]);

	// ── Mutations ────────────────────────────────────────────────────────────

	const saveMutation = useApiMutation({
		mutationFn: () =>
			client.coachIntake.upsertSlots({
				organizationId,
				trainerId,
				slots: slots.map((s) => ({
					dayOfWeek: s.dayOfWeek as
						| "monday"
						| "tuesday"
						| "wednesday"
						| "thursday"
						| "friday"
						| "saturday"
						| "sunday",
					startTime: s.startTime,
					endTime: s.endTime,
				})),
			}),
		successMessage: "Intake availability saved successfully.",
		errorMessage: (err) => err.message || "Failed to save intake availability.",
		invalidate: [["coachIntakeSlots", trainerId], ["coachIntakeByBranch"]],
		onSuccess: () => {
			onSaved?.();
		},
	});

	// ── Slot helpers ─────────────────────────────────────────────────────────

	function addSlot(dayOfWeek: string) {
		setSlots((prev) => [
			...prev,
			{ dayOfWeek, startTime: "09:00", endTime: "10:00" },
		]);
	}

	function removeSlot(index: number) {
		setSlots((prev) => prev.filter((_, i) => i !== index));
	}

	function updateSlot(index: number, field: "startTime" | "endTime", value: string) {
		setSlots((prev) =>
			prev.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)),
		);
	}

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
				<SheetHeader className="border-b border-border/40">
					<div className="flex items-center gap-3">
						<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
							<CalendarClock className="size-5 text-primary" />
						</div>
						<div className="min-w-0">
							<SheetTitle className="truncate text-lg">{trainerName}</SheetTitle>
							<SheetDescription className="flex items-center gap-1.5 text-xs">
								<Mail className="size-3" />
								<span className="truncate">Intake Availability Schedule</span>
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<div className="px-4 pb-6 pt-4">
					{isLoading ? (
						<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
							<LoadingSpinner size="sm" />
							Loading intake slots…
						</div>
					) : (
						<div className="space-y-4">
							{DAYS.map((day) => {
								const daySlots = slots.flatMap((slot, originalIndex) =>
									slot.dayOfWeek === day ? [{ slot, originalIndex }] : [],
								);

								return (
									<div
										key={day}
										className="rounded-md border border-border/40 bg-card p-4 space-y-2"
									>
										<div className="flex items-center justify-between">
											<span className="text-sm font-medium">{DAY_LABELS[day]}</span>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
												onClick={() => addSlot(day)}
											>
												<Plus className="size-3 mr-1" />
												Add Window
											</Button>
										</div>

										{daySlots.length === 0 ? (
											<p className="text-xs text-muted-foreground pl-1">No intake windows</p>
										) : (
											<div className="space-y-1.5 pl-1">
												{daySlots.map(({ slot, originalIndex }) => (
													<div key={originalIndex} className="flex items-center gap-2">
														{/* Start time */}
														<Select
															value={slot.startTime}
															onValueChange={(v) => updateSlot(originalIndex, "startTime", v)}
														>
															<SelectTrigger className="h-8 w-28 text-xs">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{TIME_OPTIONS.map((t) => (
																	<SelectItem key={t} value={t} className="text-xs">
																		{t}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>

														<span className="text-xs text-muted-foreground">to</span>

														{/* End time */}
														<Select
															value={slot.endTime}
															onValueChange={(v) => updateSlot(originalIndex, "endTime", v)}
														>
															<SelectTrigger className="h-8 w-28 text-xs">
																<SelectValue />
															</SelectTrigger>
															<SelectContent>
																{TIME_OPTIONS.map((t) => (
																	<SelectItem key={t} value={t} className="text-xs">
																		{t}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>

														{/* Remove slot */}
														<Button
															type="button"
															variant="ghost"
															size="sm"
															className="size-7 p-0 text-muted-foreground hover:text-red-600"
															onClick={() => removeSlot(originalIndex)}
															aria-label={`Remove ${DAY_LABELS[day]} intake window`}
														>
															<X className="size-3.5" />
														</Button>
													</div>
												))}
											</div>
										)}
									</div>
								);
							})}

							{/* Save button */}
							<div className="mt-6 flex justify-end">
								<button
									type="button"
									onClick={() => saveMutation.mutate()}
									disabled={saveMutation.isPending}
									className="inline-flex justify-center rounded-md border border-transparent bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<Save className="size-4 mr-2" />
									{saveMutation.isPending ? "Saving..." : "Save Intake Availability"}
								</button>
							</div>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
