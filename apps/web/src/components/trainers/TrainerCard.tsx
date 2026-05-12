"use client";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrainerTier = {
	id: string;
	name: string;
};

export type TrainerRow = {
	id: string;
	userId: string;
	hierarchyScopeId: string;
	status: string;
	joinedAt: Date | string | null;
	name: string;
	email: string;
	trainerTierId?: string | null;
	displayName?: string | null;
	specialization?: string | null;
	phoneNumber?: string | null;
	bio?: string | null;
	certifications?: string[] | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
	return name
		.split(" ")
		.flatMap((p) => (p[0] ? [p[0]] : []))
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	trainer: TrainerRow;
	onSelect: (trainer: TrainerRow) => void;
	trainerTiers: TrainerTier[];
	onAssignTier: (memberId: string, tierId: string | null) => void;
	isTierMutating: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainerCard({
	trainer,
	onSelect,
	trainerTiers,
	onAssignTier,
	isTierMutating,
}: Props) {
	const initials = getInitials(trainer.displayName ?? trainer.name);
	const isActive = trainer.status === "active";
	const isSuspended = trainer.status === "suspended";

	return (
		<div
			role="button"
			tabIndex={0}
			onClick={() => onSelect(trainer)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") onSelect(trainer);
			}}
			className="flex flex-col rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-all duration-150 overflow-hidden cursor-pointer"
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-secondary-2 text-brand-primary-1 text-sm font-bold">
					{initials}
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold text-foreground truncate">
						{trainer.displayName ?? trainer.name}
					</p>
					{trainer.specialization ? (
						<p className="text-xs text-muted-foreground truncate mt-0.5">
							{trainer.specialization}
						</p>
					) : (
						<p className="text-xs text-muted-foreground truncate mt-0.5">
							No specialization
						</p>
					)}
					<p className="text-xs text-muted-foreground truncate mt-0.5">
						{trainer.email}
					</p>
				</div>
				<StatusBadge
					status={isActive ? "active" : "inactive"}
					label={isActive ? "Active" : isSuspended ? "Suspended" : trainer.status}
					className="shrink-0 self-start text-xs"
				/>
			</div>
			<div
				className={cn(
					"h-0.5 w-full shrink-0",
					isActive ? "bg-emerald-400" : "bg-rose-400",
				)}
			/>
			{/* Tier selector — stop propagation so click doesn't open detail dialog */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper for stopPropagation only, contains interactive child */}
			<div
				role="presentation"
				className="px-4 py-2 border-t border-border"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<select
					className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-card focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
					value={trainer.trainerTierId ?? ""}
					disabled={isTierMutating}
					onChange={(e) => {
						const tierId = e.target.value || null;
						onAssignTier(trainer.id, tierId);
					}}
				>
					<option value="">No tier</option>
					{trainerTiers.map((tier) => (
						<option key={tier.id} value={tier.id}>
							{tier.name}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
