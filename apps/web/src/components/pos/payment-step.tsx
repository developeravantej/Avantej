import { useQuery } from "@tanstack/react-query";
import { Banknote, Check, CreditCard, Landmark, Link2 } from "lucide-react";
import { useEffect } from "react";

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
		method: "manual_transfer" as const,
		label: "Bank Transfer",
		subtitle: "Reference required",
		icon: Landmark,
	},
	{
		method: "online" as const,
		label: "Online (Stripe link)",
		subtitle: "Send a payment link",
		icon: Link2,
	},
];

// ─── Component ────────────────────────────────────────────────────────────────

interface PaymentStepProps {
	organizationId: string;
	items: CartItem[];
	discountCents: number;
	taxRateBps: number;
	/** Pre-computed due-now amount from pos-workflow (first instalment or full total). */
	dueNowCents: number;
	method: PaymentMethod | null;
	paymentReference: string;
	amountTenderedCents: number;
	/** Whether the cashier has manually edited the tendered amount. */
	tenderedTouched: boolean;
	selectedInstallmentPlanId: string | null;
	/** Preferred trainer UUID for package purchase — optional. */
	preferredTrainerId: string | null;
	onMethodChange: (method: PaymentMethod) => void;
	onReferenceChange: (ref: string) => void;
	onAmountTenderedChange: (cents: number) => void;
	/** Called when the cashier manually edits the tendered amount. */
	onTenderedTouched: () => void;
	onInstallmentPlanChange: (planId: string | null) => void;
	onPreferredTrainerChange: (trainerId: string | null) => void;
}

export function PaymentStep({
	organizationId,
	items,
	discountCents,
	taxRateBps,
	dueNowCents,
	method,
	paymentReference,
	amountTenderedCents,
	tenderedTouched,
	selectedInstallmentPlanId,
	preferredTrainerId,
	onMethodChange,
	onReferenceChange,
	onAmountTenderedChange,
	onTenderedTouched,
	onInstallmentPlanChange,
	onPreferredTrainerChange,
}: PaymentStepProps) {
	const totalCents = calcTotalCents(items, discountCents, taxRateBps);
	const amountTenderedRm =
		amountTenderedCents > 0 ? centsToRm(amountTenderedCents) : "";

	const packageItems = items.filter((i) => i.type === "package" || i.type === "service");
	const showInstallmentPicker = packageItems.length >= 1;

	// Fetch plans + trainer list up-front (hooks must come before any derived consts that use them)
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

	// Trainer list — only fetched when a package item is in the cart
	const { data: trainers = [] } = useQuery({
		queryKey: ["members-trainers", organizationId],
		queryFn: () => client.members.list({ organizationId, role: "trainer", status: "active" }),
		enabled: showInstallmentPicker,
	});

	const planOptions: InstallmentPlanOption[] = installmentPlans.map((p) => ({
		id: p.id,
		code: p.code,
		name: p.name,
		numInstallments: p.numInstallments,
		pricePremiumBps: p.pricePremiumBps ?? 0,
	}));

	const selectedPlanOption = planOptions.find((p) => p.id === selectedInstallmentPlanId) ?? null;
	// dueNowCents is computed in pos-workflow and passed as a prop (FE-M1)

	useEffect(() => {
		// Keep cash tendered synced to the due-now amount until the user edits it. The default tax
		// rate loads asynchronously; without this, an auto-tendered PRE-TAX amount falls
		// below the taxed total and silently disables Confirm with no on-screen reason.
		// tenderedTouched is lifted to pos-workflow (FE-M2) so it survives remounts.
		if (
			method === "cash" &&
			!tenderedTouched &&
			dueNowCents > 0 &&
			amountTenderedCents !== dueNowCents
		) {
			// react-doctor-disable-next-line react-doctor/no-prop-callback-in-effect -- tightly coupled POS step coordination, would benefit from Provider but scope deferred
			onAmountTenderedChange(dueNowCents);
		}
	}, [method, tenderedTouched, amountTenderedCents, dueNowCents, onAmountTenderedChange]);

	const changeDueCents =
		method === "cash" && amountTenderedCents >= dueNowCents
			? amountTenderedCents - dueNowCents
			: null;

	return (
		<div className="space-y-6">
			{/* Payment method cards */}
			<div className="space-y-2">
				<Label>Payment method</Label>
				<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
									<span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary">
										<Check className="size-2.5 text-primary-foreground" />
									</span>
								)}
								<Icon
									className={`size-6 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
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

			{/* Online payment callout */}
			{method === "online" && (
				<StatusCallout variant="info" title="Payment link will be generated">
					A payment link will be generated after you finalize the sale. Forward
					it to the customer to collect payment.
				</StatusCallout>
			)}

			{/* Reference input — card / bank transfer */}
			{(method === "card" || method === "manual_transfer") && (
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
								min={centsToRm(dueNowCents)}
								step="0.01"
								className="pl-9"
								placeholder={centsToRm(dueNowCents)}
								value={amountTenderedRm}
								onChange={(e) => {
									onTenderedTouched();
									onAmountTenderedChange(parseCents(e.target.value));
								}}
							/>
						</div>
						{amountTenderedCents > 0 && amountTenderedCents < dueNowCents && (
							<p className="text-destructive text-xs">
								Tendered amount is less than due today. Please collect at least{" "}
								{formatPrice(dueNowCents, "MYR")}.
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
						<SelectTrigger id="installment-plan" className="w-full max-w-xs" data-testid="pos-installment-plan-select">
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
					{selectedPlanOption && (
						<div className="rounded-lg border border-[#e5e5e5] bg-[#f9f9f9] px-3 py-2.5 text-xs space-y-1 max-w-xs">
							<div className="flex justify-between font-medium text-[#0a0a0a]">
								<span>Due today (instalment 1/{selectedPlanOption.numInstallments})</span>
								<span className="font-mono tabular-nums">{formatPrice(dueNowCents, "MYR")}</span>
							</div>
							{selectedPlanOption.pricePremiumBps > 0 && (
								<div className="flex justify-between text-[#737373]">
									<span>Total after premium ({(selectedPlanOption.pricePremiumBps / 100).toFixed(0)}%)</span>
									<span className="font-mono tabular-nums">
										{formatPrice(Math.round(totalCents * (1 + selectedPlanOption.pricePremiumBps / 10000)), "MYR")}
									</span>
								</div>
							)}
						</div>
					)}
				</div>
			)}

			{/* Preferred trainer picker — shown for package purchases */}
			{showInstallmentPicker && (
				<div className="space-y-1.5">
					<Label htmlFor="preferred-trainer">
						Preferred trainer{" "}
						<span className="font-normal text-muted-foreground">(optional)</span>
					</Label>
					<Select
						value={preferredTrainerId ?? "none"}
						onValueChange={(v) => onPreferredTrainerChange(v === "none" ? null : v)}
					>
						<SelectTrigger id="preferred-trainer" className="w-full max-w-xs">
							<SelectValue placeholder="No preference" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">No preference</SelectItem>
							{trainers.map((trainer: any) => (
								<SelectItem key={trainer.id} value={trainer.id}>
									{trainer.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{trainers.length === 0 && (
						<p className="text-muted-foreground text-xs">
							No trainers found. You can assign one later from the package detail.
						</p>
					)}
				</div>
			)}
		</div>
	);
}
