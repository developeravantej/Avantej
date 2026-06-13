import { useQuery } from "@tanstack/react-query";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading-spinner";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";

export interface ScheduleDialogTarget {
	packageInstanceId: string;
	purchaseNumber: string | null;
	customerName: string | null;
	serviceName: string | null;
}

export interface InstallmentScheduleDialogProps {
	organizationId: string;
	target: ScheduleDialogTarget | null;
	onClose: () => void;
}

function fmtDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	return new Date(value).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

const STATUS_STYLES: Record<string, string> = {
	paid: "bg-emerald-50 text-emerald-700",
	pending: "bg-blue-50 text-blue-700",
	overdue: "bg-amber-50 text-amber-700",
	waived: "bg-neutral-100 text-neutral-600",
	cancelled: "bg-neutral-100 text-neutral-500",
};

export function InstallmentScheduleDialog({
	organizationId,
	target,
	onClose,
}: InstallmentScheduleDialogProps) {
	const { data, isLoading } = useQuery({
		queryKey: [
			"sales-installments-schedule",
			organizationId,
			target?.packageInstanceId,
		],
		queryFn: () =>
			client.installments.listByPackageInstance({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
			}),
		enabled: !!organizationId && !!target?.packageInstanceId,
	});

	const rows = data ?? [];

	return (
		<Dialog
			open={!!target}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INSTALLMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Payment Schedule
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `${target.customerName ?? "Customer"}${target.serviceName ? ` — ${target.serviceName}` : ""}${target.purchaseNumber ? ` (${target.purchaseNumber})` : ""}`
							: "Full installment schedule for this package."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-6 overflow-y-auto">
					{isLoading ? (
						<PageLoader />
					) : rows.length === 0 ? (
						<p className="py-8 text-center text-sm text-[#737373]">
							No installments found for this package.
						</p>
					) : (
						<div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
							<table className="w-full text-sm">
								<thead className="bg-[#f3f3f3]/60">
									<tr>
										<th className="px-3 py-2 text-left font-medium text-[#737373]">
											#
										</th>
										<th className="px-3 py-2 text-right font-medium text-[#737373]">
											Amount
										</th>
										<th className="px-3 py-2 text-left font-medium text-[#737373]">
											Due Date
										</th>
										<th className="px-3 py-2 text-left font-medium text-[#737373]">
											Paid At
										</th>
										<th className="px-3 py-2 text-left font-medium text-[#737373]">
											Status
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[#e5e5e5]">
									{rows.map((inst) => {
										const rescheduled = !!inst.originalDueDate;
										return (
											<tr key={inst.id} className="hover:bg-[#fafafa]">
												<td className="px-3 py-2 font-medium tabular-nums">
													{inst.installmentNumber}
												</td>
												<td className="px-3 py-2 text-right tabular-nums">
													{formatPrice(
														(inst.amount ?? 0) + (inst.taxAmount ?? 0),
														"MYR",
													)}
												</td>
												<td className="px-3 py-2">
													{rescheduled ? (
														<div className="flex flex-col">
															<span className="text-[11px] text-[#a3a3a3] line-through">
																{fmtDate(inst.originalDueDate)}
															</span>
															<span className="text-[#0a0a0a]">
																{fmtDate(inst.dueDate)}
																<span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
																	Rescheduled
																</span>
															</span>
														</div>
													) : (
														fmtDate(inst.dueDate)
													)}
												</td>
												<td className="px-3 py-2">{fmtDate(inst.paidAt)}</td>
												<td className="px-3 py-2">
													<span
														className={cn(
															"rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
															STATUS_STYLES[inst.status] ??
																"bg-neutral-100 text-neutral-600",
														)}
													>
														{inst.status}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
