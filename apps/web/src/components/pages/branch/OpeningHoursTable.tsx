import { useMemo } from "react";

import { DAYS_OF_WEEK, type OpeningHoursShape } from "./types";

// ─── Opening Hours Table ─────────────────────────────────────────────────────

export function OpeningHoursTable({ hours }: { hours: unknown }) {
	const parsed = useMemo<OpeningHoursShape>(() => {
		if (!hours || typeof hours !== "object") return {};
		return hours as OpeningHoursShape;
	}, [hours]);

	const hasAnyHours = DAYS_OF_WEEK.some((d) => parsed[d.key] != null);

	if (!hasAnyHours) {
		return (
			<p className="text-xs text-[#737373] italic">Opening hours not set</p>
		);
	}

	return (
		<table className="w-full text-xs">
			<tbody>
				{DAYS_OF_WEEK.map(({ key, label }) => {
					const slot = parsed[key];
					return (
						<tr key={key} className="border-b border-[#e5e5e5] last:border-0">
							<td className="py-1.5 pr-3 font-medium text-[#0a0a0a] w-28">
								{label}
							</td>
							<td className="py-1.5 font-mono tabular-nums text-[#737373]">
								{slot ? `${slot.open} – ${slot.close}` : "Closed"}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
