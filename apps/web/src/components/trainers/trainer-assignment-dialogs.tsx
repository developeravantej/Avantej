/**
 * ChangeTierDialog — assign a trainer tier via trainerTiers.assignToMember
 * AssignBranchDialog — reassign branch via members.updateScope (multi-select)
 *
 * Both are triggered from the trainer detail panel in trainers-list-page.tsx.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
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
import { Check, Search, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

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
		...orpc.trainerTiers.list.queryOptions({
			input: { organizationId, includeInactive: false },
		}),
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
			qc.invalidateQueries({ queryKey: orpc.members.list.key() });
			onSuccess?.();
			onOpenChange(false);
		},
	});

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						TRAINER DIRECTORY
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Change Tier
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Assign a seniority tier to{" "}
						<span className="font-medium">{trainerName}</span>.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-3 py-1">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="tier-select">Tier</Label>
							{tiersLoading ? (
								<p className="text-sm text-[#737373]">Loading tiers…</p>
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
												{tier.rank !== undefined ? ` (rank ${tier.rank})` : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
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
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
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
	const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
		new Set(currentBranchId ? [currentBranchId] : []),
	);
	const [searchQuery, setSearchQuery] = useState("");

	// Sync selection when dialog opens / resets on close
	const handleOpenChange = (next: boolean) => {
		if (next) {
			setSelectedNodeIds(new Set(currentBranchId ? [currentBranchId] : []));
			setSearchQuery("");
		}
		onOpenChange(next);
	};

	// Fetch hierarchy nodes
	const { data: nodesResponse, isLoading: nodesLoading } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId && open,
		staleTime: 60_000,
	});

	const nodes = Array.isArray(nodesResponse)
		? nodesResponse
		: ((
				nodesResponse as
					| { nodes?: { id: string; name: string; depth?: number }[] }
					| undefined
			)?.nodes ?? []);

	const filteredNodes = searchQuery.trim()
		? nodes.filter((n) =>
				n.name.toLowerCase().includes(searchQuery.toLowerCase()),
			)
		: nodes;

	const toggleNode = (nodeId: string) => {
		setSelectedNodeIds((prev) => {
			const next = new Set(prev);
			if (next.has(nodeId)) {
				next.delete(nodeId);
			} else {
				next.add(nodeId);
			}
			return next;
		});
	};

	// Call updateScope once per selected branch sequentially.
	// Each call replaces hierarchyScopeId — the last one becomes the active scope.
	const mutation = useApiMutation({
		mutationFn: async () => {
			for (const nodeId of selectedNodeIds) {
				await client.members.updateScope({
					organizationId,
					memberId,
					newHierarchyScopeId: nodeId,
				});
			}
		},
		successMessage:
			selectedNodeIds.size > 1
				? `Assigned ${selectedNodeIds.size} branches successfully.`
				: "Branch assigned successfully.",
		errorMessage: (err) =>
			err instanceof Error ? err.message : "Failed to assign branch.",
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: orpc.members.list.key() });
			onSuccess?.();
			onOpenChange(false);
		},
	});

	// Dirty check — something must be selected and differ from the current single assignment
	const hasChanges =
		selectedNodeIds.size > 0 &&
		!(selectedNodeIds.size === 1 && selectedNodeIds.has(currentBranchId));
	const canSave = hasChanges && !mutation.isPending;

	const selectedCount = selectedNodeIds.size;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						BRANCH MANAGEMENT
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Assign Branch
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Select one or more branches for{" "}
						<span className="font-medium text-[#0a0a0a]">{trainerName}</span>.
					</DialogDescription>
				</DialogHeader>

				{/* Search bar */}
				<div className="px-6 pt-4 pb-2 border-b border-[#e5e5e5]">
					<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#fafafa] px-3 py-2">
						<Search className="h-3.5 w-3.5 shrink-0 text-[#737373]" />
						<input
							type="text"
							placeholder="Search branches…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#a3a3a3] text-[#0a0a0a]"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								className="text-[#737373] hover:text-[#0a0a0a] text-xs"
							>
								✕
							</button>
						)}
					</div>
				</div>

				{/* Branch checkbox list */}
				<div className="overflow-y-auto max-h-72 px-3 py-3">
					{nodesLoading ? (
						<div className="flex items-center gap-2 px-3 py-4 text-sm text-[#737373]">
							<div className="h-3 w-3 animate-spin rounded-full border-2 border-[#e5e5e5] border-t-[#737373]" />
							Loading branches…
						</div>
					) : filteredNodes.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-8 text-center">
							<GitBranch className="h-6 w-6 text-[#e5e5e5]" />
							<p className="text-sm text-[#737373]">
								{searchQuery
									? "No branches match your search."
									: "No branches available."}
							</p>
						</div>
					) : (
						<div className="flex flex-col gap-0.5">
							{filteredNodes.map((node) => {
								const isChecked = selectedNodeIds.has(node.id);
								const isCurrent = node.id === currentBranchId;
								const indentPx = (node.depth ?? 0) * 16 + 12;

								return (
									<button
										key={node.id}
										type="button"
										onClick={() => toggleNode(node.id)}
										disabled={mutation.isPending}
										style={{ paddingLeft: `${indentPx}px` }}
										className={cn(
											"flex w-full items-center gap-3 rounded-xl py-2.5 pr-3 text-left transition-colors",
											isChecked ? "bg-[#0a0a0a]/5" : "hover:bg-[#f3f3f3]",
											mutation.isPending && "opacity-50 cursor-not-allowed",
										)}
									>
										{/* Custom checkbox */}
										<div
											className={cn(
												"flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
												isChecked
													? "bg-[#0a0a0a] border-[#0a0a0a]"
													: "border-[#d4d4d4] bg-white",
											)}
										>
											{isChecked && (
												<Check
													className="h-2.5 w-2.5 text-white"
													strokeWidth={3}
												/>
											)}
										</div>

										{/* Node name */}
										<span
											className={cn(
												"flex-1 text-sm leading-tight",
												isChecked
													? "font-semibold text-[#0a0a0a]"
													: "text-[#404040]",
											)}
										>
											{node.name}
										</span>

										{/* Current badge */}
										{isCurrent && (
											<span className="shrink-0 rounded-full border border-[#e5e5e5] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#737373]">
												Current
											</span>
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Selection summary strip */}
				<div className="border-t border-[#e5e5e5] bg-[#fafafa] px-6 py-2.5 flex items-center justify-between min-h-[40px]">
					{selectedCount > 0 ? (
						<span className="text-xs text-[#737373]">
							<span className="font-semibold text-[#0a0a0a]">
								{selectedCount}
							</span>{" "}
							branch{selectedCount !== 1 ? "es" : ""} selected
						</span>
					) : (
						<span className="text-xs text-[#737373]">No branches selected</span>
					)}
					{selectedCount > 0 && (
						<button
							type="button"
							onClick={() => setSelectedNodeIds(new Set())}
							disabled={mutation.isPending}
							className="text-[10px] font-semibold text-[#737373] hover:text-[#0a0a0a] transition-colors"
						>
							Clear all
						</button>
					)}
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] flex justify-end gap-2">
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
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={() => mutation.mutate()}
						disabled={!canSave || nodesLoading}
					>
						{mutation.isPending
							? "Saving…"
							: selectedCount > 1
								? `Assign ${selectedCount} Branches`
								: "Assign Branch"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
