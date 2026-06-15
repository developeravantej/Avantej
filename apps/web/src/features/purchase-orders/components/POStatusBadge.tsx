import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";

// Maps PO statuses to canonical StatusBadge equivalents.
// "ordered" and "partially_received" are PO-domain states not in CanonicalStatus.
const PO_STATUS_MAP: Record<
	string,
	{ status: CanonicalStatus; label?: string }
> = {
	draft: { status: "draft" },
	approved: { status: "approved" },
	ordered: { status: "confirmed", label: "Ordered" },
	partially_received: { status: "in_transit", label: "Partial" },
	received: { status: "received" },
	cancelled: { status: "cancelled" },
};

export function POStatusBadge({ status }: { status: string }) {
	const mapped = PO_STATUS_MAP[status] ?? {
		status: "draft" as CanonicalStatus,
		label: status,
	};
	return <StatusBadge status={mapped.status} label={mapped.label} />;
}
