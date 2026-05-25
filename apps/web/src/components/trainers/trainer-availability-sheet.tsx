import { CalendarRange, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotKind = "available" | "blocked" | "timeoff";

type AvailabilitySlot = {
	id: string;
	trainerId: string;
	dayOfWeek: string;
	startTime: string;
	endTime: string;
	kind: SlotKind;
};

export type TrainerAvailabilityRow = {
	trainerId: string;
	trainerName: string;
	trainerEmail: string;
	specialization: string | null;
	slots: AvailabilitySlot[];
};

interface TrainerAvailabilitySheetProps {
	trainer: TrainerAvailabilityRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Needed for the upsert mutation. */
	organizationId: string | null;
	/** Called after a successful save so the parent can refetch. */
	onSaved?: () => void;
}

/** Draft slot used in edit mode — `id` is absent for newly-added rows. */
type DraftSlot = {
	/** React key — slot id for existing rows, random string for new ones. */
	_key: string;
	dayOfWeek: string;
	startTime: string;
	endTime: string;
	kind: SlotKind;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_ORDER: Array<{ key: string; label: string }> = [
	{ key: "monday", label: "Monday" },
	{ key: "tuesday", label: "Tuesday" },
	{ key: "wednesday", label: "Wednesday" },
	{ key: "thursday", label: "Thursday" },
	{ key: "friday", label: "Friday" },
	{ key: "saturday", label: "Saturday" },
	{ key: "sunday", label: "Sunday" },
];

const KIND_LABEL: Record<SlotKind, string> = {
	available: "Available",
	blocked: "Blocked",
	timeoff: "Time Off",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function kindBadgeCls(kind: SlotKind) {
	if (kind === "blocked") return "bg-red-100 text-red-700";
	if (kind === "timeoff") return "bg-amber-100 text-amber-700";
	return "bg-[#d1fae5] text-[#065f46]";
}

function newKey() {
	return Math.random().toString(36).slice(2, 10);
}

function slotsToEditable(slots: AvailabilitySlot[]): DraftSlot[] {
	return slots.map((s) => ({
		_key: s.id,
		dayOfWeek: s.dayOfWeek,
		startTime: s.startTime,
		endTime: s.endTime,
		kind: s.kind,
	}));
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainerAvailabilitySheet({
	trainer,
	open,
	onOpenChange,
	organizationId,
	onSaved,
}: TrainerAvailabilitySheetProps) {
	const qc = useQueryClient();

	const [editMode, setEditMode] = useState(false);
	const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([]);

	// ── Mutation ────────────────────────────────────────────────────────────

	const saveMutation = useApiMutation({
		mutationFn: (slots: DraftSlot[]) =>
			client.trainerAvailability.upsert({
				organizationId: organizationId!,
				trainerId: trainer!.trainerId,
				slots: slots.map((s) => ({
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
					kind: s.kind,
				})),
			}),
		successMessage: "Schedule saved.",
		errorMessage: (err) =>
			err instanceof Error ? err.message : "Failed to save schedule.",
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["trainerAvailabilityByBranch", organizationId],
			});
			setEditMode(false);
			onSaved?.();
		},
	});

	// ── Edit mode helpers ───────────────────────────────────────────────────

	function enterEdit() {
		setDraftSlots(slotsToEditable(trainer?.slots ?? []));
		setEditMode(true);
	}

	function cancelEdit() {
		setEditMode(false);
		setDraftSlots([]);
		saveMutation.reset?.();
	}

	function handleSave() {
		// Only submit slots that have both times filled in
		const valid = draftSlots.filter((s) => s.startTime && s.endTime);
		saveMutation.mutate(valid);
	}

	function addSlot(dayOfWeek: string) {
		setDraftSlots((prev) => [
			...prev,
			{
				_key: newKey(),
				dayOfWeek,
				startTime: "09:00",
				endTime: "17:00",
				kind: "available",
			},
		]);
	}

	function removeSlot(key: string) {
		setDraftSlots((prev) => prev.filter((s) => s._key !== key));
	}

	function patchSlot(key: string, patch: Partial<Omit<DraftSlot, "_key">>) {
		setDraftSlots((prev) =>
			prev.map((s) => (s._key === key ? { ...s, ...patch } : s)),
		);
	}

	// ── Close handler — reset edit state ───────────────────────────────────

	function handleOpenChange(next: boolean) {
		if (!next) {
			setEditMode(false);
			setDraftSlots([]);
			saveMutation.reset?.();
		}
		onOpenChange(next);
	}

	// ── Slot grouping for read mode ─────────────────────────────────────────

	const slotsByDay = new Map<string, AvailabilitySlot[]>();
	if (trainer) {
		for (const slot of trainer.slots) {
			const list = slotsByDay.get(slot.dayOfWeek) ?? [];
			list.push(slot);
			slotsByDay.set(slot.dayOfWeek, list);
		}
		for (const list of slotsByDay.values()) {
			list.sort((a, b) => a.startTime.localeCompare(b.startTime));
		}
	}

	const canEdit = !!organizationId && !!trainer;

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent
				side="right"
				className="flex w-full flex-col overflow-hidden sm:max-w-md"
			>
				{/* ── Header ──────────────────────────────────────────── */}
				<SheetHeader className="border-b border-border/40 pb-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
							<CalendarRange className="h-5 w-5 text-primary" />
						</div>
						<div className="min-w-0 flex-1">
							<SheetTitle className="truncate text-lg">
								{trainer?.trainerName ?? "Trainer"}
							</SheetTitle>
							{trainer?.trainerEmail ? (
								<SheetDescription className="flex items-center gap-1.5 text-xs">
									<Mail className="h-3 w-3" />
									<span className="truncate">{trainer.trainerEmail}</span>
								</SheetDescription>
							) : null}
						</div>
						{/* Edit toggle — only in read mode */}
						{canEdit && !editMode && (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="shrink-0"
								onClick={enterEdit}
							>
								<Pencil className="mr-1.5 h-3.5 w-3.5" />
								Edit
							</Button>
						)}
						{editMode && (
							<span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
								Editing
							</span>
						)}
					</div>
				</SheetHeader>

				{/* ── Scrollable body ─────────────────────────────────── */}
				<div className="flex-1 overflow-y-auto">
					<div className="flex flex-col gap-3 px-4 py-4 pb-6">
						{!trainer ? (
							<p className="text-sm text-muted-foreground">
								No trainer selected.
							</p>
						) : editMode ? (
							// ── Edit mode ─────────────────────────────────────
							DAY_ORDER.map(({ key, label }) => {
								const dayDrafts = draftSlots.filter(
									(s) => s.dayOfWeek === key,
								);
								return (
									<div
										key={key}
										className="rounded-xl border border-border/40 bg-card p-4 shadow-sm"
									>
										<div className="mb-3 flex items-center justify-between">
											<h3 className="text-sm font-semibold">{label}</h3>
											<span className="text-xs text-muted-foreground">
												{dayDrafts.length} window
												{dayDrafts.length === 1 ? "" : "s"}
											</span>
										</div>

										<div className="flex flex-col gap-2">
											{dayDrafts.map((slot) => (
												<div
													key={slot._key}
													className="flex items-center gap-2"
												>
													{/* Start time */}
													<input
														type="time"
														value={slot.startTime}
														onChange={(e) =>
															patchSlot(slot._key, {
																startTime: e.target.value,
															})
														}
														className="w-[88px] rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
													/>
													<span className="text-xs text-muted-foreground">
														–
													</span>
													{/* End time */}
													<input
														type="time"
														value={slot.endTime}
														onChange={(e) =>
															patchSlot(slot._key, {
																endTime: e.target.value,
															})
														}
														className="w-[88px] rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
													/>
													{/* Kind */}
													<select
														value={slot.kind}
														onChange={(e) =>
															patchSlot(slot._key, {
																kind: e.target.value as SlotKind,
															})
														}
														className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
													>
														{(
															[
																"available",
																"blocked",
																"timeoff",
															] as const
														).map((k) => (
															<option key={k} value={k}>
																{KIND_LABEL[k]}
															</option>
														))}
													</select>
													{/* Delete */}
													<button
														type="button"
														onClick={() => removeSlot(slot._key)}
														className="rounded p-0.5 text-muted-foreground transition hover:text-destructive"
														aria-label="Remove window"
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>
											))}

											{/* Add window */}
											<button
												type="button"
												onClick={() => addSlot(key)}
												className="mt-1 flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
											>
												<Plus className="h-3.5 w-3.5" />
												Add window
											</button>
										</div>
									</div>
								);
							})
						) : (
							// ── Read mode ──────────────────────────────────────
							DAY_ORDER.map(({ key, label }) => {
								const daySlots = slotsByDay.get(key) ?? [];
								return (
									<div
										key={key}
										className="rounded-xl border border-border/40 bg-card p-4 shadow-sm"
									>
										<div className="mb-2 flex items-center justify-between">
											<h3 className="text-sm font-semibold">{label}</h3>
											{daySlots.length === 0 ? (
												<span className="text-xs text-muted-foreground">
													Unavailable
												</span>
											) : (
												<span className="text-xs text-muted-foreground">
													{daySlots.length} window
													{daySlots.length === 1 ? "" : "s"}
												</span>
											)}
										</div>
										{daySlots.length > 0 && (
											<ul className="flex flex-col gap-1">
												{daySlots.map((slot) => (
													<li
														key={slot.id}
														className="flex items-center gap-2"
													>
														<span
															className={cn(
																"rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
																kindBadgeCls(slot.kind),
															)}
														>
															{slot.startTime}–{slot.endTime}
														</span>
														{slot.kind !== "available" && (
															<span className="text-[10px] capitalize text-muted-foreground">
																{KIND_LABEL[slot.kind]}
															</span>
														)}
													</li>
												))}
											</ul>
										)}
									</div>
								);
							})
						)}
					</div>
				</div>

				{/* ── Footer — only in edit mode ───────────────────────── */}
				{editMode && (
					<SheetFooter className="border-t border-border/40 pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={cancelEdit}
							disabled={saveMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={handleSave}
							disabled={saveMutation.isPending}
						>
							{saveMutation.isPending ? "Saving…" : "Save Changes"}
						</Button>
					</SheetFooter>
				)}
			</SheetContent>
		</Sheet>
	);
}
