/**
 * ChangeTierDialog — assign a trainer tier via trainerTiers.assignToMember
 * AssignBranchDialog — reassign branch via members.updateScope
 *
 * Both are triggered from the trainer detail panel in trainers-list-page.tsx.
 */
import { useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// ─── ChangeTierDialog ─────────────────────────────────────────────────────────

export interface ChangeTierDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	/** memberId of the trainer */
	memberId: string;
	trainerName: string;
	currentTierId: string | null | undefined;
	onSuccess?: () => void;
}

export function ChangeTierDialog({
	open,
	onOpenChange,
	organizationId,
	memberId,
	trainerName,
	currentTierId,
	onSuccess,
}: ChangeTierDialogProps) {
	const qc = useQueryClient();
	const NO_TIER = "__none__";
	const [selectedTierId, setSelectedTierId] = useState<string>(NO_TIER);

	// Fetch active tiers
	const { data: tiers = [], isLoading: tiersLoading } = useQuery({
		queryKey: ["trainerTiers", organizationId],
		queryFn: () =>
			client.trainerTiers.list({ organizationId, includeInactive: false }),
		enabled: !!organizationId && open,
		staleTime: 60_000,
	});

	// Sync selectedTierId when dialog opens
	const handleOpenChange = (next: boolean) => {
		if (next) setSelectedTierId(currentTierId ?? NO_TIER);
		else setSelectedTierId(NO_TIER);
		onOpenChange(next);
	};

	const mutation = useApiMutation({
		mutationFn: () =>
			client.trainerTiers.assignToMember({
				organizationId,
				memberId,
				tierId: selectedTierId === NO_TIER ? null : selectedTierId,
			}),
		successMessage: "Tier assigned successfully.",
		errorMessage: (err) =>
			err instanceof Error ? err.message : "Failed to assign tier.",
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["trainers", organizationId] });
			onSuccess?.();
			onOpenChange(false);
		},
	});

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Change Tier</DialogTitle>
					<DialogDescription>
						Assign a seniority tier to{" "}
						<span className="font-medium">{trainerName}</span>.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3 py-1">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="tier-select">Tier</Label>
						{tiersLoading ? (
							<p className="text-sm text-muted-foreground">Loading tiers…</p>
						) : (
							<Select
								value={selectedTierId}
								onValueChange={setSelectedTierId}
								disabled={mutation.isPending}
							>
								<SelectTrigger id="tier-select">
									<SelectValue placeholder="No tier" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NO_TIER}>No tier</SelectItem>
									{tiers.map((tier) => (
										<SelectItem key={tier.id} value={tier.id}>
											{tier.name}
											{tier.rank !== undefined
												? ` (rank ${tier.rank})`
												: ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>
				</div>

				<DialogFooter>
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
						disabled={mutation.isPending || tiersLoading}
					>
						{mutation.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── AssignBranchDialog ───────────────────────────────────────────────────────

export interface AssignBranchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	/** memberId of the trainer */
	memberId: string;
	trainerName: string;
	currentBranchId: string;
	onSuccess?: () => void;
}

export function AssignBranchDialog({
	open,
	onOpenChange,
	organizationId,
	memberId,
	trainerName,
	currentBranchId,
	onSuccess,
}: AssignBranchDialogProps) {
	const qc = useQueryClient();
	const [selectedNodeId, setSelectedNodeId] = useState(currentBranchId);

	// Sync selection when dialog opens
	const handleOpenChange = (next: boolean) => {
		if (next) setSelectedNodeId(currentBranchId);
		onOpenChange(next);
	};

	// Fetch hierarchy nodes
	const { data: nodesResponse, isLoading: nodesLoading } = useQuery({
		queryKey: ["hierarchyNodes", organizationId],
		queryFn: () => client.hierarchy.listNodes({ organizationId }),
		enabled: !!organizationId && open,
		staleTime: 60_000,
	});

	const nodes = Array.isArray(nodesResponse)
		? nodesResponse
		: (nodesResponse as { nodes?: { id: string; name: string; depth?: number }[] } | undefined)?.nodes ?? [];

	const mutation = useApiMutation({
		mutationFn: () =>
			client.members.updateScope({
				organizationId,
				memberId,
				newHierarchyScopeId: selectedNodeId,
			}),
		successMessage: "Branch updated successfully.",
		errorMessage: (err) =>
			err instanceof Error ? err.message : "Failed to update branch.",
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["trainers", organizationId] });
			onSuccess?.();
			onOpenChange(false);
		},
	});

	const canSave =
		!!selectedNodeId && selectedNodeId !== currentBranchId && !mutation.isPending;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Assign Branch</DialogTitle>
					<DialogDescription>
						Move{" "}
						<span className="font-medium">{trainerName}</span> to a different
						branch.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3 py-1">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="branch-select">Branch</Label>
						{nodesLoading ? (
							<p className="text-sm text-muted-foreground">
								Loading branches…
							</p>
						) : (
							<Select
								value={selectedNodeId}
								onValueChange={setSelectedNodeId}
								disabled={mutation.isPending}
							>
								<SelectTrigger id="branch-select">
									<SelectValue placeholder="Select a branch…" />
								</SelectTrigger>
								<SelectContent>
									{nodes.length === 0 ? (
										<SelectItem value="__empty__">No nodes available</SelectItem>
									) : (
										nodes.map((node) => (
											<SelectItem key={node.id} value={node.id}>
												{"  ".repeat(node.depth ?? 0)}
												{node.name}
											</SelectItem>
										))
									)}
								</SelectContent>
							</Select>
						)}
					</div>
				</div>

				<DialogFooter>
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
						disabled={!canSave || nodesLoading}
					>
						{mutation.isPending ? "Saving…" : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
