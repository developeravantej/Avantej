import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { client } from "@/utils/orpc";
import { SeverityBadge } from "./SeverityBadge";

export function DriftTab() {
	const qc = useQueryClient();
	const [severity, setSeverity] = useState<string>("all");
	const [resolved, setResolved] = useState<string>("unresolved");

	const driftQ = useQuery({
		queryKey: ["platform-admin-payments", "drift", severity, resolved],
		queryFn: () =>
			client.platformAdminPayments.listDrift({
				severity:
					severity === "all"
						? undefined
						: (severity as "info" | "warn" | "critical"),
				resolved: resolved === "all" ? undefined : resolved === "resolved",
				limit: 100,
			}),
	});

	const markResolved = useMutation({
		mutationFn: (driftId: string) =>
			client.platformAdminPayments.markDriftResolved({ driftId }),
		onSuccess: () => {
			toast.success("Drift marked resolved");
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) =>
			toast.error(e instanceof Error ? e.message : "Failed"),
	});

	return (
		<Card>
			<CardHeader className="flex flex-row items-center gap-3">
				<CardTitle className="flex-1 text-base">Drift log</CardTitle>
				<Select value={severity} onValueChange={setSeverity}>
					<SelectTrigger className="w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All severity</SelectItem>
						<SelectItem value="critical">Critical</SelectItem>
						<SelectItem value="warn">Warn</SelectItem>
						<SelectItem value="info">Info</SelectItem>
					</SelectContent>
				</Select>
				<Select value={resolved} onValueChange={setResolved}>
					<SelectTrigger className="w-36">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="unresolved">Unresolved</SelectItem>
						<SelectItem value="resolved">Resolved</SelectItem>
						<SelectItem value="all">All</SelectItem>
					</SelectContent>
				</Select>
			</CardHeader>
			<CardContent className="px-0">
				{driftQ.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (driftQ.data?.drift.length ?? 0) === 0 ? (
					<EmptyState
						icon={CheckCircle2}
						title="No drift found"
						description="Everything reconciles for the selected filters."
						context="search"
					/>
				) : (
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Severity
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Resource
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Kind
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Org / Acct
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Detected
								</TableHead>
								<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Action
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{driftQ.data!.drift.map((row) => (
								<TableRow key={row.id} className="hover:bg-muted/30">
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<SeverityBadge severity={row.severity} />
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div className="font-medium">{row.resourceType}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{row.resourceId}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{row.driftKind}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div className="text-xs">{row.organizationId ?? "—"}</div>
										<code className="font-mono text-xs text-muted-foreground">
											{row.stripeAccountId ?? "—"}
										</code>
									</TableCell>
									<TableCell className="px-6 py-4 text-xs whitespace-nowrap">
										{new Date(row.detectedAt).toLocaleString()}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-right">
										{row.resolvedAt ? (
											<Badge
												variant="outline"
												className="gap-1 border-green-300 bg-green-50 text-green-700"
											>
												<CheckCircle2 className="size-3" /> Resolved
											</Badge>
										) : (
											<Button
												size="sm"
												variant="outline"
												onClick={() => markResolved.mutate(row.id)}
												disabled={markResolved.isPending}
											>
												Mark resolved
											</Button>
										)}
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
