import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { getInitials, timeAgo } from "./helpers";

export function PendingApprovalsInline({
	organizationId,
}: {
	organizationId: string;
}) {
	const { data, isLoading, isError, refetch } = useQuery({
		...orpc.packageInstances.listPending.queryOptions({
			input: { organizationId, limit: 5 },
		}),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const rows = (data ?? []) as Array<{
		id: string;
		customerName: string | null;
		serviceName: string | null;
		totalPrice: number | null;
		createdAt: string | Date;
	}>;

	if (isLoading) {
		return (
			<ul className="space-y-2.5">
				{Array.from({ length: 3 }).map((_, i) => (
					<li key={i} className="flex items-center gap-3">
						<Skeleton className="size-7 rounded-full" />
						<Skeleton className="h-3 flex-1" />
					</li>
				))}
			</ul>
		);
	}

	if (isError) {
		return (
			<div className="flex items-center gap-2 text-destructive text-xs">
				<AlertTriangle className="size-3.5 shrink-0" />
				<span>Failed to load approvals.</span>
				<button
					type="button"
					onClick={() => refetch()}
					className="underline underline-offset-2 hover:opacity-70"
				>
					Retry
				</button>
			</div>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="text-xs italic text-muted-foreground">
				No pending approvals. ✨
			</div>
		);
	}

	return (
		<>
			<ul className="space-y-2.5">
				{rows.slice(0, 3).map((r) => (
					<li
						key={r.id}
						className="-mx-2 flex items-center gap-3 rounded-lg p-2 transition hover:bg-[#f3f3f3]"
					>
						<Avatar className="size-7 shrink-0">
							<AvatarFallback className="bg-[#f3f3f3] text-[10px] font-bold">
								{getInitials(r.customerName)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="truncate text-xs font-medium">
								{r.customerName ?? "Customer"}
							</div>
							<div className="truncate text-[10px] text-muted-foreground">
								{r.serviceName ?? "Package"}
							</div>
						</div>
						<div className="text-right">
							<div className="font-mono text-xs font-bold tabular-nums">
								{r.totalPrice == null ? "—" : formatPrice(r.totalPrice, "MYR")}
							</div>
							<div className="text-[10px] text-muted-foreground">
								{timeAgo(r.createdAt)}
							</div>
						</div>
					</li>
				))}
			</ul>
			<Button asChild variant="outline" size="sm" className="mt-4 w-full">
				<Link to="/dashboard/operations/approvals" search={{ scope: "all" }}>
					View all approvals
					<ChevronRight className="size-3" />
				</Link>
			</Button>
		</>
	);
}
