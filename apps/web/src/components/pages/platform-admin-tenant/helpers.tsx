import { Badge } from "@/components/ui/badge";

export function fmtMinor(amountMinor: number, currency: string) {
	return `${(amountMinor / 100).toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})} ${currency.toUpperCase()}`;
}

/**
 * Payment-status badge. `paymentStatus` is not a CanonicalStatus (no
 * `suspended`/`failed` in StatusBadge's union), so we map to §2.3 status
 * classes directly via the shared Badge primitive (§7.4).
 */
export function PaymentStatusBadge({ status }: { status: string }) {
	const classMap: Record<string, string> = {
		active: "border-green-300 bg-green-50 text-green-700",
		suspended: "border-yellow-200 bg-yellow-50 text-yellow-800",
		failed: "border-red-200 bg-red-50 text-red-700",
		cancelled: "border-red-200 bg-red-50 text-red-700",
	};
	return (
		<Badge variant="outline" className={classMap[status]}>
			{status}
		</Badge>
	);
}
