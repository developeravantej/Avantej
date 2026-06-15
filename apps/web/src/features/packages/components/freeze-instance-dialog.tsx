import { Info } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFreezePackageInstance } from "@/features/packages/api";

interface FreezeInstanceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	instanceId: string;
	organizationId: string;
	instanceLabel?: string;
}

export function FreezeInstanceDialog({
	open,
	onOpenChange,
	instanceId,
	organizationId,
	instanceLabel,
}: FreezeInstanceDialogProps) {
	const [until, setUntil] = useState("");
	const [reason, setReason] = useState("");
	const freezeMutation = useFreezePackageInstance(organizationId);

	// Minimum allowed date is tomorrow
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const minDate = tomorrow.toISOString().slice(0, 10);

	function handleConfirm() {
		freezeMutation.mutate(
			{
				organizationId,
				id: instanceId,
				until: until || undefined,
				reason: reason.trim() || undefined,
			},
			{
				onSuccess: () => {
					setUntil("");
					setReason("");
					onOpenChange(false);
				},
			},
		);
	}

	function handleOpenChange(v: boolean) {
		if (!v) {
			setUntil("");
			setReason("");
		}
		onOpenChange(v);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
				data-testid="freeze-instance-dialog"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PACKAGE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Freeze Package?
					</DialogTitle>
					{instanceLabel && (
						<DialogDescription className="text-sm text-[#737373]">
							Freezing "{instanceLabel}".
						</DialogDescription>
					)}
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4 py-2">
						{/* Note */}
						<div className="flex gap-3 rounded-lg border border-[#e5e5e5] bg-[#f3f3f3]/50 p-3">
							<Info className="mt-0.5 h-4 w-4 shrink-0 text-[#737373]" />
							<p className="text-sm text-[#737373]">
								Customer cannot book sessions while frozen.
							</p>
						</div>

						{/* Frozen until */}
						<div className="space-y-1.5">
							<Label htmlFor="freeze-until">
								Frozen until{" "}
								<span className="text-[#737373] text-xs">
									(leave blank for indefinite)
								</span>
							</Label>
							<Input
								id="freeze-until"
								type="date"
								min={minDate}
								value={until}
								onChange={(e) => setUntil(e.target.value)}
								data-testid="freeze-until-input"
							/>
						</div>

						{/* Reason */}
						<div className="space-y-1.5">
							<Label htmlFor="freeze-reason">Reason</Label>
							<Textarea
								id="freeze-reason"
								placeholder="Optional — describe why this package is being frozen…"
								rows={2}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() => handleOpenChange(false)}
						disabled={freezeMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleConfirm}
						disabled={freezeMutation.isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						data-testid="freeze-instance-confirm-button"
					>
						{freezeMutation.isPending ? "Freezing…" : "Freeze Package"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
