import { Pin } from "lucide-react";

// ─── Status pill ─────────────────────────────────────────────────────────────

export function StatusPill({
	isActive,
	isPinned,
}: {
	isActive: boolean;
	isPinned: boolean;
}) {
	if (isPinned) {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">
				<Pin className="h-2.5 w-2.5" /> Pinned
			</span>
		);
	}
	if (isActive) {
		return (
			<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
				<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
				Active
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
			Inactive
		</span>
	);
}
