import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client } from "@/utils/orpc";
import type { CartItem, InstallmentPlanOption, PaymentMethod } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotalCents(
	items: CartItem[],
	discountCents: number,
	taxRateBps: number,
): number {
	const subtotal = items.reduce(
		(acc, item) => acc + item.unitPriceCents * item.quantity,
		0,
	);
	const taxBase = subtotal - discountCents;
	const taxCents = Math.floor((taxBase * taxRateBps) / 10000);
	return taxBase + taxCents;
}

function parseCents(raw: string): number {
	const n = Number.parseFloat(raw);
	if (isNaN(n) || n < 0) return 0;
	return Math.round(n * 100);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PaymentStepProps {
	organizationId: string;
	/** Items to detect package + installment visibility */
	items: CartItem[];
	discountCents: number;
	taxRateBps: number;
	method: PaymentMethod | null;
	paymentReference: string;
	amountTenderedCents: number;
	selectedInstallmentPlanId: string | null;
	onMethodChange: (method: PaymentMethod) => void;
	onReferenceChange: (ref: string) => void;
	onAmountTenderedChange: (cents: number) => void;
	onInstallmentPlanChange: (planId: string | null) => void;
}

export function PaymentStep({
	organizationId,
	items,
	discountCents,
	taxRateBps,
	method,
	paymentReference,
	amountTenderedCents,
	selectedInstallmentPlanId,
	onMethodChange,
	onReferenceChange,
	onAmountTenderedChange,
	onInstallmentPlanChange,
}: PaymentStepProps) {
	const totalCents = calcTotalCents(items, discountCents, taxRateBps);
	const amountTenderedRm =
		amountTenderedCents > 0 ? (amountTenderedCents / 100).toFixed(2) : "";

	// Show installment picker if exactly one "package" item
	const packageItems = items.filter((i) => i.type === "package");
	const showInstallmentPicker = packageItems.length === 1;

	// Load installment plans (org-wide, no serviceId filter in existing router)
	const { data: installmentPlans = [] } = useQuery({
		queryKey: ["installment-plans", organizationId],
		queryFn: async () => {
			return client.installmentPlans.list({
				organizationId,
				activeOnly: true,
			});
		},
		enabled: showInstallmentPicker,
	});

	const planOptions: InstallmentPlanOption[] = installmentPlans.map((p) => ({
		id: p.id,
		code: p.code,
		name: p.name,
		numInstallments: p.numInstallments,
	}));

	return (
		<div className="space-y-6">
			{/* Payment method */}
			<div className="space-y-2">
				<Label>Payment method</Label>
				<div className="flex flex-wrap gap-2">
					{(["cash", "card", "bank_transfer"] as const).map((m) => {
						const labels: Record<typeof m, string> = {
							cash: "Cash",
							card: "Card",
							bank_transfer: "Bank Transfer",
						};
						return (
							<button
								key={m}
								type="button"
								onClick={() => onMethodChange(m)}
								className={`rounded-md border px-4 py-2 font-medium text-sm transition-colors ${
									method === m
										? "border-primary bg-primary text-primary-foreground"
										: "border-border bg-background hover:bg-accent"
								}`}
							>
								{labels[m]}
							</button>
						);
					})}
				</div>
			</div>

			{/* Reference input — card / bank transfer */}
			{(method === "card" || method === "bank_transfer") && (
				<div className="space-y-1.5">
					<Label htmlFor="payment-ref">
						{method === "card" ? "Card auth code" : "Bank transfer reference"}
					</Label>
					<Input
						id="payment-ref"
						placeholder={method === "card" ? "AUTH123456" : "TRANSFER-REF-001"}
						value={paymentReference}
						onChange={(e) => onReferenceChange(e.target.value)}
					/>
				</div>
			)}

			{/* Cash tendered */}
			{method === "cash" && (
				<div className="space-y-1.5">
					<Label htmlFor="cash-tendered">Amount tendered (RM)</Label>
					<div className="relative max-w-xs">
						<span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground text-sm">
							RM
						</span>
						<Input
							id="cash-tendered"
							type="number"
							min={(totalCents / 100).toFixed(2)}
							step="0.01"
							className="pl-9"
							placeholder={(totalCents / 100).toFixed(2)}
							value={amountTenderedRm}
							onChange={(e) =>
								onAmountTenderedChange(parseCents(e.target.value))
							}
						/>
					</div>
					{amountTenderedCents > 0 && amountTenderedCents < totalCents && (
						<p className="text-destructive text-xs">
							Tendered amount is less than total. Please collect at least RM{" "}
							{(totalCents / 100).toFixed(2)}.
						</p>
					)}
				</div>
			)}

			{/* Installment plan picker */}
			{showInstallmentPicker && (
				<div className="space-y-1.5">
					<Label htmlFor="installment-plan">Payment plan</Label>
					<Select
						value={selectedInstallmentPlanId ?? "full"}
						onValueChange={(v) =>
							onInstallmentPlanChange(v === "full" ? null : v)
						}
					>
						<SelectTrigger id="installment-plan" className="w-full max-w-xs">
							<SelectValue placeholder="Pay in full" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="full">Pay in full</SelectItem>
							{planOptions.map((plan) => (
								<SelectItem key={plan.id} value={plan.id}>
									{plan.name} ({plan.numInstallments} instalments)
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{planOptions.length === 0 && (
						<p className="text-muted-foreground text-xs">
							No instalment plans configured. Will charge full amount.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
