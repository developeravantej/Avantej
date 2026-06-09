// ─── Severity badge ───────────────────────────────────────────────────────────

export function SeverityBadge({
	severity,
}: {
	severity: "danger" | "warning" | "info";
}) {
	const map = {
		danger: {
			dot: "bg-rose-500",
			badge: "bg-rose-50 text-rose-600 border border-rose-200",
		},
		warning: {
			dot: "bg-amber-400",
			badge: "bg-amber-50 text-amber-700 border border-amber-200",
		},
		info: {
			dot: "bg-blue-500",
			badge: "bg-blue-50 text-blue-700 border border-blue-200",
		},
	};
	const { dot, badge } = map[severity];
	return (
		<div className="flex items-center gap-1.5">
			<span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
			<span
				className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge}`}
			>
				{severity}
			</span>
		</div>
	);
}

// ─── Action badge ─────────────────────────────────────────────────────────────

export function ActionBadge({
	action,
	severity,
}: {
	action: string;
	severity: "danger" | "warning" | "info";
}) {
	const cls =
		severity === "danger"
			? "bg-rose-50 border border-rose-200 text-rose-700"
			: severity === "warning"
				? "bg-amber-50 border border-amber-200 text-amber-800"
				: "bg-[#f3f3f3] text-[#737373]";
	return (
		<span className={`font-mono text-xs px-2 py-0.5 rounded-md ${cls}`}>
			{action}
		</span>
	);
}

// ─── Actor avatar ─────────────────────────────────────────────────────────────

export function ActorAvatar({ initials }: { initials: string | null }) {
	const letters = initials ?? "?";
	const isUnknown = !initials;
	return (
		<span
			className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isUnknown ? "bg-rose-50 text-rose-700" : "bg-[#0a0a0a] text-white"}`}
		>
			{letters}
		</span>
	);
}
