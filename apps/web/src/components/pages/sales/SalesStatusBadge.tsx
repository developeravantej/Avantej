import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";

export const STATUS_MAP: Record<
	string,
	{ status: CanonicalStatus; label?: string }
> = {
	confirmed: { status: "confirmed" },
	completed: { status: "completed" },
	paid: { status: "paid" },
	pending: { status: "pending" },
	processing: { status: "pending", label: "Processing" },
	draft: { status: "draft" },
	sent: { status: "confirmed", label: "Sent" },
	partially_paid: { status: "pending", label: "Partially Paid" },
	cancelled: { status: "cancelled" },
	rejected: { status: "rejected" },
	overdue: { status: "rejected", label: "Overdue" },
};

export function SalesStatusBadge({ status }: { status?: string | null }) {
	if (!status) return <StatusBadge status="draft" label="Unknown" />;
	const mapped = STATUS_MAP[status] ?? {
		status: "draft" as CanonicalStatus,
		label: status,
	};
	return <StatusBadge status={mapped.status} label={mapped.label} />;
}
