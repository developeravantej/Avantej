import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClaimDialogMode = "claim" | "unclaim";

export interface CoachIntakeClaimDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: ClaimDialogMode;
	organizationId: string;
	trainerId: string;
	trainerName: string;
	date: string; // YYYY-MM-DD
	startTime: string; // HH:MM
	endTime: string; // HH:MM
	exceptionId?: string; // required for unclaim mode
	existingReason?: string;
	onSuccess?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
	if (!dateStr) return "";
	const [year, month, day] = dateStr.split("-");
	if (!year || !month || !day) return dateStr;
	const d = new Date(Number(year), Number(month) - 1, Number(day));
	return d.toLocaleDateString(undefined, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CoachIntakeClaimDialog({
	open,
	onOpenChange,
	mode,
	organizationId,
	trainerId,
	trainerName,
	date,
	startTime,
	endTime,
	exceptionId,
	existingReason,
	onSuccess,
}: CoachIntakeClaimDialogProps) {
	const [reason, setReason] = useState("");

	const claimMutation = useApiMutation({
		mutationFn: () =>
			client.coachIntake.claimSlot({
				organizationId,
				trainerId,
				date,
				startTime,
				endTime,
				reason: reason.trim() || undefined,
			}),
		successMessage: "Intake slot claimed successfully.",
		errorMessage: (err) => err.message || "Failed to claim slot.",
		onSuccess: () => {
			setReason("");
			onSuccess?.();
		},
	});

	const unclaimMutation = useApiMutation({
		mutationFn: () => {
			if (!exceptionId) throw new Error("No exception ID provided for unclaim");
			return client.coachIntake.unclaimSlot({
				organizationId,
				exceptionId,
			});
		},
		successMessage: "Intake slot re-opened successfully.",
		errorMessage: (err) => err.message || "Failed to unclaim slot.",
		onSuccess: () => {
			onSuccess?.();
		},
	});

	const isPending = claimMutation.isPending || unclaimMutation.isPending;

	function handleConfirm() {
		if (mode === "claim") {
			claimMutation.mutate();
		} else {
			unclaimMutation.mutate();
		}
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			setReason("");
		}
		onOpenChange(nextOpen);
	}

	const isClaim = mode === "claim";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{isClaim ? "Mark Slot as Claimed" : "Re-open Intake Slot"}
					</DialogTitle>
					<DialogDescription>
						{isClaim
							? "This intake window will be marked as unavailable for this date."
							: "This intake window will be re-opened for scheduling."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3 py-1">
					{/* Details */}
					<div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm space-y-1">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Trainer</span>
							<span className="font-medium">{trainerName}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Date</span>
							<span className="font-medium">{formatDate(date)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Time</span>
							<span className="font-medium tabular-nums">
								{startTime} – {endTime}
							</span>
						</div>
						{!isClaim && existingReason ? (
							<div className="flex justify-between">
								<span className="text-muted-foreground">Reason</span>
								<span className="font-medium text-right max-w-[60%]">{existingReason}</span>
							</div>
						) : null}
					</div>

					{/* Reason input — only for claim mode */}
					{isClaim ? (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="claim-reason">
								Reason{" "}
								<span className="text-xs font-normal text-muted-foreground">
									(optional)
								</span>
							</Label>
							<Textarea
								id="claim-reason"
								value={reason}
								onChange={(e) => setReason(e.target.value)}
								placeholder="e.g. Holiday, personal appointment, etc."
								rows={2}
								disabled={isPending}
							/>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleConfirm}
						disabled={isPending}
						variant={isClaim ? "default" : "outline"}
						className={isClaim ? "bg-black text-white hover:bg-black/90" : ""}
					>
						{isPending
							? isClaim
								? "Claiming..."
								: "Re-opening..."
							: isClaim
								? "Confirm Claim"
								: "Re-open Slot"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
