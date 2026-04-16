"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X, Save } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

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

type ShiftState = {
	dayOfWeek: string;
	startTime: string;
	endTime: string;
};

interface TrainerAvailabilityEditorProps {
	organizationId: string;
	trainerId: string;
	onSaved?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainerAvailabilityEditor({
	organizationId,
	trainerId,
	onSaved,
}: TrainerAvailabilityEditorProps) {
	const queryClient = useQueryClient();
	const [shifts, setShifts] = useState<ShiftState[]>([]);

	// ── Fetch existing availability ──────────────────────────────────────────

	const { data: availabilityData, isLoading } = useQuery({
		queryKey: ["trainer-availability", trainerId],
		queryFn: () =>
			client.trainerAvailability.list({ organizationId, trainerId }),
		enabled: !!organizationId && !!trainerId,
	});

	// Populate local state from fetched data
	useEffect(() => {
		if (availabilityData) {
			setShifts(
				availabilityData.map((slot) => ({
					dayOfWeek: slot.dayOfWeek,
					startTime: slot.startTime,
					endTime: slot.endTime,
				})),
			);
		}
	}, [availabilityData]);

	// ── Mutations ────────────────────────────────────────────────────────────

	const saveMutation = useMutation({
		mutationFn: () =>
			client.trainerAvailability.upsert({
				organizationId,
				trainerId,
				slots: shifts.map((s) => ({
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
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["trainer-availability", trainerId],
			});
			toast.success("Availability saved successfully.");
			onSaved?.();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to save availability.",
			);
		},
	});

	// ── Shift helpers ────────────────────────────────────────────────────────

	function addShift(dayOfWeek: string) {
		setShifts((prev) => [
			...prev,
			{ dayOfWeek, startTime: "09:00", endTime: "17:00" },
		]);
	}

	function removeShift(index: number) {
		setShifts((prev) => prev.filter((_, i) => i !== index));
	}

	function updateShift(index: number, field: "startTime" | "endTime", value: string) {
		setShifts((prev) =>
			prev.map((shift, i) =>
				i === index ? { ...shift, [field]: value } : shift,
			),
		);
	}

	// ── Loading ──────────────────────────────────────────────────────────────

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
				<div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
				Loading availability...
			</div>
		);
	}

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<div className="space-y-4">
			{DAYS.map((day) => {
				const dayShifts = shifts
					.map((shift, originalIndex) => ({ shift, originalIndex }))
					.filter(({ shift }) => shift.dayOfWeek === day);

				return (
					<div key={day} className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm font-semibold">{DAY_LABELS[day]}</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
								onClick={() => addShift(day)}
							>
								<Plus className="h-3 w-3 mr-1" />
								Add Shift
							</Button>
						</div>

						{dayShifts.length === 0 ? (
							<p className="text-xs text-muted-foreground pl-1">No shifts</p>
						) : (
							<div className="space-y-1.5 pl-1">
								{dayShifts.map(({ shift, originalIndex }) => (
									<div
										key={originalIndex}
										className="flex items-center gap-2"
									>
										{/* Start time */}
										<Select
											value={shift.startTime}
											onValueChange={(v) => updateShift(originalIndex, "startTime", v)}
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
											value={shift.endTime}
											onValueChange={(v) => updateShift(originalIndex, "endTime", v)}
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

										{/* Remove shift */}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
											onClick={() => removeShift(originalIndex)}
											aria-label={`Remove ${DAY_LABELS[day]} shift`}
										>
											<X className="h-3.5 w-3.5" />
										</Button>
									</div>
								))}
							</div>
						)}

						<Separator />
					</div>
				);
			})}

			{/* Save button */}
			<div className="pt-2">
				<Button
					type="button"
					size="sm"
					onClick={() => saveMutation.mutate()}
					disabled={saveMutation.isPending}
					className="w-full"
				>
					<Save className="h-4 w-4 mr-2" />
					{saveMutation.isPending ? "Saving..." : "Save Availability"}
				</Button>
			</div>
		</div>
	);
}
