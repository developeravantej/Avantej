import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/money";
import { formatDate, paymentStatusVariant } from "../utils";

type Payment = {
	id: string;
	totalAmount?: number | null;
	createdAt?: Date | string | null;
	paymentMethod?: string | null;
	status?: string | null;
};

interface PaymentsTabProps {
	recentPayments: Payment[];
}

export function PaymentsTab({ recentPayments }: PaymentsTabProps) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Payment History</CardTitle>
			</CardHeader>
			<CardContent>
				{recentPayments.length === 0 ? (
					<p className="py-4 text-center text-muted-foreground text-sm">
						No payment records found.
					</p>
				) : (
					<div className="overflow-hidden rounded-md border">
						<table className="w-full text-sm">
							<thead className="bg-muted/50">
								<tr>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Date
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Amount
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Method
									</th>
									<th className="px-3 py-2 text-left font-medium text-muted-foreground text-xs">
										Status
									</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{recentPayments.map((payment) => (
									<tr key={payment.id}>
										<td className="px-3 py-2 text-muted-foreground tabular-nums">
											{formatDate(payment.createdAt)}
										</td>
										<td className="px-3 py-2 font-medium tabular-nums">
											{formatPrice(payment.totalAmount ?? 0, "MYR")}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{payment.paymentMethod ?? "—"}
										</td>
										<td className="px-3 py-2">
											<Badge
												variant={paymentStatusVariant(payment.status ?? "")}
												className="text-xs"
											>
												{payment.status ?? "unknown"}
											</Badge>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
