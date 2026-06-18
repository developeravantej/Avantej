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

export type CreateTierForm = {
	name: string;
	rank: number;
	description: string;
};

export const EMPTY_TIER_FORM: CreateTierForm = {
	name: "",
	rank: 0,
	description: "",
};

// ── Create ────────────────────────────────────────────────────────────────────

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
			<DialogContent
				hideCloseButton
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						TRAINER DIRECTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						New Tier
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Create a new seniority tier for commission calculation.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit}>
					<div className="px-6 pt-4 pb-2 overflow-y-auto flex flex-col gap-4">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tier-name">
								Name <span className="text-rose-600">*</span>
							</Label>
							<Input
								id="tier-name"
								placeholder="e.g. Senior Trainer"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
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
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isPending}
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						>
							{isPending ? "Creating…" : "Create Tier"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// ── Delete ────────────────────────────────────────────────────────────────────

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
			<DialogContent
				hideCloseButton
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						TRAINER DIRECTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Delete Tier
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Permanently delete{" "}
						<span className="font-semibold text-[#0a0a0a]">
							{targetName ?? "this tier"}
						</span>
						? Any trainers assigned to it will be unassigned. This cannot be
						undone.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						onClick={onConfirm}
						disabled={isPending}
						className="bg-red-600 hover:bg-red-700 text-white"
					>
						{isPending ? "Deleting…" : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ── Deactivate ────────────────────────────────────────────────────────────────

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
			<DialogContent
				hideCloseButton
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						TRAINER DIRECTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Deactivate Tier
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Are you sure you want to deactivate{" "}
						<span className="font-semibold text-[#0a0a0a]">
							{targetName ?? "this tier"}
						</span>
						? Trainers assigned to it will have their commission skipped until
						the tier is reactivated.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button variant="outline" onClick={onCancel} disabled={isPending}>
						Cancel
					</Button>
					<Button
						onClick={onConfirm}
						disabled={isPending}
						className="bg-red-600 hover:bg-red-700 text-white"
					>
						{isPending ? "Deactivating…" : "Deactivate"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
