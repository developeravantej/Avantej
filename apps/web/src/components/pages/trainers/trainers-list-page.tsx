import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useDebounce } from "@/hooks/useDebounce";
import { useTrainerData } from "@/hooks/useTrainerData";
import { useTrainerActions } from "@/hooks/useTrainerActions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Users,
	Plus,
	Search,
	Loader2,
	CalendarDays,
	BadgeCheck,
} from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { type TrainerRow, type TrainerTier } from "@/components/trainers/TrainerCard";
import { TrainerFormDialog, type FormState } from "@/components/trainers/TrainerFormDialog";
import {
	ChangeTierDialog,
	AssignBranchDialog,
} from "@/components/trainers/trainer-assignment-dialogs";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ name }: { name: string }) {
	const lower = name.toLowerCase();
	const isMaster = lower.includes("master");
	const isSenior = lower.includes("senior");

	if (isMaster) {
		return (
			<span className="inline-flex items-center rounded-md bg-[#0a0a0a] px-1.5 py-0.5 text-[10px] font-semibold text-white">
				{name}
			</span>
		);
	}
	if (isSenior) {
		return (
			<span className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-[#f3f3f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#0a0a0a]">
				{name}
			</span>
		);
	}
	// Junior or any other tier
	return (
		<span className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#737373]">
			{name}
		</span>
	);
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
	if (active) {
		return (
			<span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
				Active
			</span>
		);
	}
	return (
		<span className="inline-flex items-center rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
			Inactive
		</span>
	);
}

// ─── Schedule entry types ─────────────────────────────────────────────────────

type ScheduleEntry = {
	type: "appointment" | "class_slot";
	id: string;
	startTime: Date | string;
	endTime?: Date | string;
	title?: string;
	attendeeCount?: number;
	status?: string;
};

// ─── Left list row ────────────────────────────────────────────────────────────

function TrainerListRow({
	trainer,
	tier,
	weekSessions,
	isSelected,
	onClick,
}: {
	trainer: TrainerRow;
	tier?: TrainerTier;
	weekSessions?: number;
	isSelected: boolean;
	onClick: () => void;
}) {
	const isActive = trainer.status === "active";
	const initials = getInitials(trainer.displayName ?? trainer.name);
	const isOnLeave = !isActive;

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-[#e5e5e5] last:border-0",
				isSelected
					? "bg-[#d6cdb1]/20 border-l-2 border-l-[#0a0a0a]"
					: "hover:bg-[#fafafa] border-l-2 border-l-transparent",
				isOnLeave && "opacity-70",
			)}
		>
			{/* Avatar 40px */}
			<div
				className={cn(
					"flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
					isActive
						? "bg-[#0a0a0a] text-white"
						: "bg-[#737373]/20 text-[#737373]",
				)}
			>
				{initials}
			</div>

			{/* Name + tier + sub */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-1.5 flex-wrap">
					<span className="text-sm font-semibold text-[#0a0a0a] leading-tight">
						{trainer.displayName ?? trainer.name}
					</span>
					{tier && <TierBadge name={tier.name} />}
				</div>
				<div className="text-xs text-[#737373] truncate mt-0.5">
					{trainer.specialization
						? `${trainer.specialization}${trainer.hierarchyScopeId ? "" : ""}`
						: trainer.email}
					{isOnLeave && " · On leave"}
				</div>
			</div>

			{/* Week sessions count */}
			<div className="text-right shrink-0">
				{isOnLeave ? (
					<>
						<div className="text-xs font-mono font-semibold tabular-nums text-[#737373]">—</div>
						<div className="text-[10px] text-[#737373]">on leave</div>
					</>
				) : (
					<>
						<div className="text-xs font-mono font-semibold tabular-nums">
							{weekSessions != null ? `${weekSessions} sess` : "…"}
						</div>
						<div className="text-[10px] text-[#737373]">this wk</div>
					</>
				)}
			</div>
		</button>
	);
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
	label,
	value,
	sub,
	loading,
}: {
	label: string;
	value: string;
	sub?: string;
	loading?: boolean;
}) {
	return (
		<div className="px-6 py-5">
			<div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
				{label}
			</div>
			{loading ? (
				<div className="flex items-center gap-1.5 text-[#737373]">
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
					<span className="text-2xl font-bold font-mono tabular-nums">…</span>
				</div>
			) : (
				<div className="text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">{value}</div>
			)}
			{sub && (
				<div className="mt-1 text-xs text-[#737373]">{sub}</div>
			)}
		</div>
	);
}

// ─── Weekly schedule strip (detail panel) ────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function SchedulePreviewCard({
	organizationId,
	memberId,
}: {
	organizationId: string;
	memberId: string;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["trainerWeeklySchedule", organizationId, memberId],
		queryFn: () =>
			client.trainers.weeklySchedule({ organizationId, memberId }),
		enabled: !!organizationId && !!memberId,
		staleTime: 60_000,
	});

	// Build per-day entry lists (Mon=0 … Sun=6)
	type DayBucket = { label: string; title: string; time: string; done: boolean };
	const dayBuckets: DayBucket[][] = Array.from({ length: 7 }, () => []);

	if (data?.entries) {
		for (const entry of data.entries as ScheduleEntry[]) {
			const d = new Date(entry.startTime);
			const jsDay = d.getUTCDay(); // 0=Sun…6=Sat
			const monIndex = jsDay === 0 ? 6 : jsDay - 1;
			if (monIndex >= 0 && monIndex < 7) {
				const startH = d.getUTCHours().toString().padStart(2, "0");
				const startM = d.getUTCMinutes().toString().padStart(2, "0");
				let endStr = "";
				if (entry.endTime) {
					const e = new Date(entry.endTime);
					endStr = ` – ${e.getUTCHours().toString().padStart(2, "0")}:${e.getUTCMinutes().toString().padStart(2, "0")}`;
				}
				const attendees = entry.attendeeCount != null
					? entry.type === "appointment"
						? "1:1"
						: `${entry.attendeeCount} attendees`
					: "";
				dayBuckets[monIndex].push({
					label: DAY_LABELS[monIndex],
					title: entry.title ?? (entry.type === "appointment" ? "PT Session" : "Class"),
					time: `${startH}:${startM}${endStr}${attendees ? ` · ${attendees}` : ""}`,
					done: (entry.status === "completed" || entry.status === "done"),
				});
			}
		}
	}

	// Collect days that have entries
	const activeDays = dayBuckets.flatMap((entries, i) =>
		entries.map((e) => ({ ...e, dayIdx: i })),
	);

	return (
		<div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
					This Week's Schedule
				</div>
				<button
					type="button"
					className="rounded-md px-2 py-1 text-xs font-medium text-[#737373] hover:bg-[#f3f3f3] transition-colors"
				>
					Full calendar
				</button>
			</div>

			{isLoading ? (
				<div className="flex items-center gap-2 text-xs text-[#737373]">
					<Loader2 className="h-3 w-3 animate-spin" />
					Loading schedule…
				</div>
			) : activeDays.length === 0 ? (
				<div className="flex flex-col gap-1.5">
					{DAY_LABELS.slice(0, 5).map((day) => (
						<div
							key={day}
							className="flex items-center gap-3 py-2 border-b border-[#e5e5e5] last:border-0"
						>
							<div className="w-8 text-xs font-mono tabular-nums text-[#737373]">{day}</div>
							<div className="flex-1 text-xs text-[#737373] italic">No sessions</div>
						</div>
					))}
				</div>
			) : (
				<div className="flex flex-col gap-0">
					{activeDays.map((entry, idx) => (
						<div
							key={`${entry.dayIdx}-${idx}`}
							className="flex items-center gap-3 py-2 border-b border-[#e5e5e5] last:border-0"
						>
							<div className="w-8 shrink-0 text-xs font-mono tabular-nums text-[#737373]">
								{entry.label}
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-xs font-semibold text-[#0a0a0a]">{entry.title}</div>
								<div className="text-xs text-[#737373]">{entry.time}</div>
							</div>
							{entry.done ? (
								<span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
									Done
								</span>
							) : (
								<span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
									Upcoming
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Detail right panel ───────────────────────────────────────────────────────

function TrainerDetailPanel({
	trainer,
	tier,
	organizationId,
	hierarchyNodes,
	onEdit,
	onChangeTier,
	onAssignBranch,
	onSuspend,
	onReactivate,
	isMutating,
}: {
	trainer: TrainerRow;
	tier?: TrainerTier;
	organizationId: string;
	hierarchyNodes: { id: string; name: string }[];
	onEdit: (t: TrainerRow) => void;
	onChangeTier: (t: TrainerRow) => void;
	onAssignBranch: (t: TrainerRow) => void;
	onSuspend: (id: string) => void;
	onReactivate: (id: string) => void;
	isMutating: boolean;
}) {
	const { data: stats, isLoading: statsLoading } = useQuery({
		queryKey: ["trainerWeeklyStats", organizationId, trainer.userId],
		queryFn: () =>
			client.trainers.weeklyStats({
				organizationId,
				memberId: trainer.userId,
			}),
		enabled: !!organizationId && !!trainer.userId,
		staleTime: 60_000,
	});

	const branchName =
		hierarchyNodes.find((n) => n.id === trainer.hierarchyScopeId)?.name ?? "—";

	const isActive = trainer.status === "active";
	const initials = getInitials(trainer.displayName ?? trainer.name);

	const joinedStr = trainer.joinedAt
		? new Date(trainer.joinedAt).toLocaleDateString("en-MY", {
				month: "short",
				year: "numeric",
			})
		: null;

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			{/* ── Profile header ── */}
			<div className="flex items-start justify-between gap-6 border-b border-[#e5e5e5] bg-white px-8 py-6">
				<div className="flex items-center gap-5">
					{/* Avatar 80px */}
					<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] text-white text-2xl font-bold">
						{initials}
					</div>
					<div>
						<div className="mb-1 flex items-center gap-2 flex-wrap">
							<h2 className="text-xl font-bold text-[#0a0a0a]">
								{trainer.displayName ?? trainer.name}
							</h2>
							{tier && <TierBadge name={tier.name} />}
							<ActiveBadge active={isActive} />
						</div>
						<div className="mb-2 text-sm text-[#737373]">
							{trainer.email}
							{trainer.phoneNumber && ` · ${trainer.phoneNumber}`}
						</div>
						<div className="flex items-center gap-2 text-xs text-[#737373] flex-wrap">
							<span>{branchName}</span>
							{trainer.specialization && (
								<>
									<span>·</span>
									<span>{trainer.specialization}</span>
								</>
							)}
							{joinedStr && (
								<>
									<span>·</span>
									<span className="font-mono tabular-nums">Joined {joinedStr}</span>
								</>
							)}
						</div>
					</div>
				</div>

				{/* Action buttons */}
				<div className="flex shrink-0 items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => onChangeTier(trainer)}
						disabled={isMutating}
					>
						Change Tier
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={() => onAssignBranch(trainer)}
						disabled={isMutating}
					>
						Assign Branch
					</Button>
					{isActive ? (
						<Button
							size="sm"
							variant="outline"
							className="text-destructive hover:text-destructive"
							onClick={() => onSuspend(trainer.id)}
							disabled={isMutating}
						>
							Suspend
						</Button>
					) : (
						<Button
							size="sm"
							onClick={() => onReactivate(trainer.id)}
							disabled={isMutating}
						>
							Reactivate
						</Button>
					)}
				</div>
			</div>

			{/* ── KPI row — 4-col divided ── */}
			<div className="grid grid-cols-4 divide-x divide-[#e5e5e5] border-b border-[#e5e5e5] bg-white">
				<KpiTile
					label="Sessions This Week"
					value={String(stats?.sessionsThisWeek ?? 0)}
					sub={
						stats?.sessionsThisWeek != null
							? `${stats.sessionsThisWeek > 0 ? "+" : ""}${stats.sessionsThisWeek} vs last week`
							: undefined
					}
					loading={statsLoading}
				/>
				<KpiTile
					label="Commission YTD"
					value={formatPrice(stats?.commissionYtd ?? 0, "MYR")}
					sub={
						stats?.commissionYtd != null
							? `${formatPrice(Math.round((stats.commissionYtd ?? 0) / 12), "MYR")} this month`
							: undefined
					}
					loading={statsLoading}
				/>
				<KpiTile
					label="Revenue Generated"
					value={formatPrice(stats?.revenueGenerated ?? 0, "MYR")}
					sub="Jan – present"
					loading={statsLoading}
				/>
				<KpiTile
					label="Utilisation"
					value={`${stats?.utilizationPct ?? 0}%`}
					sub="of available slots"
					loading={statsLoading}
				/>
			</div>

			{/* ── Bottom 2-col grid ── */}
			<div className="grid flex-1 grid-cols-2 gap-5 bg-[#f3f3f3] p-6">
				{/* Schedule preview */}
				<SchedulePreviewCard
					organizationId={organizationId}
					memberId={trainer.userId}
				/>

				{/* Right column: Certifications + Contact */}
				<div className="flex flex-col gap-4">
					{/* Certifications */}
					<div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
						<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Certifications
						</div>
						{trainer.certifications && trainer.certifications.length > 0 ? (
							<div className="flex flex-col gap-2">
								{trainer.certifications.map((cert, i) => (
									<div key={i} className="flex items-center gap-2">
										<div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0a0a0a]" />
										<span className="text-xs">{cert}</span>
									</div>
								))}
							</div>
						) : (
							<div className="flex items-center gap-2 text-xs text-[#737373]">
								<BadgeCheck className="h-3.5 w-3.5" />
								No certifications on file
							</div>
						)}
					</div>

					{/* Contact & Branch */}
					<div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
						<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Contact & Branch
						</div>
						<div className="flex flex-col gap-2.5 text-xs">
							<div className="flex justify-between">
								<span className="text-[#737373]">Email</span>
								<span className="font-mono tabular-nums">{trainer.email}</span>
							</div>
							{trainer.phoneNumber && (
								<div className="flex justify-between">
									<span className="text-[#737373]">Phone</span>
									<span className="font-mono tabular-nums">{trainer.phoneNumber}</span>
								</div>
							)}
							<div className="flex justify-between">
								<span className="text-[#737373]">Branch</span>
								<span className="text-[#0a0a0a]">{branchName}</span>
							</div>
							{trainer.specialization && (
								<div className="flex justify-between">
									<span className="text-[#737373]">Specialization</span>
									<span className="text-[#0a0a0a]">{trainer.specialization}</span>
								</div>
							)}
							{tier && (
								<div className="flex justify-between">
									<span className="text-[#737373]">Tier</span>
									<span className="text-[#0a0a0a]">{tier.name}</span>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// ─── Tier filter pill ─────────────────────────────────────────────────────────

type TierFilter = "all" | string; // tier id or "all"

// ─── Main export ──────────────────────────────────────────────────────────────

export function TrainersListPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const hierarchyNodes = (currentOrg?.hierarchy?.nodes ?? []) as {
		id: string;
		name: string;
	}[];

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);
	const [tierFilter, setTierFilter] = useState<TierFilter>("all");
	const [selectedTrainer, setSelectedTrainer] = useState<TrainerRow | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [editingTrainer, setEditingTrainer] = useState<TrainerRow | null>(null);
	const [changeTierTarget, setChangeTierTarget] = useState<TrainerRow | null>(null);
	const [assignBranchTarget, setAssignBranchTarget] = useState<TrainerRow | null>(null);

	const { trainers, trainerTiers, isLoading, isError, refetch } =
		useTrainerData(organizationId, debouncedSearch);

	const {
		createTrainer,
		updateProfile,
		suspend,
		reactivate,
		assignTier,
		isAnyPending,
	} = useTrainerActions({
		organizationId: organizationId ?? "",
		onCreateSuccess: () => setSheetOpen(false),
		onUpdateSuccess: () => setSheetOpen(false),
	});

	// Batch stats for the list sidebar (session counts per trainer)
	const memberIds = trainers.map((t) => t.userId);
	const { data: batchStats } = useQuery({
		queryKey: ["trainerWeeklyStatsBatch", organizationId, memberIds],
		queryFn: () =>
			client.trainers.weeklyStatsBatch({ organizationId: organizationId!, memberIds }),
		enabled: !!organizationId && memberIds.length > 0,
		staleTime: 60_000,
	});

	// Apply tier filter client-side
	const filteredTrainers =
		tierFilter === "all"
			? trainers
			: trainers.filter((t) => t.trainerTierId === tierFilter);

	// Auto-select first on load
	const activeTrainer =
		selectedTrainer ??
		(filteredTrainers.length > 0 ? filteredTrainers[0] : null);

	function handleFormSubmit(form: FormState, memberId: string | null) {
		if (memberId) {
			updateProfile.mutate({ memberId, values: form });
		} else {
			createTrainer.mutate(form);
		}
	}

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-[#737373] text-sm">
				Select an organization to manage trainers.
			</div>
		);
	}

	if (isLoading) return <PageLoader />;

	if (isError) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					title="Couldn't load trainers"
					onRetry={() => refetch()}
				/>
			</div>
		);
	}

	const activeTierObj = activeTrainer
		? trainerTiers.find((tier) => tier.id === activeTrainer.trainerTierId)
		: undefined;

	return (
		<div className="flex h-full">
			{/* ── Left list panel (300px) ── */}
			<div className="flex w-[300px] shrink-0 flex-col border-r border-[#e5e5e5] bg-white">
				{/* Search */}
				<div className="border-b border-[#e5e5e5] px-4 py-3">
					<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
						<Search className="h-3.5 w-3.5 text-[#737373] flex-shrink-0" />
						<input
							type="text"
							placeholder="Search…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#737373] text-[#0a0a0a]"
						/>
					</div>
				</div>

				{/* Tier filter pills */}
				<div className="flex flex-wrap items-center gap-1.5 border-b border-[#e5e5e5] px-3 py-2">
					<button
						type="button"
						onClick={() => setTierFilter("all")}
						className={cn(
							"rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
							tierFilter === "all"
								? "bg-[#0a0a0a] text-white"
								: "border border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f3f3f3]",
						)}
					>
						All
					</button>
					{trainerTiers.map((tier) => (
						<button
							key={tier.id}
							type="button"
							onClick={() => setTierFilter(tier.id)}
							className={cn(
								"rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
								tierFilter === tier.id
									? "bg-[#0a0a0a] text-white"
									: "border border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f3f3f3]",
							)}
						>
							{tier.name}
						</button>
					))}
				</div>

				{/* Trainer list */}
				<div className="flex-1 overflow-y-auto">
					{filteredTrainers.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
							<Users className="h-8 w-8 text-[#737373] opacity-30" />
							<p className="text-sm font-medium text-[#0a0a0a]">
								{debouncedSearch || tierFilter !== "all" ? "No trainers match" : "No trainers yet"}
							</p>
							<p className="text-xs text-[#737373]">
								{debouncedSearch || tierFilter !== "all"
									? "Try clearing filters or searching a different term."
									: "Invite a trainer to get started."}
							</p>
						</div>
					) : (
						filteredTrainers.map((trainer) => {
							const tier = trainerTiers.find(
								(t) => t.id === trainer.trainerTierId,
							);
							const weekSessions = batchStats?.[trainer.userId]?.sessionsThisWeek;
							return (
								<TrainerListRow
									key={trainer.id}
									trainer={trainer}
									tier={tier}
									weekSessions={weekSessions}
									isSelected={activeTrainer?.id === trainer.id}
									onClick={() => setSelectedTrainer(trainer)}
								/>
							);
						})
					)}
				</div>

				{/* Invite button */}
				<div className="border-t border-[#e5e5e5] px-4 py-3">
					<button
						type="button"
						onClick={() => {
							setEditingTrainer(null);
							setSheetOpen(true);
						}}
						disabled={isAnyPending}
						className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#0a0a0a] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-50"
					>
						<Plus className="h-3.5 w-3.5" />
						Invite Trainer
					</button>
				</div>
			</div>

			{/* ── Right detail panel ── */}
			<div className="flex-1 overflow-hidden bg-[#f3f3f3]">
				{activeTrainer ? (
					<TrainerDetailPanel
						trainer={activeTrainer}
						tier={activeTierObj}
						organizationId={organizationId}
						hierarchyNodes={hierarchyNodes as any}
						onEdit={(t) => {
							setEditingTrainer(t);
							setSheetOpen(true);
						}}
						onChangeTier={(t) => setChangeTierTarget(t)}
						onAssignBranch={(t) => setAssignBranchTarget(t)}
						onSuspend={(id) => suspend.mutate(id)}
						onReactivate={(id) => reactivate.mutate(id)}
						isMutating={isAnyPending}
					/>
				) : (
					<div className="flex h-full items-center justify-center">
						<div className="flex flex-col items-center gap-2 text-[#737373]">
							<Users className="h-10 w-10 opacity-20" />
							<p className="text-sm font-medium text-[#0a0a0a]">No trainer selected</p>
							<p className="text-xs text-[#737373]">Select a trainer from the list to view details</p>
						</div>
					</div>
				)}
			</div>

			{/* Form dialog */}
			{sheetOpen && (
				<TrainerFormDialog
					key={editingTrainer?.id ?? "create"}
					open={sheetOpen}
					onClose={() => setSheetOpen(false)}
					trainer={editingTrainer}
					organizationId={organizationId}
					hierarchyNodes={hierarchyNodes as any}
					onSubmit={handleFormSubmit}
					isMutating={isAnyPending}
				/>
			)}

			{/* Change Tier dialog */}
			{organizationId && changeTierTarget && (
				<ChangeTierDialog
					open={!!changeTierTarget}
					onOpenChange={(open) => {
						if (!open) setChangeTierTarget(null);
					}}
					organizationId={organizationId}
					memberId={changeTierTarget.id}
					trainerName={changeTierTarget.name}
					currentTierId={changeTierTarget.trainerTierId}
					onSuccess={() => refetch()}
				/>
			)}

			{/* Assign Branch dialog */}
			{organizationId && assignBranchTarget && (
				<AssignBranchDialog
					open={!!assignBranchTarget}
					onOpenChange={(open) => {
						if (!open) setAssignBranchTarget(null);
					}}
					organizationId={organizationId}
					memberId={assignBranchTarget.id}
					trainerName={assignBranchTarget.name}
					currentBranchId={assignBranchTarget.hierarchyScopeId}
					onSuccess={() => refetch()}
				/>
			)}
		</div>
	);
}
