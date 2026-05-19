import type { UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { InstallmentOverviewItem } from "../types";

interface AdjustCreditsDialogProps {
	open: boolean;
	selectedInstance: InstallmentOverviewItem | null;
	adjustUnlocked: string;
	setAdjustUnlocked: (v: string) => void;
	adjustUsed: string;
	setAdjustUsed: (v: string) => void;
	adjustReason: string;
	setAdjustReason: (v: string) => void;
	onClose: () => void;
	adjustCreditsMutation: UseMutationResult<
		unknown,
		Error,
		{
			packageInstanceId: string;
			creditsUnlocked?: number;
			creditsUsed?: number;
			reason: string;
		}
	>;
	resetOverrideMutation: UseMutationResult<
		unknown,
		Error,
		{
			packageInstanceId: string;
			reason: string;
		}
	>;
}

export function AdjustCreditsDialog({
	open,
	selectedInstance,
	adjustUnlocked,
	setAdjustUnlocked,
	adjustUsed,
	setAdjustUsed,
	adjustReason,
	setAdjustReason,
	onClose,
	adjustCreditsMutation,
	resetOverrideMutation,
}: AdjustCreditsDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Adjust Credits</DialogTitle>
					<DialogDescription>
						Override the credits for this package. Future installment payments will only increase
						unlocked credits, never decrease them past this value. If a credits override is active,
						use "Reset to formula" to restore automatic calculation.
					</DialogDescription>
				</DialogHeader>

				{selectedInstance && (() => {
					const total = selectedInstance.creditsTotal ?? 0;
					const unlocked = adjustUnlocked === "" ? (selectedInstance.creditsUnlocked ?? total) : (Number.parseInt(adjustUnlocked, 10) || 0);
					const used = adjustUsed === "" ? (selectedInstance.creditsUsed ?? 0) : (Number.parseInt(adjustUsed, 10) || 0);
					const available = unlocked - used;
					const isValid = unlocked <= total && used <= unlocked && available >= 0;

					return (
						<div className="flex flex-col gap-4 py-2">
							<div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
								<span className="text-muted-foreground">Total credits: </span>
								<span className="font-semibold">{total}</span>
								{selectedInstance.creditsAdminOverride && (
									<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
										Admin override active
									</span>
								)}
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="adjust-unlocked">Credits Unlocked</Label>
								<Input
									id="adjust-unlocked"
									type="number"
									min="0"
									max={total}
									step="1"
									value={adjustUnlocked}
									onChange={(e) => setAdjustUnlocked(e.target.value)}
									placeholder={String(selectedInstance.creditsUnlocked ?? total)}
								/>
								<p className="text-xs text-muted-foreground">Max: {total}</p>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="adjust-used">Credits Used</Label>
								<Input
									id="adjust-used"
									type="number"
									min="0"
									max={unlocked}
									step="1"
									value={adjustUsed}
									onChange={(e) => setAdjustUsed(e.target.value)}
									placeholder={String(selectedInstance.creditsUsed ?? 0)}
								/>
								<p className="text-xs text-muted-foreground">Max: {unlocked} (cannot exceed unlocked)</p>
							</div>

							<div className="rounded-md border px-3 py-2 text-sm">
								<span className="text-muted-foreground">Credits available (preview): </span>
								<span className={`font-semibold ${available < 0 ? "text-destructive" : ""}`}>
									{available}
								</span>
							</div>

							{!isValid && (
								<p className="text-xs text-destructive">
									{unlocked > total
										? `Unlocked (${unlocked}) cannot exceed total (${total}).`
										: used > unlocked
										? `Used (${used}) cannot exceed unlocked (${unlocked}).`
										: "Invalid values."}
								</p>
							)}

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="adjust-reason">
									Reason <span className="text-destructive">*</span>
								</Label>
								<Textarea
									id="adjust-reason"
									placeholder="Provide a reason for this adjustment…"
									rows={2}
									value={adjustReason}
									onChange={(e) => setAdjustReason(e.target.value)}
								/>
							</div>
						</div>
					);
				})()}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={onClose}
						disabled={adjustCreditsMutation.isPending || resetOverrideMutation.isPending}
					>
						Cancel
					</Button>
					{selectedInstance?.creditsAdminOverride && (
						<Button
							variant="outline"
							onClick={() => {
								if (
									window.confirm(
										"This will recompute credits from installment history. The current override will be discarded. Continue?",
									)
								) {
									resetOverrideMutation.mutate({
										packageInstanceId: selectedInstance.id,
										reason: "Admin reset credits override",
									});
									onClose();
								}
							}}
							disabled={resetOverrideMutation.isPending}
						>
							{resetOverrideMutation.isPending ? "Resetting…" : "Reset to formula"}
						</Button>
					)}
					<Button
						onClick={() => {
							if (!selectedInstance || !adjustReason.trim()) {
								toast.error("A reason is required.");
								return;
							}
							const total = selectedInstance.creditsTotal ?? 0;
							const newUnlocked = adjustUnlocked !== "" ? Number.parseInt(adjustUnlocked, 10) : undefined;
							const newUsed = adjustUsed !== "" ? Number.parseInt(adjustUsed, 10) : undefined;
							const resolvedUnlocked = newUnlocked ?? (selectedInstance.creditsUnlocked ?? total);
							const resolvedUsed = newUsed ?? (selectedInstance.creditsUsed ?? 0);
							if (resolvedUnlocked > total) {
								toast.error(`Unlocked credits cannot exceed total (${total}).`);
								return;
							}
							if (resolvedUsed > resolvedUnlocked) {
								toast.error(`Used credits cannot exceed unlocked (${resolvedUnlocked}).`);
								return;
							}
							adjustCreditsMutation.mutate({
								packageInstanceId: selectedInstance.id,
								creditsUnlocked: newUnlocked,
								creditsUsed: newUsed,
								reason: adjustReason.trim(),
							});
						}}
						disabled={adjustCreditsMutation.isPending}
					>
						{adjustCreditsMutation.isPending ? "Saving…" : "Save Changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
