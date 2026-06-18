import { useQuery } from "@tanstack/react-query";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/features/refunds/refunds.helpers";
import type { AuditRow, RefundRow } from "@/features/refunds/refunds.types";
import { orpc } from "@/utils/orpc";

// ─── Audit Trail Dialog ────────────────────────────────────────────────────────

export function AuditTrailDialog({
	refund,
	open,
	onOpenChange,
	organizationId,
}: {
	refund: RefundRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
}) {
	const { data: auditData } = useQuery({
		...orpc.auditLogs.list.queryOptions({
			input: {
				organizationId,
				entityType: "refund",
				entityId: refund?.id ?? "",
				limit: 20,
				offset: 0,
			},
		}),
		enabled: open && !!refund?.id,
	});

	if (!refund) return null;
	const auditRows =
		(auditData as { rows?: AuditRow[] } | undefined)?.rows ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						REFUNDS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Audit Trail
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Event history for refund{" "}
						<span className="font-mono font-medium">{refund.refundNumber}</span>
						.
					</DialogDescription>
				</DialogHeader>
				<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[60vh]">
					<div className="py-2 space-y-3">
						{auditRows.length === 0 ? (
							<p className="text-[#737373] text-sm">No audit events found.</p>
						) : (
							<div className="relative pl-4 space-y-4">
								<span
									aria-hidden
									className="absolute left-1.5 top-2 bottom-2 w-px bg-[#edede4]"
								/>
								{auditRows.map((row: AuditRow) => (
									<div key={row.id} className="relative flex gap-3">
										<span className="absolute -left-4 top-1 h-2.5 w-2.5 rounded-full border-2 border-black bg-white" />
										<div className="flex-1 min-w-0 space-y-0.5">
											<div className="flex items-center justify-between gap-2">
												<span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 font-mono text-orange-800 text-xs">
													{row.action}
												</span>
												<span className="text-[#737373] text-xs whitespace-nowrap">
													{formatDateTime(row.createdAt)}
												</span>
											</div>
											{row.summary && (
												<p className="text-sm text-[#737373]">{row.summary}</p>
											)}
											{row.actorName && (
												<p className="text-xs text-[#737373]">
													By:{" "}
													<span className="text-[#0a0a0a]">
														{row.actorName}
													</span>
												</p>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
