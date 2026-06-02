"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import {
	StatusBadge,
	type CanonicalStatus,
} from "@/components/ui/status-badge";
import { Separator } from "@/components/ui/separator";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommissionRow = {
	id: string;
	createdAt: string | Date;
	appointmentId: string | null;
	salesOrderId: string | null;
	appointmentNumber?: string | null;
	salesOrderNumber?: string | null;
	serviceName?: string | null;
	calculatedAmount: number;
	status: string;
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
	organizationId: string;
	trainerUserId: string | null;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainerCommissionsSection({
	organizationId,
	trainerUserId,
	isOpen,
	onOpenChange,
}: Props) {
	const { data: commissionsData, isLoading } = useQuery({
		...orpc.commissionSplits.listLedger.queryOptions({
			input: {
				organizationId,
				staffId: trainerUserId!,
				limit: 20,
				offset: 0,
			},
		}),
		enabled: !!trainerUserId && isOpen,
	});

	const commissions: CommissionRow[] =
		(commissionsData as { rows?: CommissionRow[] } | undefined)?.rows ?? [];

	return (
		<Collapsible open={isOpen} onOpenChange={onOpenChange}>
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="flex w-full items-center justify-between pt-1"
				>
					<div className="space-y-0.5 text-left">
						<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							Commissions
						</p>
						<Separator />
					</div>
					<ChevronDown
						className={cn(
							"size-4 text-muted-foreground transition-transform duration-200",
							isOpen && "rotate-180",
						)}
					/>
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-3">
				{isLoading ? (
					<p className="text-sm text-muted-foreground py-2">
						Loading commissions…
					</p>
				) : commissions.length === 0 ? (
					<p className="text-sm text-muted-foreground py-2">
						No commission records found.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b text-left">
									<th className="pb-1.5 pr-3 font-medium text-muted-foreground text-xs">
										Date
									</th>
									<th className="pb-1.5 pr-3 font-medium text-muted-foreground text-xs">
										Source
									</th>
									<th className="pb-1.5 pr-3 font-medium text-muted-foreground text-xs">
										Amount
									</th>
									<th className="pb-1.5 font-medium text-muted-foreground text-xs">
										Status
									</th>
								</tr>
							</thead>
							<tbody>
								{commissions.map((c) => {
									const dateStr = c.createdAt
										? new Date(c.createdAt).toLocaleDateString("en-MY")
										: "—";
									const source = c.serviceName
										? c.serviceName
										: c.appointmentNumber
											? `Appt ${c.appointmentNumber.slice(0, 8)}`
											: c.salesOrderNumber
												? `Sale ${c.salesOrderNumber}`
												: "—";
									return (
										<tr key={c.id} className="border-b last:border-0">
											<td className="py-1.5 pr-3 text-muted-foreground text-xs whitespace-nowrap">
												{dateStr}
											</td>
											<td className="py-1.5 pr-3 text-xs max-w-[120px] truncate">
												{source}
											</td>
											<td className="py-1.5 pr-3 tabular-nums text-xs whitespace-nowrap">
												{formatPrice(c.calculatedAmount, "MYR")}
											</td>
											<td className="py-1.5">
												<StatusBadge status={c.status as CanonicalStatus} />
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
