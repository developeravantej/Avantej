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
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageLoader } from "@/components/ui/loading-spinner";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc, queryClient } from "@/utils/orpc";
import { PolicyEditorDialog } from "./PolicyEditorDialog";
import { PolicyRow } from "./PolicyRow";
import type { BranchNode, Policy } from "./types";

export function CommissionCyclesPage() {
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
