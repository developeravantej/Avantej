import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Loader2, Shield } from "lucide-react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { client } from "@/utils/orpc";
import { fmtAmount } from "./helpers";

export function DisputesTab() {
	const qc = useQueryClient();
	const disputesQ = useQuery({
		queryKey: ["platform-admin-payments", "disputes"],
		queryFn: () => client.platformAdminPayments.listDisputes({ limit: 100 }),
	});

	const markHandled = useMutation({
		mutationFn: (disputeId: string) =>
			client.platformAdminPayments.markDisputeHandled({ disputeId }),
		onSuccess: () => {
			toast.success("Dispute marked handled");
			qc.invalidateQueries({ queryKey: ["platform-admin-payments"] });
		},
		onError: (e: unknown) =>
			toast.error(e instanceof Error ? e.message : "Failed"),
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Disputes</CardTitle>
			</CardHeader>
			<CardContent className="px-0">
				{disputesQ.isLoading ? (
					<div className="flex justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : (disputesQ.data?.disputes.length ?? 0) === 0 ? (
					<EmptyState
						icon={Shield}
						title="No disputes"
						description="There are no open disputes to handle."
						context="search"
					/>
				) : (
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-white">
							<TableRow className="hover:bg-transparent">
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Dispute
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Status
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Amount
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Reason
								</TableHead>
								<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Deadline
								</TableHead>
								<TableHead className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Action
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{disputesQ.data!.disputes.map((d) => (
								<TableRow key={d.id} className="hover:bg-muted/30">
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<code className="font-mono text-xs">{d.disputeId}</code>
										<div className="font-mono text-xs text-muted-foreground">
											{d.stripeAccountId}
										</div>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<Badge variant="outline">{d.status}</Badge>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap font-mono tabular-nums">
										{fmtAmount(d.amount, d.currency)}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{d.reason ?? "—"}
									</TableCell>
									<TableCell className="px-6 py-4 text-xs whitespace-nowrap">
										{d.deadlineAt
											? new Date(d.deadlineAt).toLocaleString()
											: "—"}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap text-right">
										{d.handledAt ? (
											<Badge
												variant="outline"
												className="gap-1 border-green-300 bg-green-50 text-green-700"
											>
												<CheckCircle2 className="size-3" /> Handled
											</Badge>
										) : (
											<div className="flex gap-2 justify-end">
												<a
													href={`https://dashboard.stripe.com/${d.stripeAccountId}/disputes/${d.disputeId}`}
													target="_blank"
													rel="noreferrer"
													className="inline-flex items-center text-xs text-blue-700 hover:underline"
												>
													Stripe <ExternalLink className="ml-1 size-3" />
												</a>
												<Button
													size="sm"
													variant="outline"
													onClick={() => markHandled.mutate(d.disputeId)}
													disabled={markHandled.isPending}
												>
													Mark handled
												</Button>
											</div>
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
