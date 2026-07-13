import { Input } from "@/components/ui/input";

import { DAYS_OF_WEEK, type OpeningHoursShape } from "./types";

// ─── Opening Hours Editor ────────────────────────────────────────────────────
// AVANTEJ-16: per-day open/close with a "Closed" toggle. A null day = closed,
// an absent key = not set. Bound to the branch edit form's openingHours state.

export function OpeningHoursEditor({
	value,
	onChange,
}: {
	value: OpeningHoursShape;
	onChange: (next: OpeningHoursShape) => void;
}) {
	const setDay = (
		key: string,
		slot: { open: string; close: string } | null,
	) => {
		onChange({ ...value, [key]: slot });
	};

	return (
		<div className="space-y-1.5">
			{DAYS_OF_WEEK.map(({ key, label }) => {
				const slot = value[key] ?? null;
				const isOpen = !!slot;
				return (
					<div key={key} className="flex items-center gap-2">
						<label className="flex w-28 shrink-0 items-center gap-2 text-xs font-medium">
							<input
								type="checkbox"
								checked={isOpen}
								onChange={(e) =>
									setDay(
										key,
										e.target.checked ? { open: "09:00", close: "18:00" } : null,
									)
								}
							/>
							{label}
						</label>
						{isOpen ? (
							<div className="flex items-center gap-1.5">
								<Input
									type="time"
									value={slot?.open ?? ""}
									onChange={(e) =>
										setDay(key, {
											open: e.target.value,
											close: slot?.close ?? "",
										})
									}
									className="h-8 w-28 text-xs"
								/>
								<span className="text-xs text-[#737373]">–</span>
								<Input
									type="time"
									value={slot?.close ?? ""}
									onChange={(e) =>
										setDay(key, {
											open: slot?.open ?? "",
											close: e.target.value,
										})
									}
									className="h-8 w-28 text-xs"
								/>
							</div>
						) : (
							<span className="text-xs text-[#a3a3a3] italic">Closed</span>
						)}
					</div>
				);
			})}
		</div>
	);
}
