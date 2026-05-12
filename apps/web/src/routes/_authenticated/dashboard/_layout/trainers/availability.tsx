import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { PageHeader } from "@/components/ui/page-header";
import { StatusCallout } from "@/components/ui/status-callout";
import { PageLoader } from "@/components/ui/loading-spinner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	TrainerAvailabilitySheet,
	type TrainerAvailabilityRow,
} from "@/components/trainers/trainer-availability-sheet";
import { CoachIntakeEditor } from "@/components/trainers/coach-intake-editor";
import { CoachIntakeClaimDialog } from "@/components/trainers/coach-intake-claim-dialog";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/trainers/availability",
)({
	component: TrainerAvailabilityPage,
});

const DAY_COLUMNS: Array<{ key: string; label: string }> = [
	{ key: "monday", label: "Mon" },
	{ key: "tuesday", label: "Tue" },
	{ key: "wednesday", label: "Wed" },
	{ key: "thursday", label: "Thu" },
	{ key: "friday", label: "Fri" },
	{ key: "saturday", label: "Sat" },
	{ key: "sunday", label: "Sun" },
];

// ─── Intake tab sub-component ─────────────────────────────────────────────────

type IntakeRow = {
	trainerId: string;
	trainerName: string;
	trainerEmail: string;
	slots: Array<{ dayOfWeek: string; startTime: string; endTime: string }>;
	hasOpenSlots: boolean;
};

function IntakeTab({
	organizationId,
	intakeData,
	isTrainerRole,
	callerMemberId,
	onOpenEditor,
	onClaim,
	onUnclaim,
	DAY_COLUMNS: dayCols,
}: {
	organizationId: string;
	intakeData: IntakeRow[];
	isTrainerRole: boolean;
	callerMemberId: string | null;
	onOpenEditor: (trainerId: string, trainerName: string) => void;
	onClaim: (args: {
		trainerId: string;
		trainerName: string;
		date: string;
		startTime: string;
		endTime: string;
	}) => void;
	onUnclaim: (args: {
		trainerId: string;
		trainerName: string;
		date: string;
		startTime: string;
		endTime: string;
		exceptionId: string;
		existingReason?: string;
	}) => void;
	DAY_COLUMNS: Array<{ key: string; label: string }>;
}) {
	const intakeRows =
		isTrainerRole && callerMemberId
			? intakeData.filter((r) => r.trainerId === callerMemberId)
			: intakeData;

	if (intakeRows.length === 0) {
		return (
			<StatusCallout
				variant="info"
				title="No intake schedules"
				message={
					isTrainerRole
						? "Your intake availability has not been set up yet."
						: "No trainers have intake schedules configured."
				}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-2xl border border-border/40 bg-card shadow-sm">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="min-w-[180px]">Trainer</TableHead>
							{dayCols.map((d) => (
								<TableHead key={d.key} className="min-w-[110px]">
									{d.label}
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{intakeRows.map((row) => {
							const slotsByDay = new Map<
								string,
								Array<{ startTime: string; endTime: string }>
							>();
							for (const slot of row.slots) {
								const list = slotsByDay.get(slot.dayOfWeek) ?? [];
								list.push({ startTime: slot.startTime, endTime: slot.endTime });
								slotsByDay.set(slot.dayOfWeek, list);
							}
							return (
								<TableRow key={row.trainerId}>
									<TableCell>
										<button
											type="button"
											onClick={() => onOpenEditor(row.trainerId, row.trainerName)}
											className="text-left font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
										>
											{row.trainerName}
										</button>
										{row.trainerEmail ? (
											<div className="text-xs text-muted-foreground">
												{row.trainerEmail}
											</div>
										) : null}
									</TableCell>
									{dayCols.map((d) => {
										const slots = slotsByDay.get(d.key) ?? [];
										if (slots.length === 0) {
											return (
												<TableCell key={d.key} className="text-muted-foreground">
													—
												</TableCell>
											);
										}
										return (
											<TableCell key={d.key} className="align-top">
												<div className="flex flex-col gap-0.5 text-xs tabular-nums">
													{slots.map((s) => (
														<span
															key={`${s.startTime}-${s.endTime}`}
															className="rounded bg-primary/10 px-1 py-0.5 text-primary"
														>
															{s.startTime}–{s.endTime}
														</span>
													))}
												</div>
											</TableCell>
										);
									})}
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TrainerAvailabilityPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const memberRole = (
		currentOrg?.hierarchy?.member?.role ?? ""
	).toLowerCase();
	// hierarchy.member.id is not in UserContextResponse type; narrow without `any`.
	type MemberWithId = NonNullable<typeof currentOrg>["hierarchy"]["member"] & { id?: string };
	const callerMemberId =
		(currentOrg?.hierarchy?.member as MemberWithId | null | undefined)?.id ?? null;
	const isTrainerRole = memberRole === "trainer";

	// ── General schedule state ────────────────────────────────────────────────

	const [selectedTrainer, setSelectedTrainer] =
		useState<TrainerAvailabilityRow | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	// ── Intake editor state ───────────────────────────────────────────────────

	const [intakeEditorTrainer, setIntakeEditorTrainer] = useState<{
		trainerId: string;
		trainerName: string;
	} | null>(null);
	const [intakeEditorOpen, setIntakeEditorOpen] = useState(false);

	// ── Claim dialog state ────────────────────────────────────────────────────

	const [claimDialog, setClaimDialog] = useState<{
		mode: "claim" | "unclaim";
		trainerId: string;
		trainerName: string;
		date: string;
		startTime: string;
		endTime: string;
		exceptionId?: string;
		existingReason?: string;
	} | null>(null);

	// ── Queries ───────────────────────────────────────────────────────────────

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

	const { data: intakeData, refetch: refetchIntake } = useQuery({
		queryKey: ["coachIntakeByBranch", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.coachIntake.listByBranch({ organizationId });
		},
		enabled: !!organizationId,
	});

	// ── Derived data ──────────────────────────────────────────────────────────

	const rows = useMemo(() => {
		const all = data ?? [];
		if (isTrainerRole && callerMemberId) {
			return all.filter((r) => r.trainerId === callerMemberId);
		}
		return all;
	}, [data, isTrainerRole, callerMemberId]);

	const slotsByTrainerByDay = useMemo(() => {
		const map = new Map<string, Map<string, TrainerAvailabilityRow["slots"]>>();
		for (const row of rows) {
			const dayMap = new Map<string, TrainerAvailabilityRow["slots"]>();
			for (const slot of row.slots) {
				const list = dayMap.get(slot.dayOfWeek) ?? [];
				list.push(slot);
				dayMap.set(slot.dayOfWeek, list);
			}
			for (const list of dayMap.values()) {
				list.sort((a, b) => a.startTime.localeCompare(b.startTime));
			}
			map.set(row.trainerId, dayMap);
		}
		return map;
	}, [rows]);

	// ── Handlers ──────────────────────────────────────────────────────────────

	function openSheetFor(row: TrainerAvailabilityRow) {
		setSelectedTrainer(row);
		setSheetOpen(true);
	}

	// ── Guard ─────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="info"
					title="No organization"
					message="Select an organization to view trainer availability."
				/>
			</div>
		);
	}

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="flex flex-col gap-4 p-6">
			<PageHeader
				icon={CalendarRange}
				title="Trainer Availability"
				description="View weekly availability schedules for trainers"
			/>

			<Tabs defaultValue="general" className="w-full">
				<TabsList className="mb-4">
					<TabsTrigger value="general">General Schedule</TabsTrigger>
					<TabsTrigger value="intake">Intake Availability</TabsTrigger>
				</TabsList>

				{/* ── General Schedule Tab ───────────────────────────────────────────── */}
				<TabsContent value="general">
					{isLoading ? (
						<PageLoader />
					) : isError ? (
						<StatusCallout
							variant="error"
							title="Couldn't load trainer availability"
							onRetry={() => refetch()}
						/>
					) : rows.length === 0 ? (
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
						<div className="rounded-2xl border border-border/40 bg-card shadow-sm">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="min-w-[180px]">Trainer</TableHead>
										{DAY_COLUMNS.map((d) => (
											<TableHead key={d.key} className="min-w-[110px]">
												{d.label}
											</TableHead>
										))}
									</TableRow>
								</TableHeader>
								<TableBody>
									{rows.map((row) => {
										const dayMap = slotsByTrainerByDay.get(row.trainerId);
										return (
											<TableRow key={row.trainerId}>
												<TableCell>
													<button
														type="button"
														onClick={() => openSheetFor(row)}
														className="text-left font-medium text-primary hover:underline focus:outline-none focus-visible:underline"
													>
														{row.trainerName}
													</button>
													{row.trainerEmail ? (
														<div className="text-xs text-muted-foreground">
															{row.trainerEmail}
														</div>
													) : null}
												</TableCell>
												{DAY_COLUMNS.map((d) => {
													const slots = dayMap?.get(d.key) ?? [];
													if (slots.length === 0) {
														return (
															<TableCell
																key={d.key}
																className="text-muted-foreground"
															>
																—
															</TableCell>
														);
													}
													return (
														<TableCell key={d.key} className="align-top">
															<div className="flex flex-col gap-0.5 text-xs tabular-nums">
																{slots.map((s) => (
																	<span key={s.id}>
																		{s.startTime} – {s.endTime}
																	</span>
																))}
															</div>
														</TableCell>
													);
												})}
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}

					<TrainerAvailabilitySheet
						trainer={selectedTrainer}
						open={sheetOpen}
						onOpenChange={(open) => {
							setSheetOpen(open);
							if (!open) setSelectedTrainer(null);
						}}
					/>
				</TabsContent>

				{/* ── Intake Availability Tab ───────────────────────────────────────── */}
				<TabsContent value="intake">
					<IntakeTab
						organizationId={organizationId}
						intakeData={(intakeData ?? []) as IntakeRow[]}
						isTrainerRole={isTrainerRole}
						callerMemberId={callerMemberId}
						onOpenEditor={(trainerId, trainerName) => {
							setIntakeEditorTrainer({ trainerId, trainerName });
							setIntakeEditorOpen(true);
						}}
						onClaim={(args) => setClaimDialog({ mode: "claim", ...args })}
						onUnclaim={(args) =>
							setClaimDialog({ mode: "unclaim", ...args })
						}
						DAY_COLUMNS={DAY_COLUMNS}
					/>
				</TabsContent>
			</Tabs>

			{/* ── Intake editor sheet ──────────────────────────────────────────────── */}
			<CoachIntakeEditor
				organizationId={organizationId ?? ""}
				trainerId={intakeEditorTrainer?.trainerId ?? ""}
				trainerName={intakeEditorTrainer?.trainerName ?? ""}
				open={intakeEditorOpen}
				onOpenChange={(open) => {
					setIntakeEditorOpen(open);
					if (!open) setIntakeEditorTrainer(null);
				}}
				onSaved={() => refetchIntake()}
			/>

			{/* ── Claim dialog ─────────────────────────────────────────────────────── */}
			<CoachIntakeClaimDialog
				open={!!claimDialog}
				onOpenChange={(open) => {
					if (!open) setClaimDialog(null);
				}}
				mode={claimDialog?.mode ?? "claim"}
				organizationId={organizationId ?? ""}
				trainerId={claimDialog?.trainerId ?? ""}
				trainerName={claimDialog?.trainerName ?? ""}
				date={claimDialog?.date ?? ""}
				startTime={claimDialog?.startTime ?? ""}
				endTime={claimDialog?.endTime ?? ""}
				exceptionId={claimDialog?.exceptionId}
				existingReason={claimDialog?.existingReason}
				onSuccess={() => {
					setClaimDialog(null);
					refetchIntake();
				}}
			/>
		</div>
	);
}
