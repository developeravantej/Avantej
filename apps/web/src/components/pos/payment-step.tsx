import { useQuery } from "@tanstack/react-query";
import { Banknote, Check, CreditCard, Landmark } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { centsToRm, formatPrice, rmToCents } from "@/lib/money";
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
	return rmToCents(n);
}

const METHOD_CONFIG = [
	{
		method: "cash" as const,
		label: "Cash",
		subtitle: "Exact change",
		icon: Banknote,
	},
	{
		method: "card" as const,
		label: "Card",
		subtitle: "Tap or swipe",
		icon: CreditCard,
	},
	{
		method: "bank_transfer" as const,
		label: "Bank Transfer",
		subtitle: "Reference required",
		icon: Landmark,
	},
];

// ─── Component ────────────────────────────────────────────────────────────────

interface PaymentStepProps {
	organizationId: string;
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
		amountTenderedCents > 0 ? centsToRm(amountTenderedCents) : "";

	const changeDueCents =
		method === "cash" && amountTenderedCents >= totalCents
			? amountTenderedCents - totalCents
			: null;

	const packageItems = items.filter((i) => i.type === "package");
	const showInstallmentPicker = packageItems.length === 1;

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
			{/* Payment method cards */}
			<div className="space-y-2">
				<Label>Payment method</Label>
				<div className="grid grid-cols-3 gap-3">
					{METHOD_CONFIG.map(({ method: m, label, subtitle, icon: Icon }) => {
						const isSelected = method === m;
						return (
							<button
								key={m}
								type="button"
								onClick={() => onMethodChange(m)}
								className={`relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
									isSelected
										? "border-primary bg-primary/5 shadow-sm"
										: "border-border bg-background hover:border-primary/40 hover:bg-accent/50"
								}`}
							>
								{isSelected && (
									<span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
										<Check className="h-2.5 w-2.5 text-primary-foreground" />
									</span>
								)}
								<Icon
									className={`h-6 w-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
								/>
								<div className="text-center">
									<p
										className={`font-semibold text-sm ${isSelected ? "text-primary" : "text-foreground"}`}
									>
										{label}
									</p>
									<p className="text-muted-foreground text-xs">{subtitle}</p>
								</div>
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
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="cash-tendered">Amount tendered (RM)</Label>
						<div className="relative max-w-xs">
							<span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground text-sm">
								RM
							</span>
							<Input
								id="cash-tendered"
								type="number"
								min={centsToRm(totalCents)}
								step="0.01"
								className="pl-9"
								placeholder={centsToRm(totalCents)}
								value={amountTenderedRm}
								onChange={(e) =>
									onAmountTenderedChange(parseCents(e.target.value))
								}
							/>
						</div>
						{amountTenderedCents > 0 && amountTenderedCents < totalCents && (
							<p className="text-destructive text-xs">
								Tendered amount is less than total. Please collect at least{" "}
								{formatPrice(totalCents, "MYR")}.
							</p>
						)}
					</div>

					{/* Prominent change due */}
					{changeDueCents !== null && (
						<StatusCallout variant="success" title="Change Due">
							<span className="font-bold text-2xl tabular-nums font-mono">
								{formatPrice(changeDueCents, "MYR")}
							</span>
						</StatusCallout>
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
