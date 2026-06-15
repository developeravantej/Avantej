/**
 * Platform Admin — Coupon apply/remove card (Plan F.3.5 — Agent C2).
 *
 * Mounted on the tenant Billing tab. Reads the tenant's currently attached
 * coupon + the catalog (for the picker) and lets super_admins attach or
 * detach. Tolerant of dev-DB / Stripe failures: when reads fail, the card
 * still renders but disables actions.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TicketPercent } from "lucide-react";
import { client } from "@/utils/orpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

function fmtDiscount(c: {
	percentOff: number | null;
	amountOff: number | null;
	currency: string | null;
}): string {
	if (c.percentOff != null) return `${c.percentOff}% off`;
	if (c.amountOff != null) {
		return `$${(c.amountOff / 100).toFixed(2)} ${(c.currency ?? "usd").toUpperCase()} off`;
	}
	return "—";
}

export function CouponApplyCard({
	organizationId,
	isSuperAdmin,
	onChanged,
}: {
	organizationId: string;
	isSuperAdmin: boolean;
	onChanged?: () => void;
}) {
	const qc = useQueryClient();
	const currentKey = [
		"platformAdminCoupons",
		"getCustomerCoupon",
		organizationId,
	] as const;
	const catalogKey = ["platformAdminCoupons", "listCoupons"] as const;

	const current = useQuery({
		queryKey: currentKey,
		queryFn: () =>
			client.platformAdminCoupons.getCustomerCoupon({ organizationId }),
		retry: false,
	});

	const catalog = useQuery({
		queryKey: catalogKey,
		queryFn: () => client.platformAdminCoupons.listCoupons({ limit: 50 }),
		retry: false,
	});

	const [pendingCouponId, setPendingCouponId] = useState<string>("");

	const applyMutation = useMutation({
		mutationFn: (couponId: string) =>
			client.platformAdminCoupons.applyCoupon({
				organizationId,
				couponId,
			}),
		onSuccess: () => {
			toast.success("Coupon applied");
			setPendingCouponId("");
			qc.invalidateQueries({ queryKey: currentKey });
			onChanged?.();
		},
		onError: (e: unknown) =>
			toast.error(`Apply failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const removeMutation = useMutation({
		mutationFn: () =>
			client.platformAdminCoupons.removeCoupon({ organizationId }),
		onSuccess: () => {
			toast.success("Coupon removed");
			qc.invalidateQueries({ queryKey: currentKey });
			onChanged?.();
		},
		onError: (e: unknown) =>
			toast.error(`Remove failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const attached = current.data?.coupon ?? null;
	const availableCoupons = (catalog.data?.coupons ?? []).filter((c) => c.valid);

	return (
		<Card data-testid="coupon-apply-card">
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<TicketPercent className="h-4 w-4" />
					Coupon
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				{current.isLoading ? (
					<div className="text-muted-foreground">Loading coupon…</div>
				) : current.error ? (
					<div className="text-destructive text-xs">
						{(current.error as Error)?.message ?? "Failed to load coupon"}
					</div>
				) : attached ? (
					<div className="flex items-center justify-between gap-2">
						<div className="space-y-0.5">
							<div className="flex items-center gap-2">
								<Badge variant="outline" data-testid="coupon-attached-badge">
									{attached.name ?? attached.id}
								</Badge>
								<span className="text-muted-foreground">
									{fmtDiscount(attached)}
								</span>
							</div>
							<div className="font-mono text-[10px] text-muted-foreground break-all">
								{attached.id}
							</div>
						</div>
						{isSuperAdmin ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={removeMutation.isPending}
								onClick={() => removeMutation.mutate()}
								data-testid="coupon-remove-btn"
							>
								{removeMutation.isPending ? "Removing…" : "Remove"}
							</Button>
						) : null}
					</div>
				) : (
					<div className="space-y-2">
						<div className="text-muted-foreground">
							No coupon attached to this customer.
						</div>
						{isSuperAdmin ? (
							<div className="flex items-end gap-2">
								<div className="flex-1">
									<label className="text-xs uppercase tracking-wide text-muted-foreground">
										Apply coupon
									</label>
									<Select
										value={pendingCouponId}
										onValueChange={(v) => setPendingCouponId(v)}
									>
										<SelectTrigger
											className="mt-1"
											data-testid="coupon-apply-select"
										>
											<SelectValue
												placeholder={
													availableCoupons.length === 0
														? "No coupons in catalog"
														: "Pick a coupon…"
												}
											/>
										</SelectTrigger>
										<SelectContent>
											{availableCoupons.map((c) => (
												<SelectItem
													key={c.id}
													value={c.id}
													data-testid={`coupon-apply-option-${c.id}`}
												>
													{(c.name ?? c.id) + " — " + fmtDiscount(c)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<Button
									type="button"
									disabled={!pendingCouponId || applyMutation.isPending}
									onClick={() => applyMutation.mutate(pendingCouponId)}
									data-testid="coupon-apply-btn"
								>
									{applyMutation.isPending ? "Applying…" : "Apply"}
								</Button>
							</div>
						) : (
							<div className="text-xs text-muted-foreground">
								Coupon attach requires super_admin role.
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
