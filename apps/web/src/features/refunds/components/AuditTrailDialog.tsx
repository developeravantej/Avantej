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
import { client } from "@/utils/orpc";

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
		queryKey: ["audit-refund", organizationId, refund?.id],
		queryFn: async () => {
			if (!refund?.id) return { rows: [] };
			return client.auditLogs.list({
				organizationId,
				entityType: "refund",
				entityId: refund.id,
				limit: 20,
				offset: 0,
			});
		},
		enabled: open && !!refund?.id,
	});

	if (!refund) return null;
	const auditRows = (auditData as { rows?: AuditRow[] } | undefined)?.rows ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg overflow-y-auto max-h-[80vh]">
				<DialogHeader>
					<DialogTitle>Audit Trail</DialogTitle>
					<DialogDescription>
						Event history for refund{" "}
						<span className="font-mono font-medium">{refund.refundNumber}</span>.
					</DialogDescription>
				</DialogHeader>
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
												<span className="text-[#0a0a0a]">{row.actorName}</span>
											</p>
										)}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
