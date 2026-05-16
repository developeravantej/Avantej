/**
 * Platform Admin — Bulk Actions Bar (Plan F.1).
 *
 * Shown above the tenants table when ≥1 row is selected. Lets a super-
 * admin apply a tag, remove a tag, or suspend across the selected set.
 * Capped at 100 selected; when over the cap the action buttons disable
 * and a warning surfaces.
 *
 * Suspend control is hidden entirely for non-super-admin viewers. The
 * caller passes the current admin role (resolved via client.admin.me on
 * the parent route).
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Tag as TagIcon, X, AlertTriangle, Ban } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const BULK_CAP = 100;

export interface BulkActionsBarProps {
	selectedIds: string[];
	onClear: () => void;
	role: "super_admin" | "support" | "billing" | null;
}

export function BulkActionsBar({
	selectedIds,
	onClear,
	role,
}: BulkActionsBarProps) {
	const qc = useQueryClient();
	const isSuper = role === "super_admin";
	const overCap = selectedIds.length > BULK_CAP;
	const disabled = overCap || selectedIds.length === 0;

	const { data: tagList } = useQuery({
		queryKey: ["platformAdminTenants", "tags", "list"],
		queryFn: () => client.platformAdminTenants.tags.list({}),
	});

	// ── Apply tag ──────────────────────────────────────────────────────────
	const [applyOpen, setApplyOpen] = useState(false);
	const [applyLabel, setApplyLabel] = useState("");
	const [applyNew, setApplyNew] = useState("");

	const bulkAddMut = useMutation({
		mutationFn: (label: string) =>
			client.platformAdminTenants.tags.bulkAdd({
				organizationIds: selectedIds,
				label,
			}),
		onSuccess: (res) => {
			toast.success(
				`Applied tag — inserted ${res.inserted}/${res.attempted}.`,
			);
			qc.invalidateQueries({ queryKey: ["platformAdminTenants"] });
			setApplyOpen(false);
			setApplyLabel("");
			setApplyNew("");
			onClear();
		},
		onError: (e: any) =>
			toast.error(e?.message ?? "Bulk add failed"),
	});

	const handleApply = () => {
		const label = (applyNew || applyLabel).trim();
		if (!label) return toast.error("Choose or enter a tag label");
		bulkAddMut.mutate(label);
	};

	// ── Remove tag ─────────────────────────────────────────────────────────
	const [removeOpen, setRemoveOpen] = useState(false);
	const [removeLabel, setRemoveLabel] = useState("");

	const bulkRemoveMut = useMutation({
		mutationFn: (label: string) =>
			client.platformAdminTenants.tags.bulkRemove({
				organizationIds: selectedIds,
				label,
			}),
		onSuccess: (res) => {
			toast.success(`Removed tag from ${res.removed}/${res.attempted}.`);
			qc.invalidateQueries({ queryKey: ["platformAdminTenants"] });
			setRemoveOpen(false);
			setRemoveLabel("");
			onClear();
		},
		onError: (e: any) =>
			toast.error(e?.message ?? "Bulk remove failed"),
	});

	// ── Suspend ────────────────────────────────────────────────────────────
	const [suspendOpen, setSuspendOpen] = useState(false);
	const [suspendReason, setSuspendReason] = useState("");

	const bulkSuspendMut = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.tags.bulkSuspend({
				organizationIds: selectedIds,
				reason,
			}),
		onSuccess: (res) => {
			toast.success(`Suspended ${res.suspended}/${res.attempted}.`);
			qc.invalidateQueries({ queryKey: ["platformAdminTenants"] });
			setSuspendOpen(false);
			setSuspendReason("");
			onClear();
		},
		onError: (e: any) =>
			toast.error(e?.message ?? "Bulk suspend failed"),
	});

	return (
		<div
			className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2"
			data-testid="bulk-actions-bar"
		>
			<span
				className="text-sm font-medium"
				data-testid="bulk-actions-count"
			>
				{selectedIds.length} selected
			</span>

			{overCap && (
				<span
					className="flex items-center gap-1 text-xs text-destructive"
					data-testid="bulk-actions-overcap"
				>
					<AlertTriangle className="h-3 w-3" />
					Max {BULK_CAP} per bulk op — narrow your selection
				</span>
			)}

			<div className="flex items-center gap-2 ml-auto">
				{/* Apply tag */}
				<Dialog open={applyOpen} onOpenChange={setApplyOpen}>
					<DialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							disabled={disabled}
							data-testid="bulk-apply-tag-trigger"
						>
							<TagIcon className="h-3.5 w-3.5 mr-1" />
							Apply tag
						</Button>
					</DialogTrigger>
					<DialogContent data-testid="bulk-apply-tag-dialog">
						<DialogHeader>
							<DialogTitle>
								Apply tag to {selectedIds.length} tenant
								{selectedIds.length === 1 ? "" : "s"}
							</DialogTitle>
						</DialogHeader>
						<div className="space-y-3">
							<div>
								<label className="text-xs text-muted-foreground">Existing tag</label>
								<Select value={applyLabel} onValueChange={setApplyLabel}>
									<SelectTrigger data-testid="bulk-apply-tag-select">
										<SelectValue placeholder="Choose an existing tag" />
									</SelectTrigger>
									<SelectContent>
										{(tagList?.tags ?? []).map((t) => (
											<SelectItem key={t.label} value={t.label}>
												{t.label} ({t.orgCount})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="text-xs text-muted-foreground text-center">— or —</div>
							<div>
								<label className="text-xs text-muted-foreground">New tag label</label>
								<Input
									placeholder="e.g. enterprise"
									value={applyNew}
									onChange={(e) => setApplyNew(e.target.value)}
									data-testid="bulk-apply-tag-new"
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								onClick={handleApply}
								disabled={bulkAddMut.isPending}
								data-testid="bulk-apply-tag-submit"
							>
								{bulkAddMut.isPending && (
									<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
								)}
								Apply
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Remove tag */}
				<Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
					<DialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							disabled={disabled || (tagList?.tags ?? []).length === 0}
							data-testid="bulk-remove-tag-trigger"
						>
							<X className="h-3.5 w-3.5 mr-1" />
							Remove tag
						</Button>
					</DialogTrigger>
					<DialogContent data-testid="bulk-remove-tag-dialog">
						<DialogHeader>
							<DialogTitle>
								Remove tag from {selectedIds.length} tenant
								{selectedIds.length === 1 ? "" : "s"}
							</DialogTitle>
						</DialogHeader>
						<Select value={removeLabel} onValueChange={setRemoveLabel}>
							<SelectTrigger data-testid="bulk-remove-tag-select">
								<SelectValue placeholder="Choose tag to remove" />
							</SelectTrigger>
							<SelectContent>
								{(tagList?.tags ?? []).map((t) => (
									<SelectItem key={t.label} value={t.label}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<DialogFooter>
							<Button
								variant="destructive"
								onClick={() => bulkRemoveMut.mutate(removeLabel)}
								disabled={!removeLabel || bulkRemoveMut.isPending}
								data-testid="bulk-remove-tag-submit"
							>
								{bulkRemoveMut.isPending && (
									<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
								)}
								Remove
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>

				{/* Suspend (super_admin only) */}
				{isSuper && (
					<Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
						<DialogTrigger asChild>
							<Button
								size="sm"
								variant="destructive"
								disabled={disabled}
								data-testid="bulk-suspend-trigger"
							>
								<Ban className="h-3.5 w-3.5 mr-1" />
								Suspend
							</Button>
						</DialogTrigger>
						<DialogContent data-testid="bulk-suspend-dialog">
							<DialogHeader>
								<DialogTitle>
									Suspend {selectedIds.length} tenant
									{selectedIds.length === 1 ? "" : "s"}?
								</DialogTitle>
							</DialogHeader>
							<div className="space-y-2">
								<label className="text-xs text-muted-foreground">
									Reason (required, audit log)
								</label>
								<Input
									value={suspendReason}
									onChange={(e) => setSuspendReason(e.target.value)}
									placeholder="e.g. payment failure escalation"
									data-testid="bulk-suspend-reason"
								/>
							</div>
							<DialogFooter>
								<Button
									variant="destructive"
									onClick={() => bulkSuspendMut.mutate(suspendReason.trim())}
									disabled={
										suspendReason.trim().length < 3 || bulkSuspendMut.isPending
									}
									data-testid="bulk-suspend-submit"
								>
									{bulkSuspendMut.isPending && (
										<Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
									)}
									Confirm suspend
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}

				<Button
					size="sm"
					variant="ghost"
					onClick={onClear}
					data-testid="bulk-actions-clear"
				>
					Clear
				</Button>
			</div>
		</div>
	);
}
