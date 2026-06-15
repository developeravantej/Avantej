import { cn } from "@/lib/utils";

// ─── Design-5 token classes ────────────────────────────────────────────────────
// paper: #f3f3f3  line: #e5e5e5  ink: #0a0a0a  warm: #d6cdb1

// ─── Timeline step dot ────────────────────────────────────────────────────────

export function TlDot({
	state,
	n,
}: {
	state: "done" | "active" | "idle";
	n: number;
}) {
	return (
		<div
			className={cn(
				"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold",
				state === "done" && "bg-[#0a0a0a] text-white",
				state === "active" &&
					"border-2 border-[#0a0a0a] bg-white text-[#0a0a0a]",
				state === "idle" && "border-2 border-[#e5e5e5] bg-white text-[#a3a3a3]",
			)}
		>
			{state === "done" ? (
				<svg width="12" height="12" fill="white" viewBox="0 0 16 16">
					<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
				</svg>
			) : (
				n
			)}
		</div>
	);
}

// ─── Right-panel timeline dot ─────────────────────────────────────────────────

export function LiveDot({ state }: { state: "done" | "active" | "idle" }) {
	return (
		<div
			className={cn(
				"flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
				state === "done" && "bg-[#0a0a0a]",
				state === "active" && "border-2 border-[#0a0a0a] bg-white",
				state === "idle" && "border-2 border-[#e5e5e5] bg-white",
			)}
		>
			{state === "done" && (
				<svg width="10" height="10" fill="white" viewBox="0 0 16 16">
					<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
				</svg>
			)}
		</div>
	);
}

// ─── Step card shell ─────────────────────────────────────────────────────────

export function StepCard({
	n,
	label,
	stepLabel,
	state,
	badge,
	onEdit,
	children,
}: {
	n: number;
	label: string;
	stepLabel: string;
	state: "done" | "active" | "idle";
	badge?: React.ReactNode;
	onEdit?: () => void;
	children?: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"rounded-2xl border bg-white p-5 transition-opacity duration-200",
				state === "active" && "border-[#0a0a0a] shadow-sm",
				state === "done" && "border-[#e5e5e5]",
				state === "idle" &&
					"border-[#e5e5e5] opacity-50 pointer-events-none select-none",
			)}
			style={state === "active" ? { borderWidth: "1.5px" } : {}}
		>
			{/* Step header */}
			<div className="flex items-center gap-3">
				<TlDot state={state} n={n} />
				<div className="flex-1 min-w-0">
					<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						{stepLabel}
					</p>
					<p
						className={cn(
							"text-sm font-bold",
							state === "idle" ? "text-[#737373]" : "text-[#0a0a0a]",
						)}
					>
						{label}
					</p>
				</div>
				{state === "done" && onEdit && (
					<button
						type="button"
						onClick={onEdit}
						className="rounded-[10px] px-2.5 py-1 text-[11px] font-medium text-[#737373] transition hover:bg-[#f3f3f3] hover:text-[#0a0a0a]"
					>
						Edit
					</button>
				)}
				{state === "idle" && badge}
			</div>

			{/* Expanded content */}
			{state !== "idle" && children && <div className="mt-4">{children}</div>}
		</div>
	);
}

// ─── Locked badge ─────────────────────────────────────────────────────────────

export function LockedBadge() {
	return (
		<span className="ml-auto inline-flex items-center rounded-full border border-[#e5e5e5] bg-[#f3f3f3] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
			Locked
		</span>
	);
}
