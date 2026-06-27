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

/**
 * Scope-switcher seed for the POS recording branch (WRITE path).
 *
 * POS is special: the scope switcher is NOT a read filter here. The sale still
 * records under its own explicit per-operation branch. This helper only
 * SEEDS that branch's default from the active scope, and ONLY when the active
 * scope is a concrete LEAF BRANCH (`type === "branch"`).
 *
 * Returns the branch id to seed with, or `null` when no seed should apply:
 *   - `scopeNodeId` undefined  → "All" scope → no seed (cashier picks/keeps default)
 *   - scope node not a branch  → region/country/state/etc → no seed (never auto-pick
 *                                a sale under a non-leaf node)
 *   - scope node not found     → defensive null
 *
 * The caller treats this purely as a default; the recording branch stays
 * user-confirmable (a customer's own branch still takes precedence, and the
 * cashier confirms before recording).
 */
export function deriveScopeLeafBranchId(
	scopeNodeId: string | undefined,
	scopeNodes: ReadonlyArray<{ id: string; type: string }>,
): string | null {
	if (!scopeNodeId) return null;
	const node = scopeNodes.find((n) => n.id === scopeNodeId);
	if (!node) return null;
	return node.type === "branch" ? node.id : null;
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
