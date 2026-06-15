import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import type { Installment } from "./installment-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string | number | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function InstallmentStatusBadge({ status }: { status: string }) {
	if (status === "paid") {
		return (
			<Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
				Paid
			</Badge>
		);
	}
	if (status === "overdue") {
		return <Badge variant="destructive">Overdue</Badge>;
	}
	return <Badge variant="outline">Pending</Badge>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface InstallmentTimelineProps {
	organizationId: string;
	packageInstanceId: string;
	onConfirmPayment: (installment: Installment) => void;
	/** canWrite is reserved for future RBAC gating; currently all visible actions are rendered */
	canWrite: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InstallmentTimeline({
	organizationId,
	packageInstanceId,
	onConfirmPayment,
}: InstallmentTimelineProps) {
	const { data: installments = [] } = useQuery({
		queryKey: ["installments-by-instance", organizationId, packageInstanceId],
		queryFn: async (): Promise<Installment[]> => {
			if (!organizationId || !packageInstanceId) return [];
			return client.installments.listByPackageInstance({
				organizationId,
				packageInstanceId,
			});
		},
		enabled: !!organizationId && !!packageInstanceId,
	});

	if (installments.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No installments found.</p>
		);
	}

	return (
		<div className="overflow-hidden rounded-lg border">
			<table className="w-full text-sm">
				<thead className="bg-muted/50">
					<tr>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							#
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Amount
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Due Date
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Paid At
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Status
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Action
						</th>
					</tr>
				</thead>
				<tbody className="divide-y">
					{installments.map((inst) => (
						<tr key={inst.id} className="hover:bg-muted/30">
							<td className="px-3 py-2 font-medium tabular-nums">
								{inst.installmentNumber}
							</td>
							<td className="px-3 py-2 tabular-nums">
								{formatPrice(inst.amount ?? 0, "MYR")}
							</td>
							<td className="px-3 py-2">{formatDate(inst.dueDate)}</td>
							<td className="px-3 py-2">
								{inst.paidAt ? formatDate(inst.paidAt) : "—"}
							</td>
							<td className="px-3 py-2">
								<InstallmentStatusBadge status={inst.status} />
							</td>
							<td className="px-3 py-2">
								{inst.status === "paid" ? (
									<span className="font-medium text-green-700 text-xs">
										Paid ✓ {inst.paidAt ? formatDate(inst.paidAt) : ""}
									</span>
								) : (
									<Button
										size="sm"
										variant="outline"
										onClick={() => onConfirmPayment(inst)}
									>
										Confirm Payment
									</Button>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
