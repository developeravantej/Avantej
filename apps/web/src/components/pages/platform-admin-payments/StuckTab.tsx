import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { client } from "@/utils/orpc";

export function StuckTab() {
	const stuckQ = useQuery({
		queryKey: ["platform-admin-payments", "stuck"],
		queryFn: () => client.platformAdminPayments.listStuckOnboardings({}),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Stuck onboardings</CardTitle>
			</CardHeader>
			<CardContent className="px-0">
				{stuckQ.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (stuckQ.data?.stuck.length ?? 0) === 0 ? (
					<EmptyState
						icon={CheckCircle2}
						title="No stuck onboardings"
						description="All tenants have completed onboarding in time."
						context="search"
					/>
				) : (
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Org
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Country
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Acct
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Status
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Details
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Last update
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{stuckQ.data!.stuck.map((row, i) => (
								<TableRow
									key={`${row.organizationId}-${row.countryCode}-${i}`}
									className="hover:bg-muted/30"
								>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div className="font-medium">{row.orgName}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{row.orgSlug}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{row.countryCode}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<code className="font-mono text-xs">
											{row.stripeAccountId}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<Badge variant="outline">{row.status}</Badge>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{row.detailsSubmitted ? "Submitted" : "Not submitted"}
									</TableCell>
									<TableCell className="px-6 py-4 text-xs whitespace-nowrap">
										{row.connectAccountUpdatedAt
											? new Date(row.connectAccountUpdatedAt).toLocaleString()
											: "—"}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
