import { ShoppingCart } from "lucide-react";
import { formatPrice } from "@/lib/money";
import type { CartItem } from "./types";

interface CartSummaryProps {
	items: CartItem[];
	discountCents: number;
	taxRateBps: number;
	paymentMethod: "cash" | "card" | "bank_transfer" | "online" | null;
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
		paymentMethod === "cash" && amountTenderedCents >= totalCents
			? amountTenderedCents - totalCents
			: null;

	return (
		<div className="overflow-hidden rounded-2xl shadow-xl">
			{/* Dark header */}
			<div className="bg-zinc-900 px-5 pt-5 pb-4">
				<p className="font-medium text-xs text-zinc-500 uppercase tracking-widest">
					Cart
				</p>
			</div>

			{/* Items list */}
			<div className="bg-zinc-900 px-5 pb-4 min-h-[140px]">
				{items.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-10 text-zinc-600">
						<ShoppingCart className="size-9" />
						<p className="text-sm">No items added yet</p>
					</div>
				) : (
					<div className="space-y-3">
						{items.map((item) => (
							<div
								key={item.id}
								className="flex items-start justify-between gap-3"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm text-zinc-200">
										{item.description}
									</p>
									{item.quantity > 1 && (
										<p className="text-xs text-zinc-500">×{item.quantity}</p>
									)}
								</div>
								<span className="shrink-0 tabular-nums text-sm text-zinc-300">
									{formatPrice(item.unitPriceCents * item.quantity, "MYR")}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Subtotals */}
			<div className="bg-zinc-800 px-5 py-4 space-y-2">
				<div className="flex justify-between text-sm">
					<span className="text-zinc-400">Subtotal</span>
					<span className="tabular-nums text-zinc-300">
						{formatPrice(subtotalCents, "MYR")}
					</span>
				</div>

				{discountCents > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-emerald-400">Discount</span>
						<span className="tabular-nums text-emerald-400">
							−{formatPrice(discountCents, "MYR")}
						</span>
					</div>
				)}

				{taxRateBps > 0 && (
					<div className="flex justify-between text-sm">
						<span className="text-zinc-400">
							Tax ({(taxRateBps / 100).toFixed(0)}%)
						</span>
						<span className="tabular-nums text-zinc-300">
							{formatPrice(taxCents, "MYR")}
						</span>
					</div>
				)}
			</div>

			{/* Total */}
			<div className="bg-zinc-950 p-5">
				<div className="flex items-baseline justify-between">
					<span className="font-medium text-zinc-400 text-sm">Total</span>
					<span className="font-bold text-3xl text-white tabular-nums">
						{formatPrice(totalCents, "MYR")}
					</span>
				</div>

				{paymentMethod === "cash" && amountTenderedCents > 0 && (
					<div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
						<div className="flex justify-between text-sm">
							<span className="text-zinc-400">Tendered</span>
							<span className="tabular-nums text-zinc-300">
								{formatPrice(amountTenderedCents, "MYR")}
							</span>
						</div>
						{changeDueCents !== null && (
							<div className="flex justify-between">
								<span className="font-semibold text-emerald-400 text-sm">
									Change Due
								</span>
								<span className="font-bold text-emerald-400 tabular-nums text-lg">
									{formatPrice(changeDueCents, "MYR")}
								</span>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
