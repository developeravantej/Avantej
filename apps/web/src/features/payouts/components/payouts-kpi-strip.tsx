import { Banknote, Clock, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

interface KpiCardProps {
	label: string;
	value: string;
	icon: React.ReactNode;
	valueClassName?: string;
	isLoading?: boolean;
}

function KpiCard({
	label,
	value,
	icon,
	valueClassName,
	isLoading,
}: KpiCardProps) {
	return (
		<Card className="flex-1 min-w-0 gap-3 py-5">
			<CardContent className="px-5">
				<div className="flex items-center gap-3">
					<div className="shrink-0 p-2 rounded-lg bg-muted/50">{icon}</div>
					<div className="min-w-0">
						<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
							{label}
						</p>
						{isLoading ? (
							<div className="mt-1 h-6 w-24 animate-pulse rounded bg-muted" />
						) : (
							<p
								className={cn(
									"mt-0.5 text-lg font-semibold tabular-nums",
									valueClassName,
								)}
							>
								{value}
							</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

interface PayoutsKpiStripProps {
	pendingCents: number;
	approvedCents: number;
	paidCents: number;
	isLoading?: boolean;
}

export function PayoutsKpiStrip({
	pendingCents,
	approvedCents,
	paidCents,
	isLoading,
}: PayoutsKpiStripProps) {
	return (
		<div className="flex gap-4 flex-wrap" data-testid="payouts-kpi-strip">
			<div data-testid="payouts-kpi-pending">
				<KpiCard
					label="Pending Approval"
					value={formatPrice(pendingCents, "MYR")}
					icon={<Clock className="h-4 w-4 text-amber-500" />}
					valueClassName="text-amber-700"
					isLoading={isLoading}
				/>
			</div>
			<div data-testid="payouts-kpi-approved">
				<KpiCard
					label="Approved (Ready to Pay)"
					value={formatPrice(approvedCents, "MYR")}
					icon={<CheckCircle className="h-4 w-4 text-blue-500" />}
					valueClassName="text-blue-700"
					isLoading={isLoading}
				/>
			</div>
			<div data-testid="payouts-kpi-paid">
				<KpiCard
					label="Paid This Period"
					value={formatPrice(paidCents, "MYR")}
					icon={<Banknote className="h-4 w-4 text-green-500" />}
					valueClassName="text-green-700"
					isLoading={isLoading}
				/>
			</div>
		</div>
	);
}
