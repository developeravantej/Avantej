/**
 * Platform Admin — Coupon catalog list (Plan F.3.5 — Agent C2).
 *
 * Stateless grid renderer used by the coupon catalog page (Agent G) and by
 * any other surface that wants to display the catalog. Parent owns the
 * data — this component only renders + raises callbacks.
 */

import { Trash2, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type Coupon = {
	id: string;
	name: string | null;
	percentOff: number | null;
	amountOff: number | null;
	currency: string | null;
	duration: "once" | "repeating" | "forever";
	durationInMonths: number | null;
	maxRedemptions: number | null;
	timesRedeemed: number;
	valid: boolean;
};

function fmtDiscount(c: Coupon): string {
	if (c.percentOff != null) return `${c.percentOff}% off`;
	if (c.amountOff != null) {
		const symbol = (c.currency ?? "usd").toUpperCase();
		return `$${(c.amountOff / 100).toFixed(2)} ${symbol} off`;
	}
	return "—";
}

function fmtDuration(c: Coupon): string {
	if (c.duration === "once") return "Once";
	if (c.duration === "forever") return "Forever";
	return c.durationInMonths
		? `${c.durationInMonths} month${c.durationInMonths === 1 ? "" : "s"}`
		: "Repeating";
}

export function CouponListPanel({
	coupons,
	isSuperAdmin,
	onCreate,
	onDelete,
	hasMore,
	onLoadMore,
	isLoading,
}: {
	coupons: Coupon[];
	isSuperAdmin: boolean;
	onCreate?: () => void;
	onDelete?: (couponId: string) => void;
	hasMore?: boolean;
	onLoadMore?: () => void;
	isLoading?: boolean;
}) {
	return (
		<div className="space-y-4" data-testid="coupon-list-panel">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">Coupons</h2>
					<p className="text-xs text-muted-foreground">
						Stripe-backed catalog. Used to discount tenant subscriptions.
					</p>
				</div>
				{isSuperAdmin && onCreate ? (
					<Button
						type="button"
						onClick={onCreate}
						data-testid="coupon-create-btn"
					>
						<Tag className="h-4 w-4 mr-1" />
						New coupon
					</Button>
				) : null}
			</div>

			{isLoading && coupons.length === 0 ? (
				<div className="text-sm text-muted-foreground p-4">
					Loading coupons…
				</div>
			) : coupons.length === 0 ? (
				<div
					className="text-sm text-muted-foreground p-6 border rounded-md text-center"
					data-testid="coupon-list-empty"
				>
					No coupons yet.{" "}
					{isSuperAdmin
						? "Click “New coupon” to create one."
						: "Ask a super_admin to create one."}
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{coupons.map((c) => (
						<Card
							key={c.id}
							data-testid={`coupon-card-${c.id}`}
							className="relative"
						>
							<CardHeader className="pb-2">
								<CardTitle className="text-sm flex items-center justify-between gap-2">
									<span className="truncate">
										{c.name ?? <span className="font-mono text-xs">{c.id}</span>}
									</span>
									{c.valid ? (
										<Badge variant="outline" className="text-emerald-600 border-emerald-600/50">
											valid
										</Badge>
									) : (
										<Badge variant="outline" className="text-muted-foreground">
											invalid
										</Badge>
									)}
								</CardTitle>
							</CardHeader>
							<CardContent className="text-xs space-y-1">
								<div className="text-base font-medium text-foreground">
									{fmtDiscount(c)}
								</div>
								<div className="text-muted-foreground">
									Duration: {fmtDuration(c)}
								</div>
								<div className="text-muted-foreground">
									Redemptions: {c.timesRedeemed}
									{c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
								</div>
								<div className="font-mono text-[10px] text-muted-foreground break-all pt-1">
									{c.id}
								</div>
								{isSuperAdmin && onDelete ? (
									<div className="pt-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => onDelete(c.id)}
											data-testid={`coupon-delete-btn-${c.id}`}
										>
											<Trash2 className="h-3.5 w-3.5 mr-1" />
											Delete
										</Button>
									</div>
								) : null}
							</CardContent>
						</Card>
					))}
				</div>
			)}

			{hasMore && onLoadMore ? (
				<div className="flex justify-center">
					<Button
						type="button"
						variant="outline"
						onClick={onLoadMore}
						data-testid="coupon-load-more-btn"
					>
						Load more
					</Button>
				</div>
			) : null}
		</div>
	);
}
