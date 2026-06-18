/**
 * Platform Admin — Tenant Deletion Card (Plan E E.8).
 *
 * Drop-in component for the Tenants drill-in "Actions" tab. Shows the
 * current deletion state for the org (if any), exposes three super-admin
 * actions: Request export, Request soft delete (30-day grace), Restore.
 *
 * Wiring: import + render `<TenantDeletionCard organizationId={id} />`
 * inside the Actions tab in tenants.$id.tsx. Done in a separate file so
 * the existing route file stays untouched (per Plan E.8 brief).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
	organizationId: string;
}

function formatDate(d: Date | string | null | undefined): string {
	if (!d) return "—";
	const date = typeof d === "string" ? new Date(d) : d;
	return date.toLocaleString();
}

export function TenantDeletionCard({ organizationId }: Props) {
	const qc = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ["platform-admin", "tenant-deletions", organizationId],
		queryFn: () =>
			client.platformAdminTenants.listTenantDeletions({
				organizationId,
				onlyOpen: false,
				page: 1,
				limit: 5,
			}),
	});

	const invalidate = () =>
		qc.invalidateQueries({
			queryKey: ["platform-admin", "tenant-deletions", organizationId],
		});

	const requestExport = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.requestTenantExport({ organizationId }),
		onSuccess: (r) => {
			toast.success(
				`Export ready — ${r.tableCount} tables, ${r.totalRows} rows`,
			);
		},
		onError: (e) =>
			toast.error(
				`Export failed: ${e instanceof Error ? e.message : String(e)}`,
			),
	});

	const requestSoftDelete = useMutation({
		mutationFn: (captureExport: boolean) =>
			client.platformAdminTenants.requestTenantDeletion({
				organizationId,
				captureExport,
			}),
		onSuccess: (r) => {
			toast.success(
				`Soft delete scheduled — hard delete after ${formatDate(r.hardDeleteAfter)}`,
			);
			invalidate();
		},
		onError: (e) =>
			toast.error(
				`Soft delete failed: ${e instanceof Error ? e.message : String(e)}`,
			),
	});

	const restore = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.restoreTenantDeletion({ organizationId }),
		onSuccess: () => {
			toast.success("Tenant restored");
			invalidate();
		},
		onError: (e) =>
			toast.error(
				`Restore failed: ${e instanceof Error ? e.message : String(e)}`,
			),
	});

	const openDeletion = data?.deletions.find(
		(d) => !d.restoredAt && !d.hardDeletedAt,
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Data export & deletion (GDPR)</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-zinc-500">
						<Loader2 className="size-4 animate-spin" /> Loading…
					</div>
				) : openDeletion ? (
					<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
						<div className="flex items-center gap-2">
							<Badge variant="destructive">Soft deleted</Badge>
							<span className="text-zinc-700">
								Hard delete after {formatDate(openDeletion.hardDeleteAfter)}
							</span>
						</div>
						<div className="mt-1 text-xs text-zinc-600">
							Requested by {openDeletion.requestedBy} at{" "}
							{formatDate(openDeletion.requestedAt)}
							{openDeletion.hasExportUrl ? " · export captured" : ""}
						</div>
					</div>
				) : (
					<div className="text-sm text-zinc-500">
						No active deletion request.
					</div>
				)}

				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						disabled={requestExport.isPending}
						onClick={() => requestExport.mutate()}
					>
						{requestExport.isPending ? (
							<Loader2 className="size-4 animate-spin" />
						) : null}
						Request export
					</Button>

					{openDeletion ? (
						<Button
							variant="default"
							disabled={restore.isPending}
							onClick={() => restore.mutate()}
						>
							{restore.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							Restore
						</Button>
					) : (
						<Button
							variant="destructive"
							disabled={requestSoftDelete.isPending}
							onClick={() => {
								if (
									!confirm(
										"Soft delete this tenant? Hard delete will run after 30 days. Capture an export first.",
									)
								)
									return;
								requestSoftDelete.mutate(true);
							}}
						>
							{requestSoftDelete.isPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							Request soft delete (30-day grace)
						</Button>
					)}
				</div>

				{data?.deletions && data.deletions.length > 0 ? (
					<div className="border-t pt-3">
						<div className="mb-2 text-xs font-medium text-zinc-500">
							Deletion history
						</div>
						<ul className="space-y-1 text-xs text-zinc-600">
							{data.deletions.map((d) => (
								<li key={d.id} className="flex flex-wrap items-center gap-2">
									<span>{formatDate(d.requestedAt)}</span>
									<span>·</span>
									<span>by {d.requestedBy}</span>
									{d.restoredAt ? (
										<Badge variant="secondary">
											restored {formatDate(d.restoredAt)}
										</Badge>
									) : d.hardDeletedAt ? (
										<Badge variant="destructive">
											hard-deleted {formatDate(d.hardDeletedAt)}
										</Badge>
									) : (
										<Badge variant="outline">open</Badge>
									)}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
