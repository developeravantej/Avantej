import { Link } from "@tanstack/react-router";
import type { RefundRow } from "@/features/refunds/refunds.types";

// ─── Grid column template ──────────────────────────────────────────────────────

export const COL_TEMPLATE = "2fr 1fr 1fr 120px 90px 80px";

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timeAgo(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		const diff = Date.now() - new Date(value).getTime();
		const days = Math.floor(diff / 86_400_000);
		if (days === 0) return "today";
		if (days === 1) return "yesterday";
		return `${days} days ago`;
	} catch {
		return "—";
	}
}

export function formatDateTime(
	value: string | Date | null | undefined,
): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

export function initials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((p) => p[0] ?? "")
		.join("")
		.toUpperCase();
}

export function saleRef(refund: RefundRow): string {
	if (refund.salesOrderNumber) return refund.salesOrderNumber;
	if (refund.salesOrderId) return refund.salesOrderId.slice(0, 8);
	if (refund.paymentId) return refund.paymentId.slice(0, 8);
	if (refund.packageInstanceId) return refund.packageInstanceId.slice(0, 8);
	return "—";
}

export function saleRefLink(refund: RefundRow) {
	const label = saleRef(refund);
	if (refund.salesOrderId) {
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: refund.salesOrderId }}
				className="font-mono text-xs text-blue-600 hover:underline"
				onClick={(e) => e.stopPropagation()}
			>
				{label}
			</Link>
		);
	}
	return <span className="font-mono text-xs text-[#737373]">{label}</span>;
}
