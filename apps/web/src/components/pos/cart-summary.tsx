import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/currency";
import type { CartItem } from "./types";

interface CartSummaryProps {
	items: CartItem[];
	discountCents: number;
	taxRateBps: number;
	paymentMethod: "cash" | "card" | "bank_transfer" | null;
	amountTenderedCents: number;
}

function calcTotals(
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

export function CartSummary({
	items,
	discountCents,
	taxRateBps,
	paymentMethod,
	amountTenderedCents,
}: CartSummaryProps) {
	const { subtotalCents, taxCents, totalCents } = calcTotals(
		items,
		discountCents,
		taxRateBps,
	);
	const changeDueCents =
		paymentMethod === "cash" && amountTenderedCents > totalCents
			? amountTenderedCents - totalCents
			: 0;

	return (
		<div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
			<h3 className="font-semibold text-base">Cart Summary</h3>

			{/* Line items */}
			{items.length === 0 ? (
				<p className="py-4 text-center text-muted-foreground text-sm">
					No items added yet
				</p>
			) : (
				<div className="space-y-2">
					{items.map((item) => (
						<div
							key={item.id}
							className="flex items-start justify-between gap-2 text-sm"
						>
							<span className="flex-1 truncate text-foreground">
								{item.description}
								{item.quantity > 1 && (
									<span className="text-muted-foreground">
										{" "}
										×{item.quantity}
									</span>
								)}
							</span>
							<span className="shrink-0 tabular-nums">
								{formatPrice(item.unitPriceCents * item.quantity, "MYR")}
							</span>
						</div>
					))}
				</div>
			)}

			<Separator />

			{/* Totals */}
			<div className="space-y-2 text-sm">
				<div className="flex justify-between">
					<span className="text-muted-foreground">Subtotal</span>
					<span className="tabular-nums">
						{formatPrice(subtotalCents, "MYR")}
					</span>
				</div>

				{discountCents > 0 && (
					<div className="flex justify-between text-green-600">
						<span>Discount</span>
						<span className="tabular-nums">
							−{formatPrice(discountCents, "MYR")}
						</span>
					</div>
				)}

				{taxRateBps > 0 && (
					<div className="flex justify-between text-muted-foreground">
						<span>Tax ({(taxRateBps / 100).toFixed(0)}%)</span>
						<span className="tabular-nums">{formatPrice(taxCents, "MYR")}</span>
					</div>
				)}

				<Separator />

				<div className="flex justify-between font-semibold text-base">
					<span>Total</span>
					<span className="tabular-nums">{formatPrice(totalCents, "MYR")}</span>
				</div>

				{paymentMethod === "cash" && amountTenderedCents > 0 && (
					<>
						<div className="flex justify-between text-muted-foreground">
							<span>Tendered</span>
							<span className="tabular-nums">
								{formatPrice(amountTenderedCents, "MYR")}
							</span>
						</div>
						{changeDueCents >= 0 && (
							<div
								className={`flex justify-between font-medium ${
									changeDueCents < 0 ? "text-destructive" : "text-green-700"
								}`}
							>
								<span>Change Due</span>
								<span className="tabular-nums">
									{formatPrice(Math.abs(changeDueCents), "MYR")}
								</span>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
