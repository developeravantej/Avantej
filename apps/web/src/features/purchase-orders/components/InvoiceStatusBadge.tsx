import { StatusBadge } from "@/components/ui/status-badge";
import type { CanonicalStatus } from "@/components/ui/status-badge";

export type InvoiceStatus = "pending" | "matched" | "disputed" | "paid";

const INVOICE_STATUS_MAP: Record<InvoiceStatus, { status: CanonicalStatus; label: string }> = {
	pending:  { status: "pending",   label: "Pending" },
	matched:  { status: "approved",  label: "Matched" },
	disputed: { status: "cancelled", label: "Disputed" },
	paid:     { status: "paid",      label: "Paid" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
	const entry = INVOICE_STATUS_MAP[status as InvoiceStatus] ?? { status: "pending" as CanonicalStatus, label: status };
	return <StatusBadge status={entry.status} label={entry.label} />;
}
