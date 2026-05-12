import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, Save } from "lucide-react";
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

	const saveMutation = useApiMutation({
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
		successMessage: "Availability saved successfully.",
		errorMessage: (err) => err.message || "Failed to save availability.",
		invalidate: [["trainer-availability", trainerId]],
		onSuccess: () => {
			onSaved?.();
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
			<div className="flex items-center gap-2 py-4 text-sm text-brand-secondary-1">
				<LoadingSpinner size="sm" />
				Loading availability…
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
					<div key={day} className="bg-white border border-brand-secondary-3 rounded-md p-4 space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium text-brand-primary-1">{DAY_LABELS[day]}</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs text-brand-secondary-1 hover:text-brand-primary-1"
								onClick={() => addShift(day)}
							>
								<Plus className="size-3 mr-1" />
								Add Shift
							</Button>
						</div>

						{dayShifts.length === 0 ? (
							<p className="text-xs text-brand-secondary-1 pl-1">No shifts — day off</p>
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
											<SelectTrigger className="h-8 w-28 text-xs border-brand-secondary-3 focus:border-black focus:ring-black">
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

										<span className="text-xs text-brand-secondary-1">to</span>

										{/* End time */}
										<Select
											value={shift.endTime}
											onValueChange={(v) => updateShift(originalIndex, "endTime", v)}
										>
											<SelectTrigger className="h-8 w-28 text-xs border-brand-secondary-3 focus:border-black focus:ring-black">
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
											className="size-7 p-0 text-brand-secondary-1 hover:text-red-600"
											onClick={() => removeShift(originalIndex)}
											aria-label={`Remove ${DAY_LABELS[day]} shift`}
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
					{saveMutation.isPending ? "Saving..." : "Save Availability"}
				</button>
			</div>
		</div>
	);
}
