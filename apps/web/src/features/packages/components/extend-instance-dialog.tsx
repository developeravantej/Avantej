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
			<DialogContent className="sm:max-w-md" data-testid="extend-instance-dialog">
				<DialogHeader>
					<DialogTitle>Extend Expiry</DialogTitle>
					{instanceLabel && (
						<DialogDescription>Extending "{instanceLabel}".</DialogDescription>
					)}
				</DialogHeader>

				<div className="space-y-4 py-2">
					{/* Current expiry */}
					<div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
						<CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
						<div className="text-sm">
							<span className="text-muted-foreground">Current expiry: </span>
							<span className="font-medium">{currentExpiresLabel}</span>
						</div>
					</div>

					{/* Add days */}
					<div className="space-y-1.5">
						<Label htmlFor="extend-days">
							Add days <span className="text-destructive">*</span>
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
							<p className="text-xs text-destructive">Enter a number between 1 and 365.</p>
						)}
						{isValidDays && newExpiresAt && (
							<p className="text-xs text-muted-foreground">
								New expiry:{" "}
								<span className="font-medium text-foreground">
									{new Date(newExpiresAt).toLocaleDateString("en-MY")}
								</span>
							</p>
						)}
					</div>

					{/* Reason */}
					<div className="space-y-1.5">
						<Label htmlFor="extend-reason">
							Reason{" "}
							<span className="text-muted-foreground text-xs">(recommended)</span>
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

				<DialogFooter>
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
