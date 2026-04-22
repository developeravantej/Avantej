import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

type WithinOption = 7 | 30;

export function ExpiringMembershipsWidget() {
	const [within, setWithin] = useState<WithinOption>(7);
	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	const { data, isLoading } = useQuery({
		queryKey: ["memberships", "expiring", organizationId, within],
		queryFn: () =>
			client.packageInstances.listExpiring({
				organizationId,
				within,
			}),
		enabled: !!organizationId,
		staleTime: 60 * 1000,
	});

	const rows = (data?.rows ?? []) as Array<{
		packageInstanceId: string;
		clientId: string;
		memberName: string;
		serviceName: string;
		expiresAt: string | Date;
		daysUntilExpiry: number;
		creditsRemaining: number;
	}>;
	const total = data?.total ?? 0;
	const topRows = rows.slice(0, 5);

	return (
		<Card className="h-full">
			<CardContent className="pt-6">
				<div className="mb-3 flex items-center justify-between">
					<p className="text-xs font-bold uppercase tracking-wide text-brand-secondary-1">
						Expiring Memberships
					</p>
					<div className="flex gap-1">
						<button
							type="button"
							onClick={() => setWithin(7)}
							className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
								within === 7
									? "bg-brand-secondary-2 text-brand-primary-1"
									: "bg-transparent text-brand-secondary-1 hover:bg-brand-secondary-3"
							}`}
						>
							7 days
						</button>
						<button
							type="button"
							onClick={() => setWithin(30)}
							className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
								within === 30
									? "bg-brand-secondary-2 text-brand-primary-1"
									: "bg-transparent text-brand-secondary-1 hover:bg-brand-secondary-3"
							}`}
						>
							30 days
						</button>
					</div>
				</div>

				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-4 w-40" />
					</div>
				) : total === 0 ? (
					<p className="py-6 text-center text-sm text-brand-secondary-1">
						No memberships expiring in the next {within} days
					</p>
				) : (
					<>
						<p className="mb-3 text-sm text-brand-secondary-1">
							<span className="font-heading text-2xl font-bold text-brand-primary-1">
								{total}
							</span>{" "}
							{total === 1 ? "membership" : "memberships"} expiring
						</p>
						<div className="divide-y divide-brand-secondary-3">
							{topRows.map((row) => (
								<Link
									key={row.packageInstanceId}
									to="/dashboard/customers/view"
									search={{ customerId: row.clientId }}
									className="flex items-center justify-between py-2 text-sm hover:bg-brand-secondary-3/30"
								>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-brand-primary-1">
											{row.memberName}
										</p>
										<p className="truncate text-xs text-brand-secondary-1">
											{row.serviceName}
										</p>
									</div>
									<div className="ml-3 shrink-0 text-right">
										<p className="text-xs font-medium text-brand-primary-1">
											{row.daysUntilExpiry === 0
												? "Today"
												: row.daysUntilExpiry === 1
													? "Tomorrow"
													: `${row.daysUntilExpiry} days`}
										</p>
										<p className="text-[11px] text-brand-secondary-1">
											{row.creditsRemaining} credits left
										</p>
									</div>
								</Link>
							))}
						</div>
						{total > 5 && (
							<p className="mt-2 text-center text-xs text-brand-secondary-1">
								+ {total - 5} more
							</p>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}
