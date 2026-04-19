import { useMutation } from "@tanstack/react-query";
import { Tag, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { client } from "@/utils/orpc";
import type { AppliedPromo, CartItem } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcSubtotalCents(items: CartItem[]): number {
	return items.reduce(
		(acc, item) => acc + item.unitPriceCents * item.quantity,
		0,
	);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PromoStepProps {
	organizationId: string;
	customerId: string;
	branchId: string | null;
	items: CartItem[];
	applied: AppliedPromo | null;
	onApply: (promo: AppliedPromo) => void;
	onRemove: () => void;
}

export function PromoStep({
	organizationId,
	customerId,
	branchId,
	items,
	applied,
	onApply,
	onRemove,
}: PromoStepProps) {
	const [code, setCode] = useState(applied?.code ?? "");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const subtotalCents = calcSubtotalCents(items);
	const serviceIds = items
		.filter((i) => i.refId && (i.type === "service" || i.type === "package"))
		.map((i) => i.refId as string);

	const validateMutation = useMutation({
		mutationFn: async (promoCode: string) => {
			return client.promotions.validate({
				organizationId,
				code: promoCode.trim(),
				customerId,
				orderAmount: subtotalCents,
				serviceIds: serviceIds.length > 0 ? serviceIds : undefined,
				branchId: branchId ?? undefined,
			});
		},
		onSuccess: (data) => {
			setErrorMsg(null);
			// validatePromoCode returns { promotion, discountAmount }
			onApply({
				code: code.trim(),
				promotionId: data.promotion.id,
				discountCents: data.discountAmount,
				description:
					data.promotion.description ??
					data.promotion.name ??
					"Discount applied",
			});
		},
		onError: (err) => {
			setErrorMsg(err instanceof Error ? err.message : "Invalid promo code.");
		},
	});

	function handleApply(e: React.FormEvent) {
		e.preventDefault();
		if (!code.trim()) return;
		setErrorMsg(null);
		validateMutation.mutate(code);
	}

	function handleRemove() {
		setCode("");
		setErrorMsg(null);
		onRemove();
	}

	// ── Render: applied state ─────────────────────────────────────────────────

	if (applied) {
		return (
			<div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
				<Tag className="h-4 w-4 shrink-0 text-green-600" />
				<div className="min-w-0 flex-1">
					<p className="font-medium font-mono text-green-800 text-sm">
						{applied.code}
					</p>
					<p className="text-green-700 text-xs">{applied.description}</p>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-7 w-7 shrink-0 text-green-700 hover:text-green-900"
					onClick={handleRemove}
					aria-label="Remove promo code"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
		);
	}

	// ── Render: input state ───────────────────────────────────────────────────

	return (
		<form onSubmit={handleApply} className="space-y-3">
			<div className="flex items-end gap-2">
				<div className="flex-1 space-y-1.5">
					<Label htmlFor="promo-code">Promo code</Label>
					<Input
						id="promo-code"
						placeholder="SAVE10"
						value={code}
						onChange={(e) => {
							setCode(e.target.value.toUpperCase());
							setErrorMsg(null);
						}}
						className={errorMsg ? "border-destructive" : ""}
					/>
					{errorMsg && <p className="text-destructive text-xs">{errorMsg}</p>}
				</div>
				<Button
					type="submit"
					variant="secondary"
					disabled={
						!code.trim() || validateMutation.isPending || items.length === 0
					}
				>
					{validateMutation.isPending ? "Applying..." : "Apply"}
				</Button>
			</div>

			{items.length === 0 && (
				<p className="text-muted-foreground text-xs">
					Add items first to apply a promo code.
				</p>
			)}
		</form>
	);
}
