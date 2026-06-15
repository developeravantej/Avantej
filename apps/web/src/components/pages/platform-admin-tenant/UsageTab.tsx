import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { fmtMinor } from "./helpers";

export function UsageTab({ organizationId }: { organizationId: string }) {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ["platformAdminTenants", "getTenantUsageHistory", organizationId],
		queryFn: () =>
			client.platformAdminTenants.getTenantUsageHistory({
				organizationId,
				days: 30,
			}),
	});

	const refresh = useMutation({
		mutationFn: () =>
			client.platformAdminTenants.runTenantUsageSnapshotsNow({}),
		onSuccess: (r) => {
			toast.success(
				`Snapshot complete — ${r.written} written, ${r.errors} errors (${r.durationMs}ms)`,
			);
			qc.invalidateQueries({
				queryKey: [
					"platformAdminTenants",
					"getTenantUsageHistory",
					organizationId,
				],
			});
		},
		onError: (e: unknown) =>
			toast.error(`Snapshot failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const snapshots = data?.snapshots ?? [];
	const latest = snapshots[snapshots.length - 1] ?? null;

	const peak = snapshots.reduce(
		(acc, s) => ({
			members: Math.max(acc.members, s.memberCount),
			customers: Math.max(acc.customers, s.customerCount),
			appts: Math.max(acc.appts, s.apptCount30d),
			sales: Math.max(acc.sales, s.salesTotal30dMinor),
		}),
		{ members: 0, customers: 0, appts: 0, sales: 0 },
	);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					Daily snapshot at 01:00 UTC. Latest:{" "}
					{latest ? latest.snapshotDate : isLoading ? "loading…" : "none yet"}.
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => refresh.mutate()}
					disabled={refresh.isPending}
				>
					{refresh.isPending ? (
						<Loader2 className="h-4 w-4 mr-1 animate-spin" />
					) : (
						<RefreshCw className="h-4 w-4 mr-1" />
					)}
					Refresh now
				</Button>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Members
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">
							{latest?.memberCount ?? "—"}
						</div>
						<div className="text-xs text-muted-foreground">
							peak {peak.members}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Customers
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">
							{latest?.customerCount ?? "—"}
						</div>
						<div className="text-xs text-muted-foreground">
							peak {peak.customers}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Appts (30d)
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">
							{latest?.apptCount30d ?? "—"}
						</div>
						<div className="text-xs text-muted-foreground">
							peak {peak.appts}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
							Sales 30d
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-semibold">
							{latest
								? fmtMinor(latest.salesTotal30dMinor, latest.salesCurrency)
								: "—"}
						</div>
						<div className="text-xs text-muted-foreground">
							peak {fmtMinor(peak.sales, latest?.salesCurrency ?? "MYR")}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Daily history</CardTitle>
				</CardHeader>
				<CardContent className={snapshots.length === 0 ? undefined : "px-0"}>
					{isLoading ? (
						<div className="text-muted-foreground text-sm">Loading…</div>
					) : snapshots.length === 0 ? (
						<EmptyState
							title="No snapshots yet"
							description='Run "Refresh now" to create the first one.'
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow className="border-b border-border/40 hover:bg-transparent">
									<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Date
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Members
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Customers
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Appts 30d
									</TableHead>
									<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
										Sales 30d
									</TableHead>
									<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										GHL
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{snapshots
									.slice()
									.reverse()
									.map((s) => (
										<TableRow
											key={s.id}
											className="border-b border-border/30 transition-colors hover:bg-muted/30"
										>
											<TableCell className="px-6 py-4 font-mono text-xs whitespace-nowrap">
												{s.snapshotDate}
											</TableCell>
											<TableCell className="px-6 py-4 text-right text-sm tabular-nums whitespace-nowrap">
												{s.memberCount}
											</TableCell>
											<TableCell className="px-6 py-4 text-right text-sm tabular-nums whitespace-nowrap">
												{s.customerCount}
											</TableCell>
											<TableCell className="px-6 py-4 text-right text-sm tabular-nums whitespace-nowrap">
												{s.apptCount30d}
											</TableCell>
											<TableCell className="px-6 py-4 text-right font-mono text-sm tabular-nums whitespace-nowrap">
												{fmtMinor(s.salesTotal30dMinor, s.salesCurrency)}
											</TableCell>
											<TableCell className="px-6 py-4 whitespace-nowrap">
												<Badge
													variant="outline"
													className={
														s.ghlActive
															? "border-green-300 bg-green-50 text-green-700"
															: undefined
													}
												>
													{s.ghlActive ? "active" : "off"}
												</Badge>
											</TableCell>
										</TableRow>
									))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
