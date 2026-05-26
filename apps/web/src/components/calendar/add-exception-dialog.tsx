import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExceptionKind = "timeoff" | "blocked";

export interface AddExceptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	/** Pre-select a trainer. If omitted a dropdown is shown. */
	preselectedTrainerId?: string;
	preselectedTrainerName?: string;
	/** Pre-select the kind. Defaults to "timeoff". */
	defaultKind?: ExceptionKind;
	onSuccess?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddExceptionDialog({
	open,
	onOpenChange,
	organizationId,
	preselectedTrainerId,
	preselectedTrainerName,
	defaultKind = "timeoff",
	onSuccess,
}: AddExceptionDialogProps) {
	const [trainerId, setTrainerId] = useState(preselectedTrainerId ?? "");
	const [date, setDate] = useState("");
	const [reason, setReason] = useState("");
	const [kind, setKind] = useState<ExceptionKind>(defaultKind);

	const qc = useQueryClient();

	// Fetch trainer list for the selector when no trainer is pre-selected
	const { data: trainerRows } = useQuery({
		queryKey: ["trainerAvailabilityByBranch", organizationId],
		queryFn: () =>
			client.trainerAvailability.listByBranch({ organizationId }),
		enabled: !!organizationId && !preselectedTrainerId,
		staleTime: 60_000,
	});

	// Sync kind with defaultKind every time the dialog is opened (programmatic opens don't
	// trigger Radix's onOpenChange, so handleOpenChange's else-branch never fires for them).
	useEffect(() => {
		if (open) setKind(defaultKind);
	}, [open, defaultKind]);

	const effectiveTrainerId = preselectedTrainerId ?? trainerId;

	const mutation = useApiMutation({
		mutationFn: () =>
			client.trainerAvailability.addException({
				organizationId,
				trainerId: effectiveTrainerId,
				date,
				kind,
				reason: reason.trim() ? reason.trim() : undefined,
			}),
		successMessage:
			kind === "blocked"
				? "Time blocked successfully."
				: "Exception added successfully.",
		errorMessage: (err) =>
			err instanceof Error ? err.message : "Failed to add exception.",
		onSuccess: () => {
			qc.invalidateQueries({
				queryKey: ["trainerExceptions", organizationId, effectiveTrainerId],
			});
			qc.invalidateQueries({
				queryKey: ["trainerAvailabilityByBranch", organizationId],
			});
			setDate("");
			setReason("");
			onSuccess?.();
		},
	});

	function handleOpenChange(next: boolean) {
		if (!next) {
			setDate("");
			setReason("");
			if (!preselectedTrainerId) setTrainerId("");
		} else {
			// Sync kind with defaultKind every time the dialog opens
			setKind(defaultKind);
		}
		onOpenChange(next);
	}

	const canSubmit = !!effectiveTrainerId && !!date;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{kind === "blocked" ? "Block Time" : "Add Exception Day"}
					</DialogTitle>
					<DialogDescription>
						{kind === "blocked"
							? "Mark a specific date as blocked for a trainer (e.g. venue closure, reserved time)."
							: "Mark a specific date as time-off for a trainer. The trainer's normal schedule will be suspended on this date."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-1">
					{/* Trainer selector — only shown when no trainer is pre-selected */}
					{!preselectedTrainerId && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="exception-trainer">Trainer</Label>
							<Select
								value={trainerId}
								onValueChange={setTrainerId}
								disabled={mutation.isPending}
							>
								<SelectTrigger id="exception-trainer">
									<SelectValue placeholder="Select a trainer…" />
								</SelectTrigger>
								<SelectContent>
									{(trainerRows ?? []).map((r) => (
										<SelectItem key={r.trainerId} value={r.trainerId}>
											{r.trainerName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{/* Pre-selected trainer display */}
					{preselectedTrainerId && preselectedTrainerName && (
						<div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm">
							<span className="text-muted-foreground">Trainer: </span>
							<span className="font-medium">{preselectedTrainerName}</span>
						</div>
					)}

					{/* Kind selector */}
					<div className="flex flex-col gap-1.5">
						<Label>Kind</Label>
						<div className="flex gap-3">
							{(["timeoff", "blocked"] as const).map((k) => (
								<label
									key={k}
									className="flex cursor-pointer items-center gap-2 text-sm"
								>
									<input
										type="radio"
										name="exception-kind"
										value={k}
										checked={kind === k}
										onChange={() => setKind(k)}
										disabled={mutation.isPending}
										className="accent-black"
									/>
									{k === "timeoff" ? "Time Off" : "Blocked"}
								</label>
							))}
						</div>
					</div>

					{/* Date picker */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="exception-date">Exception Date</Label>
						<Input
							id="exception-date"
							type="date"
							value={date}
							onChange={(e) => setDate(e.target.value)}
							disabled={mutation.isPending}
						/>
					</div>

					{/* Reason */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="exception-reason">
							Reason{" "}
							<span className="text-xs font-normal text-muted-foreground">
								(optional)
							</span>
						</Label>
						<Textarea
							id="exception-reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							placeholder="e.g. Public holiday, trainer leave, venue closure…"
							rows={2}
							disabled={mutation.isPending}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => mutation.mutate()}
						disabled={!canSubmit || mutation.isPending}
					>
						{mutation.isPending
							? "Saving…"
							: kind === "blocked"
								? "Block Time"
								: "Add Exception"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
