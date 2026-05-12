import { useQuery } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client } from "@/utils/orpc";
import type { CartItem, ItemTrainerAssignments, TrainerAssignment } from "./types";

// ─── Types ─────────────────────────────────────────────────────────────────────

type TrainerPickerStepProps = {
	items: CartItem[];
	organizationId: string;
	assignments: ItemTrainerAssignments;
	onChange: (assignments: ItemTrainerAssignments) => void;
};

// Shape returned by members.list
type MemberRow = {
	id: string;
	userId: string;
	role: string;
	name: string;
	email: string;
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function TrainerPickerStep({
	items,
	organizationId,
	assignments,
	onChange,
}: TrainerPickerStepProps) {
	// Only service items with a refId are eligible for trainer assignment
	const serviceItems = items.filter(
		(item) => item.type === "service" && item.refId,
	);

	// Fetch trainers — filter by role=trainer directly on the server
	const membersQuery = useQuery({
		queryKey: ["members-trainer-role", organizationId],
		queryFn: () =>
			client.members.list({ organizationId, role: "trainer", status: "active" }),
		enabled: !!organizationId,
	});

	const trainers = (membersQuery.data ?? []) as MemberRow[];

	// ── Handlers ────────────────────────────────────────────────────────────────

	function handleAddTrainer(itemIndex: number) {
		const current = assignments[itemIndex] ?? [];
		const nextSlotIndex = current.length;
		onChange({
			...assignments,
			[itemIndex]: [
				...current,
				{ staffId: "", staffName: "", slotIndex: nextSlotIndex },
			],
		});
	}

	function handleRemoveTrainer(itemIndex: number, slotIndex: number) {
		const current = (assignments[itemIndex] ?? []).filter(
			(a) => a.slotIndex !== slotIndex,
		);
		// Re-index slotIndex values after removal
		const reindexed = current.map(
			(a, i): TrainerAssignment => ({ ...a, slotIndex: i }),
		);
		onChange({ ...assignments, [itemIndex]: reindexed });
	}

	function handleSelectTrainer(
		itemIndex: number,
		slotIndex: number,
		userId: string,
	) {
		const trainer = trainers.find((t) => t.userId === userId);
		const current = assignments[itemIndex] ?? [];
		const updated = current.map(
			(a): TrainerAssignment =>
				a.slotIndex === slotIndex
					? { ...a, staffId: userId, staffName: trainer?.name ?? userId }
					: a,
		);
		onChange({ ...assignments, [itemIndex]: updated });
	}

	// ── Empty state ──────────────────────────────────────────────────────────────

	if (serviceItems.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-2">
				No service items in cart to assign trainers to.
			</p>
		);
	}

	// ── Render ───────────────────────────────────────────────────────────────────

	const hasUnassignedItem = serviceItems.some((item) => {
		const idx = items.indexOf(item);
		const a = assignments[idx];
		return !a || a.length === 0 || a.every((x) => !x.staffId);
	});

	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm text-muted-foreground">
				Assign trainers to commission-configured items. This step is optional —
				skip if the trainer is not yet known.
			</p>

			{hasUnassignedItem && (
				<div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
					No commission will be recorded for items without an assigned trainer.
				</div>
			)}

			{serviceItems.map((item) => {
				const itemIndex = items.indexOf(item);
				const currentAssignments = assignments[itemIndex] ?? [];

				return (
					<div
						key={item.id}
						className="rounded-md border p-3 flex flex-col gap-2"
					>
						<p className="text-sm font-medium">{item.description}</p>

						{currentAssignments.map((assignment) => (
							<div
								key={assignment.slotIndex}
								className="flex items-center gap-2"
							>
								<span className="text-xs text-muted-foreground w-16 shrink-0">
									Slot {assignment.slotIndex + 1}
								</span>
								<Select
									value={assignment.staffId || undefined}
									onValueChange={(userId) =>
										handleSelectTrainer(itemIndex, assignment.slotIndex, userId)
									}
								>
									<SelectTrigger className="flex-1 h-8 text-sm">
										<SelectValue placeholder="Select trainer..." />
									</SelectTrigger>
									<SelectContent>
										{trainers.length === 0 && (
											<SelectItem value="_none" disabled>
												No trainers found
											</SelectItem>
										)}
										{trainers.map((t) => (
											<SelectItem key={t.userId} value={t.userId}>
												{t.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 shrink-0"
									onClick={() =>
										handleRemoveTrainer(itemIndex, assignment.slotIndex)
									}
									type="button"
								>
									<X className="h-3.5 w-3.5" />
								</Button>
							</div>
						))}

						<Button
							variant="outline"
							size="sm"
							className="self-start mt-1"
							onClick={() => handleAddTrainer(itemIndex)}
							type="button"
						>
							<UserPlus className="h-3.5 w-3.5 mr-1" />
							Add Trainer
						</Button>
					</div>
				);
			})}
		</div>
	);
}
