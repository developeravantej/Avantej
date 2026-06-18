import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PlayCircle, RefreshCw, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { client } from "@/utils/orpc";
import { DisputesTab } from "./DisputesTab";
import { DriftTab } from "./DriftTab";
import { OverviewTab } from "./OverviewTab";
import { StuckTab } from "./StuckTab";

export function PlatformAdminPaymentsPage() {
	const qc = useQueryClient();

	const overviewQ = useQuery({
		queryKey: ["platform-admin-payments", "overview"],
		queryFn: () => client.platformAdminPayments.overview({}),
		refetchInterval: 30_000,
	});

	const runRecon = useMutation({
		mutationFn: () => client.platformAdminPayments.runReconciliationNow({}),
		onSuccess: (r) => {
			toast.success(
				`Reconciliation done — ${r.driftFound} drift rows (${r.criticalCount} critical)`,
			);
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) =>
			toast.error(e instanceof Error ? e.message : "Reconciliation failed"),
	});

	const runBackfill = useMutation({
		mutationFn: () => client.platformAdminPayments.runWebhookBackfillNow({}),
		onSuccess: (r) => {
			toast.success(
				`Backfill done — ${r.replayed} replayed, ${r.alreadyProcessed} already processed`,
			);
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) =>
			toast.error(e instanceof Error ? e.message : "Backfill failed"),
	});

	return (
		<div className="p-6 space-y-6">
			<header className="flex items-start justify-between">
				<div>
					<div className="text-sm text-muted-foreground">Platform admin</div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold">
						<Shield className="size-6" />
						Payment Integrity
					</h1>
					<p className="mt-1 text-muted-foreground text-sm">
						Cross-tenant audit + drift detection (Plan C).
					</p>
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => runBackfill.mutate()}
						disabled={runBackfill.isPending}
					>
						{runBackfill.isPending ? (
							<Loader2 className="mr-2 size-3.5 animate-spin" />
						) : (
							<RefreshCw className="mr-2 size-3.5" />
						)}
						Run backfill
					</Button>
					<Button
						size="sm"
						onClick={() => runRecon.mutate()}
						disabled={runRecon.isPending}
					>
						{runRecon.isPending ? (
							<Loader2 className="mr-2 size-3.5 animate-spin" />
						) : (
							<PlayCircle className="mr-2 size-3.5" />
						)}
						Run reconciliation
					</Button>
				</div>
			</header>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="drift">
						Drift
						{(overviewQ.data?.drift.critical ?? 0) > 0 && (
							<Badge
								variant="outline"
								className="ml-1.5 border-red-200 bg-red-50 text-red-700"
							>
								{overviewQ.data!.drift.critical}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="disputes">
						Disputes
						{(overviewQ.data?.openDisputes ?? 0) > 0 && (
							<Badge variant="secondary" className="ml-1.5">
								{overviewQ.data!.openDisputes}
							</Badge>
						)}
					</TabsTrigger>
					<TabsTrigger value="stuck">
						Stuck onboardings
						{(overviewQ.data?.stuckOnboardings ?? 0) > 0 && (
							<Badge variant="outline" className="ml-1.5">
								{overviewQ.data!.stuckOnboardings}
							</Badge>
						)}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="overview" className="mt-4 space-y-4">
					<OverviewTab data={overviewQ.data} isLoading={overviewQ.isLoading} />
				</TabsContent>
				<TabsContent value="drift" className="mt-4">
					<DriftTab />
				</TabsContent>
				<TabsContent value="disputes" className="mt-4">
					<DisputesTab />
				</TabsContent>
				<TabsContent value="stuck" className="mt-4">
					<StuckTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
