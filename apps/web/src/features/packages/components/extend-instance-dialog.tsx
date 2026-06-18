import { CalendarDays } from "lucide-react";
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
import { useExtendPackageInstance } from "@/features/packages/api";

interface ExtendInstanceDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	instanceId: string;
	organizationId: string;
	instanceLabel?: string;
	currentExpiresAt?: string | null;
}

export function ExtendInstanceDialog({
	open,
	onOpenChange,
	instanceId,
	organizationId,
	instanceLabel,
	currentExpiresAt,
}: ExtendInstanceDialogProps) {
	const [addDays, setAddDays] = useState("");
	const [reason, setReason] = useState("");
	const extendMutation = useExtendPackageInstance(organizationId);

	const parsedDays = parseInt(addDays, 10);
	const isValidDays =
		Number.isFinite(parsedDays) && parsedDays >= 1 && parsedDays <= 365;

	// Compute the new expiry date for display
	const newExpiresAt = (() => {
		if (!isValidDays) return null;
		const base = currentExpiresAt ? new Date(currentExpiresAt) : new Date();
		if (Number.isNaN(base.getTime())) return null;
		const next = new Date(base);
		next.setDate(next.getDate() + parsedDays);
		return next.toISOString().slice(0, 10);
	})();

	const currentExpiresLabel = (() => {
		if (!currentExpiresAt) return "No expiry set";
		try {
			return new Date(currentExpiresAt).toLocaleDateString("en-MY");
		} catch {
			return currentExpiresAt;
		}
	})();

	function handleConfirm() {
		if (!isValidDays) return;
		extendMutation.mutate(
			{
				organizationId,
				id: instanceId,
				addDays: parsedDays,
				reason: reason.trim() || undefined,
			},
			{
				onSuccess: () => {
					setAddDays("");
					setReason("");
					onOpenChange(false);
				},
			},
		);
	}

	function handleOpenChange(v: boolean) {
		if (!v) {
			setAddDays("");
			setReason("");
		}
		onOpenChange(v);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
				data-testid="extend-instance-dialog"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PACKAGE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Extend Expiry
					</DialogTitle>
					{instanceLabel && (
						<DialogDescription className="text-sm text-[#737373]">
							Extending "{instanceLabel}".
						</DialogDescription>
					)}
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-4 py-2">
						{/* Current expiry */}
						<div className="flex items-center gap-3 rounded-lg border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
							<CalendarDays className="h-4 w-4 shrink-0 text-[#737373]" />
							<div className="text-sm">
								<span className="text-[#737373]">Current expiry: </span>
								<span className="font-medium">{currentExpiresLabel}</span>
							</div>
						</div>

						{/* Add days */}
						<div className="space-y-1.5">
							<Label htmlFor="extend-days">
								Add days <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="extend-days"
								type="number"
								min={1}
								max={365}
								step={1}
								placeholder="e.g. 30"
								value={addDays}
								onChange={(e) => setAddDays(e.target.value)}
								data-testid="extend-days-input"
							/>
							{addDays && !isValidDays && (
								<p className="text-xs text-rose-600">
									Enter a number between 1 and 365.
								</p>
							)}
							{isValidDays && newExpiresAt && (
								<p className="text-xs text-[#737373]">
									New expiry:{" "}
									<span className="font-medium text-[#0a0a0a]">
										{new Date(newExpiresAt).toLocaleDateString("en-MY")}
									</span>
								</p>
							)}
						</div>

						{/* Reason */}
						<div className="space-y-1.5">
							<Label htmlFor="extend-reason">
								Reason{" "}
								<span className="text-[#737373] text-xs">(recommended)</span>
							</Label>
							<Textarea
								id="extend-reason"
								placeholder="e.g. Customer was hospitalized — extending grace period…"
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
						disabled={extendMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={handleConfirm}
						disabled={!isValidDays || extendMutation.isPending}
						data-testid="extend-instance-confirm-button"
					>
						{extendMutation.isPending ? "Extending…" : "Extend Expiry"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
