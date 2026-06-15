import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client, orpc, queryClient } from "@/utils/orpc";
import { anchorDayHint, isAnchorValid } from "./helpers";
import type { BranchNode, CycleType, Policy } from "./types";

export function PolicyEditorDialog({
	organizationId,
	initial,
	branches,
	existingBranchIds,
	tenantWideExists,
	onClose,
}: {
	organizationId: string;
	initial: Policy | null;
	branches: BranchNode[];
	existingBranchIds: Set<string>;
	tenantWideExists: boolean;
	onClose: () => void;
}) {
	const isNew = initial === null;
	const [branchId, setBranchId] = useState<string | null>(
		initial?.branchId ?? null,
	);
	const [cycleType, setCycleType] = useState<CycleType>(
		initial?.cycleType ?? "calendar_month",
	);
	const [anchorDayRaw, setAnchorDayRaw] = useState<string>(
		initial?.anchorDay !== null && initial?.anchorDay !== undefined
			? String(initial.anchorDay)
			: "",
	);

	const anchorValid = isAnchorValid(cycleType, anchorDayRaw);
	const branchPickerLocked = !isNew; // editing → can't change scope target

	const mutation = useMutation({
		mutationFn: () =>
			client.commissionCycle.upsert({
				organizationId,
				branchId,
				cycleType,
				anchorDay:
					cycleType === "calendar_month"
						? null
						: Number.parseInt(anchorDayRaw, 10),
			}),
		onSuccess: () => {
			toast.success(isNew ? "Cycle policy created." : "Cycle policy updated.");
			queryClient.invalidateQueries(
				orpc.commissionCycle.list.queryOptions({ input: { organizationId } }),
			);
			onClose();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to save cycle policy."),
	});

	// Branches without an existing override (so the operator can't try to create
	// a duplicate they'll just get a no-op upsert back from).
	const availableBranches = useMemo(
		() =>
			branches.filter(
				(b) => initial?.branchId === b.id || !existingBranchIds.has(b.id),
			),
		[branches, existingBranchIds, initial?.branchId],
	);

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						COMMISSION CYCLES
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{isNew ? "Add cycle policy" : "Edit cycle policy"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Choose the scope (tenant-wide or a specific branch), then pick a
						cycle type. Cap-window math is run server-side per the DB CHECK
						constraint.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="space-y-3 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="scope-select">Scope</Label>
							<Select
								value={branchId === null ? "__tenant__" : branchId}
								onValueChange={(v) =>
									setBranchId(v === "__tenant__" ? null : v)
								}
								disabled={branchPickerLocked || mutation.isPending}
							>
								<SelectTrigger id="scope-select" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem
										value="__tenant__"
										disabled={tenantWideExists && initial?.branchId !== null}
									>
										Tenant default (all branches)
									</SelectItem>
									{availableBranches.map((b) => (
										<SelectItem key={b.id} value={b.id}>
											{b.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{branchPickerLocked ? (
								<p className="text-[11px] text-[#737373]">
									Scope can't be changed for an existing policy. Delete and
									re-create to move to a different branch.
								</p>
							) : null}
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="cycle-type">Cycle type</Label>
							<Select
								value={cycleType}
								onValueChange={(v) => {
									setCycleType(v as CycleType);
									// Reset anchor on type change — different ranges per type.
									setAnchorDayRaw(v === "calendar_month" ? "" : "");
								}}
								disabled={mutation.isPending}
							>
								<SelectTrigger id="cycle-type" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="calendar_month">
										Calendar month (UTC 1st → 1st)
									</SelectItem>
									<SelectItem value="monthly_anchored">
										Monthly anchored (e.g. 22nd → 22nd)
									</SelectItem>
									<SelectItem value="semi_monthly">
										Semi-monthly (two halves per month)
									</SelectItem>
									<SelectItem value="weekly">
										Weekly (anchored to a weekday)
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="anchor-day">Anchor day</Label>
							<Input
								id="anchor-day"
								type="number"
								value={anchorDayRaw}
								onChange={(e) => setAnchorDayRaw(e.target.value)}
								placeholder={
									cycleType === "calendar_month" ? "(leave empty)" : "1"
								}
								disabled={cycleType === "calendar_month" || mutation.isPending}
							/>
							<p className="text-[11px] text-[#737373]">
								{anchorDayHint(cycleType)}
							</p>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={onClose}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={() => mutation.mutate()}
						disabled={!anchorValid || mutation.isPending}
					>
						{mutation.isPending
							? "Saving…"
							: isNew
								? "Create policy"
								: "Save changes"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
