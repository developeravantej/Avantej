import type { Dispatch, SetStateAction } from "react";
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

export type CreateTierForm = { name: string; rank: number; description: string };

export const EMPTY_TIER_FORM: CreateTierForm = { name: "", rank: 0, description: "" };

type CreateProps = {
	open: boolean;
	form: CreateTierForm;
	setForm: Dispatch<SetStateAction<CreateTierForm>>;
	onClose: () => void;
	onSubmit: (e: React.FormEvent) => void;
	isPending: boolean;
};

export function CreateTierDialog({
	open,
	form,
	setForm,
	onClose,
	onSubmit,
	isPending,
}: CreateProps) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Tier</DialogTitle>
					<DialogDescription>
						Create a new seniority tier for commission calculation.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tier-name">
							Name <span className="text-destructive">*</span>
						</Label>
						<Input
							id="tier-name"
							placeholder="e.g. Senior Trainer"
							value={form.name}
							onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
							autoComplete="off"
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tier-rank">Rank</Label>
						<Input
							id="tier-rank"
							type="number"
							min={0}
							value={form.rank}
							onChange={(e) =>
								setForm((f) => ({
									...f,
									rank: parseInt(e.target.value, 10) || 0,
								}))
							}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tier-description">Description</Label>
						<Textarea
							id="tier-description"
							placeholder="Optional description..."
							rows={3}
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
						/>
					</div>
					<DialogFooter className="pt-2">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Creating..." : "Create Tier"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

type DeleteProps = {
	targetName: string | null;
	open: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
};

export function DeleteTierDialog({
	targetName,
	open,
	onCancel,
	onConfirm,
	isPending,
}: DeleteProps) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Delete Tier</DialogTitle>
					<DialogDescription>
						Permanently delete{" "}
						<span className="font-semibold text-foreground">
							{targetName ?? "this tier"}
						</span>
						? Any trainers assigned to it will be unassigned. This cannot be
						undone.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="pt-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? "Deleting..." : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type DeactivateProps = {
	targetName: string | null;
	open: boolean;
	onCancel: () => void;
	onConfirm: () => void;
	isPending: boolean;
};

export function DeactivateTierDialog({
	targetName,
	open,
	onCancel,
	onConfirm,
	isPending,
}: DeactivateProps) {
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Deactivate Tier</DialogTitle>
					<DialogDescription>
						Are you sure you want to deactivate{" "}
						<span className="font-semibold text-foreground">
							{targetName ?? "this tier"}
						</span>
						? Trainers assigned to it will have their commission skipped until the
						tier is reactivated.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter className="pt-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? "Deactivating..." : "Deactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
