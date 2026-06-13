import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

// Trainer-facing dialog to dispute (contest) one of their own commission splits.
// Only pending|approved splits are contestable — the parent gates the trigger.

const CATEGORY_OPTIONS = [
	{ value: "wrong_amount", label: "Amount is wrong" },
	{ value: "wrong_staff", label: "Wrong staff member" },
	{ value: "should_not_earn", label: "Should not have earned" },
	{ value: "missing_split", label: "A split is missing" },
	{ value: "other", label: "Other" },
] as const;

export interface DisputeTarget {
	id: string;
	amountCents: number;
}

export interface DisputeDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	target: DisputeTarget | null;
}

export function DisputeDialog({
	open,
	onOpenChange,
	organizationId,
	target,
}: DisputeDialogProps) {
	const [category, setCategory] = useState<string>("wrong_amount");
	const [reason, setReason] = useState("");

	function reset() {
		setCategory("wrong_amount");
		setReason("");
	}

	const dispute = useApiMutation({
		mutationFn: () =>
			client.commissionSplits.contest({
				organizationId,
				splitId: target!.id,
				category: category as
					| "wrong_amount"
					| "wrong_staff"
					| "should_not_earn"
					| "missing_split"
					| "other",
				reason: reason.trim(),
			}),
		successMessage: "Dispute submitted — a manager will review it.",
		errorMessage: (err) => err.message || "Failed to submit dispute.",
		invalidate: [
			orpc.commissionSplits.getMyCommissions.key(),
			orpc.commissionSplits.listContested.key(),
			orpc.commissionSplits.liabilitySummary.key(),
			orpc.commissionSplits.listLedger.key(),
		],
		onSuccess: () => {
			onOpenChange(false);
			reset();
		},
	});

	function handleOpenChange(next: boolean) {
		if (!next) reset();
		onOpenChange(next);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						DISPUTE COMMISSION
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Dispute this commission
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Flag this split for a manager to review. It will be held out of
						payouts until the dispute is resolved.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 space-y-4">
					{target && (
						<div className="rounded-lg border border-[#e5e5e5] bg-[#f7f7f7] px-4 py-3 text-sm flex items-center justify-between">
							<span className="text-[#737373]">Commission amount</span>
							<span className="font-mono font-semibold tabular-nums text-[#0a0a0a]">
								{formatPrice(target.amountCents, "MYR")}
							</span>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="dispute-category">
							Reason <span className="text-rose-600">*</span>
						</Label>
						<Select value={category} onValueChange={setCategory}>
							<SelectTrigger id="dispute-category">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CATEGORY_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="dispute-reason">
							Details <span className="text-rose-600">*</span>
						</Label>
						<Textarea
							id="dispute-reason"
							rows={3}
							placeholder="Explain what looks wrong with this commission…"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={dispute.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						className="bg-[#b45309] text-white hover:bg-[#92400e]"
						disabled={dispute.isPending || !reason.trim() || !target}
						onClick={() => dispute.mutate(undefined)}
					>
						{dispute.isPending ? "Submitting…" : "Submit Dispute"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
