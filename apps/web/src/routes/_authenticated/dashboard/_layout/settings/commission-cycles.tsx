/**
 * Commission cycle policy settings page (S-cycle-window-alignment admin UI).
 *
 * Lets admins manage the `commission_cycle_configs` rows that drive the
 * per-cycle commission cap window. Without this page the policy was only
 * editable via Drizzle Studio. Operators can now:
 *   - View the active policy per branch (and the tenant-wide default).
 *   - Add a branch override or change the tenant-wide default.
 *   - Delete an override to fall back to the default / system default.
 *
 * Routes the cycleType + anchorDay form through the same server-side
 * validation as the DB CHECK constraint, so range errors surface as
 * BAD_REQUEST instead of a raw 23514.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc, queryClient } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loading-spinner";

type CycleType =
	| "calendar_month"
	| "monthly_anchored"
	| "semi_monthly"
	| "weekly";

interface Policy {
	id: string;
	branchId: string | null;
	branchName: string | null;
	cycleType: CycleType;
	anchorDay: number | null;
	updatedBy: string | null;
	updatedAt: Date;
}

interface BranchNode {
	id: string;
	name: string;
	type: string;
}

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/settings/commission-cycles",
)({
	component: CommissionCyclesPage,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
] as const;

function describePolicy(p: Pick<Policy, "cycleType" | "anchorDay">): string {
	switch (p.cycleType) {
		case "calendar_month":
			return "Calendar month (1st → last day, UTC)";
		case "monthly_anchored":
			return `Monthly anchored on day ${p.anchorDay ?? "?"} (cycle runs day ${p.anchorDay} → next day ${p.anchorDay})`;
		case "semi_monthly":
			return `Semi-monthly starting day ${p.anchorDay ?? "?"} (first half + second half)`;
		case "weekly": {
			const dow = p.anchorDay ?? 1;
			return `Weekly starting ${WEEKDAY_NAMES[dow] ?? `day ${dow}`}`;
		}
	}
}

function anchorDayHint(cycleType: CycleType): string {
	switch (cycleType) {
		case "calendar_month":
			return "Leave empty — calendar_month is fixed to 1st-of-month.";
		case "monthly_anchored":
			return "Day of month: 1–28 (avoid month-length edge cases).";
		case "semi_monthly":
			return "First-half start day: 1–15. Second half begins anchor + 15.";
		case "weekly":
			return "Weekday: 0=Sun, 1=Mon … 6=Sat.";
	}
}

function isAnchorValid(cycleType: CycleType, raw: string): boolean {
	if (cycleType === "calendar_month") return raw.trim() === "";
	const n = Number.parseInt(raw, 10);
	if (!Number.isInteger(n)) return false;
	if (cycleType === "monthly_anchored") return n >= 1 && n <= 28;
	if (cycleType === "semi_monthly") return n >= 1 && n <= 15;
	if (cycleType === "weekly") return n >= 0 && n <= 6;
	return false;
}

// ─── Page ───────────────────────────────────────────────────────────────────

function CommissionCyclesPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const orgId = userContext?.currentOrganizationId ?? "";

	const canEdit =
		hasPermission("category_commission_management:create") ||
		hasPermission("category_commission_management:update");

	const policiesQuery = useQuery({
		...orpc.commissionCycle.list.queryOptions({
			input: { organizationId: orgId },
		}),
		enabled: !!orgId,
	});

	const branchesQuery = useQuery(
		orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: orgId },
		}),
	);
	const branches = useMemo<BranchNode[]>(() => {
		const nodes = (branchesQuery.data?.nodes ?? []) as BranchNode[];
		return nodes.filter((n) => n.type === "branch" || n.type === "location");
	}, [branchesQuery.data]);

	const [editingPolicy, setEditingPolicy] = useState<Policy | "new" | null>(
		null,
	);

	const deleteMutation = useMutation({
		mutationFn: (branchId: string | null) =>
			client.commissionCycle.delete({ organizationId: orgId, branchId }),
		onSuccess: () => {
			toast.success("Cycle policy deleted.");
			queryClient.invalidateQueries(
				orpc.commissionCycle.list.queryOptions({
					input: { organizationId: orgId },
				}),
			);
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to delete cycle policy."),
	});

	const policies: Policy[] = (policiesQuery.data?.policies ?? []) as Policy[];
	const tenantWide = policies.find((p: Policy) => p.branchId === null);
	const branchPolicies = policies.filter((p: Policy) => p.branchId !== null);

	if (!orgId) return null;

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-[#737373]">Settings</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Commission cycles</span>
				</div>
			</header>

			<div className="flex flex-col gap-5 px-6 py-6">
				<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="text-sm font-semibold">Cap cycle policy</h2>
							<p className="mt-1 text-xs text-[#737373] max-w-2xl">
								Drives the window for{" "}
								<code className="font-mono text-[10px] bg-[#f3f3f3] px-1 py-0.5 rounded">
									maxPerCycleCents
								</code>{" "}
								on category commission configs. Without a policy, cycles default
								to the UTC calendar month. Set a tenant-wide default, then add
								per-branch overrides for franchises that run on a non-standard
								payroll period (e.g. 22nd→22nd semi-monthly).
							</p>
						</div>
						{canEdit ? (
							<Button size="sm" onClick={() => setEditingPolicy("new")}>
								<Plus className="mr-1 h-3.5 w-3.5" />
								Add policy
							</Button>
						) : null}
					</div>
				</div>

				{policiesQuery.isLoading ? (
					<PageLoader />
				) : (
					<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
						<table className="w-full">
							<thead>
								<tr>
									{["Scope", "Cycle", "Anchor", "Updated", ""].map((h) => (
										<th
											key={h || "__a"}
											className="border-b border-[#e5e5e5] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[.06em] text-[#8a8f91]"
										>
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{!tenantWide ? (
									<tr className="border-b border-[#f7f5ee] bg-amber-50/60">
										<td className="px-4 py-3 text-sm">
											<span className="font-medium">Tenant default</span>
											<Badge variant="outline" className="ml-2 text-[10px]">
												Not set
											</Badge>
										</td>
										<td
											className="px-4 py-3 text-sm text-[#737373]"
											colSpan={3}
										>
											No tenant-wide policy. Cycles fall back to the UTC
											calendar month.
										</td>
										<td className="px-4 py-3 text-right">
											{canEdit ? (
												<Button
													variant="outline"
													size="sm"
													onClick={() => setEditingPolicy("new")}
												>
													Set default
												</Button>
											) : null}
										</td>
									</tr>
								) : (
									<PolicyRow
										policy={tenantWide}
										canEdit={canEdit}
										onEdit={() => setEditingPolicy(tenantWide)}
										onDelete={() => {
											if (
												window.confirm(
													"Delete the tenant-wide cycle policy? Falls back to UTC calendar month.",
												)
											) {
												deleteMutation.mutate(null);
											}
										}}
									/>
								)}
								{branchPolicies.map((p: Policy) => (
									<PolicyRow
										key={p.id}
										policy={p}
										canEdit={canEdit}
										onEdit={() => setEditingPolicy(p)}
										onDelete={() => {
											if (
												window.confirm(
													`Delete the policy for branch "${p.branchName ?? p.branchId}"? Falls back to the tenant-wide default.`,
												)
											) {
												deleteMutation.mutate(p.branchId);
											}
										}}
									/>
								))}
								{branchPolicies.length === 0 ? (
									<tr>
										<td
											colSpan={5}
											className="px-4 py-6 text-center text-xs text-[#737373]"
										>
											No branch overrides. Every branch uses the tenant-wide
											default.
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{editingPolicy !== null ? (
				<PolicyEditorDialog
					organizationId={orgId}
					initial={editingPolicy === "new" ? null : editingPolicy}
					branches={branches}
					existingBranchIds={
						new Set(
							branchPolicies
								.map((p: { branchId: string | null }) => p.branchId!)
								.filter(Boolean),
						)
					}
					tenantWideExists={!!tenantWide}
					onClose={() => setEditingPolicy(null)}
				/>
			) : null}
		</div>
	);
}

// ─── Row ────────────────────────────────────────────────────────────────────

function PolicyRow({
	policy,
	canEdit,
	onEdit,
	onDelete,
}: {
	policy: Policy;
	canEdit: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const isTenantWide = policy.branchId === null;
	return (
		<tr className="border-b border-[#f7f5ee] last:border-0 hover:bg-[#fcfaf6]">
			<td className="px-4 py-3 text-sm">
				<span className="font-medium">
					{isTenantWide
						? "Tenant default"
						: (policy.branchName ?? policy.branchId)}
				</span>
				{isTenantWide ? (
					<Badge variant="outline" className="ml-2 text-[10px]">
						All branches
					</Badge>
				) : null}
			</td>
			<td className="px-4 py-3 text-sm">
				<code className="font-mono text-[11px] bg-[#f3f3f3] px-1.5 py-0.5 rounded">
					{policy.cycleType}
				</code>
			</td>
			<td className="px-4 py-3 text-sm text-[#737373]">
				{describePolicy(policy)}
			</td>
			<td className="px-4 py-3 text-xs text-[#737373] tabular-nums">
				{new Date(policy.updatedAt).toLocaleDateString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
				})}
			</td>
			<td className="px-4 py-3 text-right">
				{canEdit ? (
					<div className="inline-flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={onEdit}
						>
							<Pencil className="h-3.5 w-3.5" />
							<span className="sr-only">Edit</span>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
							onClick={onDelete}
						>
							<Trash2 className="h-3.5 w-3.5" />
							<span className="sr-only">Delete</span>
						</Button>
					</div>
				) : null}
			</td>
		</tr>
	);
}

// ─── Editor dialog ──────────────────────────────────────────────────────────

function PolicyEditorDialog({
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
