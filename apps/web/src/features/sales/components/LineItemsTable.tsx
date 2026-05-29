import { formatPrice } from "@/lib/money";
import type { LineItem } from "@/features/sales/sales-view.types";

export function LineItemsTable({ items }: { items: LineItem[] }) {
	if (items.length === 0) {
		return <p className="text-xs text-muted-foreground italic">No line items recorded.</p>;
	}
	return (
		<div className="space-y-1.5 text-sm">
			{items.map((item) => (
				<div key={item.id} className="flex justify-between">
					<span>
						{item.description}
						{item.quantity > 1 && (
							<span className="ml-1 text-muted-foreground text-xs">× {item.quantity}</span>
						)}
					</span>
					<span className="font-mono tabular-nums">{formatPrice(item.totalPrice, "MYR")}</span>
				</div>
			))}
			<div className="flex justify-between border-t border-border/40 pt-2 mt-2 text-sm font-semibold">
				<span>Total</span>
				<span className="font-mono tabular-nums">
					{formatPrice(
						items.reduce((s, i) => s + i.totalPrice, 0),
						"MYR",
					)}
				</span>
			</div>
		</div>
	);
}
