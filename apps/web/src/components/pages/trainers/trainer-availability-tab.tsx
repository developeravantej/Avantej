import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import {
	TrainerAvailabilitySheet,
	type TrainerAvailabilityRow,
} from "@/components/trainers/trainer-availability-sheet";
import { AddExceptionDialog } from "@/components/calendar/add-exception-dialog";
import { cn } from "@/lib/utils";

const DAY_COLUMNS: Array<{ key: string; label: string }> = [
	{ key: "monday", label: "Mon" },
	{ key: "tuesday", label: "Tue" },
	{ key: "wednesday", label: "Wed" },
	{ key: "thursday", label: "Thu" },
	{ key: "friday", label: "Fri" },
	{ key: "saturday", label: "Sat" },
	{ key: "sunday", label: "Sun" },
];

const AVATAR_PALETTE = [
	{ bg: "bg-[#f5f0e6]", text: "text-[#78614e]" },
	{ bg: "bg-blue-100",    text: "text-blue-800"    },
	{ bg: "bg-emerald-100", text: "text-emerald-800" },
	{ bg: "bg-purple-100",  text: "text-purple-800"  },
	{ bg: "bg-rose-100",    text: "text-rose-800"    },
	{ bg: "bg-amber-100",   text: "text-amber-800"   },
	{ bg: "bg-cyan-100",    text: "text-cyan-800"    },
];

function avatarColors(index: number) {
	return AVATAR_PALETTE[index % AVATAR_PALETTE.length];
}

function trainerInitials(name: string) {
	return name
		.split(" ")
		.map((p) => p[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

function getCurrentWeekStart(): string {
	const now = new Date();
	const day = now.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	const monday = new Date(now);
	monday.setDate(now.getDate() + diff);
	const y = monday.getFullYear();
	const m = String(monday.getMonth() + 1).padStart(2, "0");
	const d = String(monday.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function totalAvailHours(slots: TrainerAvailabilityRow["slots"]): number {
	return slots.reduce((sum, s) => {
		const toH = (t: string) => {
			const [h, m] = t.split(":").map(Number);
			return h + (m ?? 0) / 60;
		};
		return sum + Math.max(0, toH(s.endTime) - toH(s.startTime));
	}, 0);
}

function utilisationBarColor(pct: number): string {
	if (pct > 90) return "bg-red-400";
	if (pct >= 60) return "bg-amber-400";
	return "bg-emerald-400";
}

function formatHours(h: number): string {
	return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
}

type UtilisationMap = Record<
	string,
	{ availableHours: number; bookedHours: number; utilisationPct: number }
>;

function slotPillClasses(kind: string): string {
	if (kind === "blocked") return "bg-red-100 text-red-700";
	if (kind === "timeoff") return "bg-amber-100 text-amber-700";
	return "bg-[#d1fae5] text-[#065f46]";
}

function WeeklyGridRow({
	row,
	index,
	utilisation,
	onOpenSheet,
}: {
	row: TrainerAvailabilityRow;
	index: number;
	utilisation: UtilisationMap;
	onOpenSheet: (row: TrainerAvailabilityRow) => void;
}) {
	const colors = avatarColors(index);
	const util = utilisation[row.trainerId];
	const availH = util?.availableHours ?? totalAvailHours(row.slots);
	const bookedH = util?.bookedHours ?? null;
	const pct = util?.utilisationPct ?? 0;

	const slotsByDay = useMemo(() => {
		const map = new Map<
			string,
			Array<{ startTime: string; endTime: string; kind: string }>
		>();
		for (const slot of row.slots) {
			const list = map.get(slot.dayOfWeek) ?? [];
			list.push({
				startTime: slot.startTime,
				endTime: slot.endTime,
				kind: (slot as { kind?: string }).kind ?? "available",
			});
			map.set(slot.dayOfWeek, list);
		}
		return map;
	}, [row.slots]);

	return (
		<div
			className="grid border-b border-[#e5e5e5] transition-colors hover:bg-[#f3f3f3]/30"
			style={{ gridTemplateColumns: "220px repeat(7, 1fr)" }}
		>
			<button
				type="button"
				onClick={() => onOpenSheet(row)}
				className="border-r border-[#e5e5e5] px-4 py-4 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0a0a0a]"
			>
				<div className="flex items-start gap-3">
					<div
						className={cn(
							"flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
							colors.bg,
							colors.text,
						)}
					>
						{trainerInitials(row.trainerName)}
					</div>

					<div className="min-w-0 flex-1">
						<div className="text-sm font-bold text-[#0a0a0a]">
							{row.trainerName}
						</div>

						{row.specialization ? (
							<div className="truncate text-[11px] text-[#737373]">
								{row.specialization}
							</div>
						) : row.trainerEmail ? (
							<div className="truncate text-[11px] text-[#737373]">
								{row.trainerEmail}
							</div>
						) : null}

						<div className="mt-1.5 flex items-center gap-1.5">
							<div className="relative h-[4px] w-20 overflow-hidden rounded-full bg-[#e5e5e5]">
								{util ? (
									<div
										className={cn(
											"absolute inset-y-0 left-0 rounded-full transition-all",
											utilisationBarColor(pct),
										)}
										style={{ width: `${Math.min(pct, 100)}%` }}
									/>
								) : null}
							</div>
							<span className="font-mono text-[10px] tabular-nums text-[#a3a3a3]">
								{util ? `${pct}%` : "—%"}
							</span>
						</div>

						<div className="mt-0.5 text-[10px] text-[#737373]">
							{bookedH !== null ? (
								<>
									<span className="font-mono font-semibold text-[#0a0a0a]">
										{formatHours(bookedH)}
									</span>
									{" booked / "}
									<span className="font-mono tabular-nums">
										{formatHours(availH)}
									</span>
									{" avail"}
								</>
							) : (
								<>
									<span className="font-mono font-semibold text-[#0a0a0a]">
										—h
									</span>
									{" booked / "}
									<span className="font-mono tabular-nums">
										{formatHours(availH)}
									</span>
									{" avail"}
								</>
							)}
						</div>
					</div>
				</div>
			</button>

			{DAY_COLUMNS.map((d) => {
				const slots = slotsByDay.get(d.key) ?? [];
				return (
					<button
						key={d.key}
						type="button"
						onClick={() => onOpenSheet(row)}
						className="border-r border-[#e5e5e5] px-2 py-3 text-left last:border-r-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0a0a0a]"
					>
						{slots.length === 0 ? (
							<span className="inline-flex items-center gap-1 rounded-full bg-[#f3f3f3] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#737373] tabular-nums">
								Off
							</span>
						) : (
							<div className="space-y-1">
								{slots.map((s) => (
									<div
										key={`${s.startTime}-${s.endTime}`}
										title={
											s.kind !== "available"
												? s.kind === "blocked"
													? "Blocked"
													: "Time Off"
												: undefined
										}
										className={cn(
											"rounded-md px-2 py-1 font-mono text-[11px] font-semibold tabular-nums",
											slotPillClasses(s.kind),
										)}
									>
										{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
									</div>
								))}
							</div>
						)}
					</button>
				);
			})}
		</div>
	);
}

function WeeklyGrid({
	rows,
	utilisation,
	onOpenSheet,
}: {
	rows: TrainerAvailabilityRow[];
	utilisation: UtilisationMap;
	onOpenSheet: (row: TrainerAvailabilityRow) => void;
}) {
	if (rows.length === 0) return null;

	return (
		<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
			<div
				className="grid border-b border-[#e5e5e5]"
				style={{ gridTemplateColumns: "220px repeat(7, 1fr)" }}
			>
				<div className="border-r border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
					<span className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Trainer
					</span>
				</div>
				{DAY_COLUMNS.map((d, i) => (
					<div
						key={d.key}
						className={cn(
							"bg-[#f3f3f3] px-3 py-3 text-center",
							i < DAY_COLUMNS.length - 1 ? "border-r border-[#e5e5e5]" : "",
						)}
					>
						<span className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							{d.label}
						</span>
					</div>
				))}
			</div>

			{rows.map((row, index) => (
				<WeeklyGridRow
					key={row.trainerId}
					row={row}
					index={index}
					utilisation={utilisation}
					onOpenSheet={onOpenSheet}
				/>
			))}

			<div className="flex flex-wrap items-center gap-5 border-t border-[#e5e5e5] bg-[#f3f3f3]/40 px-5 py-3">
				<span className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
					Legend
				</span>
				<span className="rounded bg-[#d1fae5] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#065f46]">
					Available
				</span>
				<span className="rounded bg-[#fee2e2] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#991b1b]">
					Blocked
				</span>
				<span className="rounded bg-[#fef3c7] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#92400e]">
					Time Off
				</span>
			</div>
		</div>
	);
}

export function TrainerAvailabilityTab() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberRole = (
		currentOrg?.hierarchy?.member?.role ?? ""
	).toLowerCase();
	type MemberWithId = NonNullable<typeof currentOrg>["hierarchy"]["member"] & {
		id?: string;
	};
	const callerMemberId =
		(currentOrg?.hierarchy?.member as MemberWithId | null | undefined)?.id ??
		null;
	const isTrainerRole = memberRole === "trainer";

	const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
	const [exceptionDialogKind, setExceptionDialogKind] = useState<
		"timeoff" | "blocked"
	>("timeoff");
	const [selectedTrainer, setSelectedTrainer] =
		useState<TrainerAvailabilityRow | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	const weekStart = useMemo(() => getCurrentWeekStart(), []);

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["trainerAvailabilityByBranch", organizationId],
		queryFn: async () => {
			if (!organizationId) return [] as TrainerAvailabilityRow[];
			return (await client.trainerAvailability.listByBranch({
				organizationId,
			})) as TrainerAvailabilityRow[];
		},
		enabled: !!organizationId,
	});

	const { data: utilisationData } = useQuery({
		queryKey: ["trainerUtilisation", organizationId, weekStart],
		queryFn: async () => {
			if (!organizationId) return {} as UtilisationMap;
			return client.trainerAvailability.getUtilisation({
				organizationId,
				weekStart,
			}) as Promise<UtilisationMap>;
		},
		enabled: !!organizationId,
	});

	const allRows = useMemo<TrainerAvailabilityRow[]>(() => {
		const all = data ?? [];
		if (isTrainerRole && callerMemberId) {
			return all.filter((r) => r.trainerId === callerMemberId);
		}
		return all;
	}, [data, isTrainerRole, callerMemberId]);

	if (!organizationId) {
		return (
			<StatusCallout
				variant="info"
				title="No organization"
				message="Select an organization to view trainer availability."
			/>
		);
	}

	return (
		<>
			{!isTrainerRole && (
				<div className="mb-5 flex flex-wrap items-center justify-end gap-2">
					<button
						type="button"
						onClick={() => {
							setExceptionDialogKind("blocked");
							setExceptionDialogOpen(true);
						}}
						className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
					>
						<Plus className="h-4 w-4" />
						Block Time
					</button>
					<button
						type="button"
						onClick={() => {
							setExceptionDialogKind("timeoff");
							setExceptionDialogOpen(true);
						}}
						className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#262626]"
					>
						<Plus className="h-4 w-4" />
						Add Exception
					</button>
				</div>
			)}

			{isLoading ? (
				<PageLoader />
			) : isError ? (
				<StatusCallout
					variant="error"
					title="Couldn't load trainer availability"
					onRetry={() => refetch()}
				/>
			) : allRows.length === 0 ? (
				<StatusCallout
					variant="info"
					title="No trainers"
					message={
						isTrainerRole
							? "Your availability has not been set up yet."
							: "No active trainers found in this branch."
					}
				/>
			) : (
				<div className="overflow-x-auto">
					<div style={{ minWidth: "900px" }}>
						<WeeklyGrid
							rows={allRows}
							utilisation={utilisationData ?? {}}
							onOpenSheet={(row) => {
								setSelectedTrainer(row);
								setSheetOpen(true);
							}}
						/>
					</div>
				</div>
			)}

			<TrainerAvailabilitySheet
				trainer={selectedTrainer}
				open={sheetOpen}
				onOpenChange={(open) => {
					setSheetOpen(open);
					if (!open) setSelectedTrainer(null);
				}}
				organizationId={organizationId}
				onSaved={() => refetch()}
			/>

			<AddExceptionDialog
				open={exceptionDialogOpen}
				onOpenChange={setExceptionDialogOpen}
				organizationId={organizationId}
				defaultKind={exceptionDialogKind}
				onSuccess={() => refetch()}
			/>
		</>
	);
}
