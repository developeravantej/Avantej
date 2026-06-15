import type { CartItem, PaymentMethod } from "@/components/pos/types";

// ─── Pure helpers used by PosWorkflow and its sub-components ─────────────────

export function calcTotals(
	items: CartItem[],
	discountCents: number,
	taxRateBps: number,
) {
	const subtotalCents = items.reduce(
		(acc, item) => acc + item.unitPriceCents * item.quantity,
		0,
	);
	const taxBase = subtotalCents - discountCents;
	const taxCents = Math.floor((taxBase * taxRateBps) / 10000);
	const totalCents = taxBase + taxCents;
	return { subtotalCents, taxCents, totalCents };
}

export function getInitials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

export function formatPaymentLabel(method: PaymentMethod | null): string {
	if (!method) return "—";
	const labels: Record<PaymentMethod, string> = {
		cash: "Cash",
		card: "Card",
		manual_transfer: "Bank Transfer (Manual)",
		fpx: "FPX",
		stripe: "Stripe",
		online: "Online (Payment Link)",
	};
	return labels[method] ?? (method as string);
}
