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

export type ExceptionKind = "timeoff" | "blocked";

export interface AddExceptionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	preselectedTrainerId?: string;
	preselectedTrainerName?: string;
	defaultKind?: ExceptionKind;
	onSuccess?: () => void;
}

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

	const { data: trainerRows } = useQuery({
		queryKey: ["trainerAvailabilityByBranch", organizationId],
		queryFn: () => client.trainerAvailability.listByBranch({ organizationId }),
		enabled: !!organizationId && !preselectedTrainerId,
		staleTime: 60_000,
	});

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
			setKind(defaultKind);
		}
		onOpenChange(next);
	}

	const canSubmit = !!effectiveTrainerId && !!date;

	const title = kind === "blocked" ? "Block Time" : "Add Exception Day";
	const description =
		kind === "blocked"
			? "Mark a specific date as blocked for a trainer (e.g. venue closure, reserved time)."
			: "Mark a specific date as time-off for a trainer. Their normal schedule will be suspended on this date.";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				hideCloseButton
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				{/* Header */}
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						TRAINER AVAILABILITY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{title}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{description}
					</DialogDescription>
				</DialogHeader>

				{/* Body */}
				<div className="flex flex-col gap-4 px-6 pt-4 pb-2">
					{/* Trainer selector — only when not pre-selected */}
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

					{/* Pre-selected trainer chip */}
					{preselectedTrainerId && preselectedTrainerName && (
						<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								Trainer
							</p>
							<span className="text-sm font-medium text-[#0a0a0a]">
								{preselectedTrainerName}
							</span>
						</div>
					)}

					{/* Kind — pill toggle */}
					<div className="flex flex-col gap-1.5">
						<Label>Kind</Label>
						<div className="flex gap-2">
							{(["timeoff", "blocked"] as const).map((k) => (
								<button
									key={k}
									type="button"
									disabled={mutation.isPending}
									onClick={() => setKind(k)}
									className={
										kind === k
											? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold transition"
											: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium transition"
									}
								>
									{k === "timeoff" ? "Time Off" : "Blocked"}
								</button>
							))}
						</div>
					</div>

					{/* Date */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="exception-date">
							Exception Date <span className="text-rose-600">*</span>
						</Label>
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
							<span className="text-xs font-normal text-[#737373]">
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

					<div className="pb-2" />
				</div>

				{/* Footer */}
				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
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
