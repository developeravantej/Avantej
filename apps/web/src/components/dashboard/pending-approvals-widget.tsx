/**
 * Dashboard widget — shows the N most recent pending-approval packages
 * with a count badge and "View all" link to the full Approvals page.
 * Only renders content for admin / trainer roles.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

type PendingRow = {
	id: string;
	clientId: string | null;
	serviceName: string | null;
	customerName: string | null;
	customerEmail: string | null;
	creditsTotal: number;
	totalPrice: number | null;
	createdAt: string | Date;
};

function formatPrice(cents: number | null): string {
	if (cents == null) return "—";
	return `RM ${(cents / 100).toFixed(2)}`;
}

function timeAgo(value: string | Date): string {
	const now = Date.now();
	const then = new Date(value).getTime();
	const diffMs = now - then;
	const diffMins = Math.floor(diffMs / 60_000);
	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	const diffHrs = Math.floor(diffMins / 60);
	if (diffHrs < 24) return `${diffHrs}h ago`;
	const diffDays = Math.floor(diffHrs / 24);
	return `${diffDays}d ago`;
}

export function PendingApprovalsWidget() {
	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	const currentOrg = userCtx?.organizations.find(
		(o) => o.id === organizationId,
	);
	const callerRole = currentOrg?.role ?? null;
	const isStaff = callerRole === "admin" || callerRole === "trainer";

	const { data: rows, isLoading } = useQuery({
		queryKey: ["packageInstances", "listPending", organizationId, "widget"],
		queryFn: () =>
			client.packageInstances.listPending({
				organizationId,
				scope: "all",
				limit: 100,
			}),
		enabled: !!organizationId && isStaff,
		staleTime: 60 * 1000,
	});

	const list = (rows ?? []) as PendingRow[];
	const total = list.length;
	const topRows = list.slice(0, 3);

	// Don't render anything for non-staff roles
	if (!isStaff) return null;

	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<ClipboardCheck className="h-4 w-4 text-brand-secondary-1" />
						<p className="text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
							Pending Approvals
						</p>
					</div>
					{total > 0 && (
						<Link
							to="/dashboard/operations/approvals"
							className="text-xs font-medium text-brand-primary-1 hover:underline"
						>
							View all
						</Link>
					)}
				</div>

				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-4 w-40" />
					</div>
				) : total === 0 ? (
					<p className="py-6 text-center text-sm text-brand-secondary-1">
						No packages awaiting approval
					</p>
				) : (
					<>
						<p className="mb-3 text-sm text-brand-secondary-1">
							<span className="font-heading text-2xl font-bold text-brand-primary-1">
								{total}
							</span>{" "}
							{total === 1 ? "package" : "packages"} awaiting assignment
						</p>
						<div className="divide-y divide-brand-secondary-3">
							{topRows.map((row) => (
								<Link
									key={row.id}
									to="/dashboard/operations/approvals"
									className="flex items-center justify-between py-2 text-sm hover:bg-brand-secondary-3/30"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-brand-primary-1">
											{row.customerName ?? "Customer"}
										</p>
										<p className="truncate text-xs text-brand-secondary-1">
											{row.serviceName ?? "Package"}
										</p>
									</div>
									<div className="ml-3 shrink-0 text-right">
										<p className="text-xs font-medium text-brand-primary-1">
											{row.creditsTotal} credits
										</p>
										<p className="text-[11px] text-brand-secondary-1">
											{timeAgo(row.createdAt)}
										</p>
									</div>
								</Link>
							))}
						</div>
						{total > 3 && (
							<Link
								to="/dashboard/operations/approvals"
								className="mt-2 block text-center text-xs text-brand-secondary-1 hover:text-brand-primary-1"
							>
								+ {total - 3} more
							</Link>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
