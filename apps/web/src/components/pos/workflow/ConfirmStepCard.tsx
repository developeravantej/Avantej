import { Check } from "lucide-react";
import { CartSummary } from "@/components/pos/cart-summary";
import type {
	AppliedPromo,
	CartItem,
	PaymentMethod,
} from "@/components/pos/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { formatPrice } from "@/lib/money";
import { StepCard, LockedBadge } from "./step-primitives";
import { formatPaymentLabel } from "./helpers";

interface StaffMemberOption {
	id: string;
	userId?: string;
	name?: string;
	role?: string;
}

interface InstallmentPlanOption {
	id: string;
	code: string;
	numInstallments: number;
	pricePremiumBps?: number | null;
}

interface TaxRateOption {
	id: string;
	name: string;
	rateInBasisPoints: number;
}

interface ConfirmStepCardProps {
	state: "done" | "active" | "idle";
	stepNumber: number;
	stepLabel: string;
	customerLabel: string | null;
	items: CartItem[];
	paymentMethod: PaymentMethod | null;
	appliedPromo: AppliedPromo | null;
	discountCents: number;
	taxCents: number;
	taxRateBps: number;
	selectedTaxRate: TaxRateOption | undefined;
	// Installment plan display — domain invariant: show dueNowCents not totalCents
	selectedPlan: InstallmentPlanOption | undefined;
	dueNowCents: number;
	totalCents: number;
	amountTenderedCents: number;
	notes: string;
	staffMembers: StaffMemberOption[];
	soldBy: string | null;
	leadSourceUserId: string | null;
	isReadyToSubmit: boolean;
	isPending: boolean;
	onBack: () => void;
	onSoldByChange: (id: string | null) => void;
	onLeadSourceChange: (id: string | null) => void;
	onSubmit: () => void;
}

export function ConfirmStepCard({
	state,
	stepNumber,
	stepLabel,
	customerLabel,
	items,
	paymentMethod,
	appliedPromo,
	discountCents,
	taxCents,
	taxRateBps,
	selectedTaxRate,
	selectedPlan,
	dueNowCents,
	totalCents,
	amountTenderedCents,
	notes,
	staffMembers,
	soldBy,
	leadSourceUserId,
	isReadyToSubmit,
	isPending,
	onBack,
	onSoldByChange,
	onLeadSourceChange,
	onSubmit,
}: ConfirmStepCardProps) {
	return (
		<StepCard
			n={stepNumber}
			label="Confirm & Charge"
			stepLabel={stepLabel}
			state={state}
			badge={<LockedBadge />}
		>
			{state === "active" && (
				<div className="flex flex-col gap-5">
					{/* Order recap table */}
					<div className="overflow-hidden rounded-xl border border-[#e5e5e5]">
						<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
							<span className="text-sm text-[#737373]">Customer</span>
							<span className="text-sm font-semibold text-[#0a0a0a]">
								{customerLabel ?? "Walk-in"}
							</span>
						</div>
						<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
							<span className="text-sm text-[#737373]">Items</span>
							<span className="text-sm font-semibold text-[#0a0a0a]">
								{items.length} item{items.length !== 1 ? "s" : ""}
							</span>
						</div>
						<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
							<span className="text-sm text-[#737373]">Payment</span>
							<span className="text-sm font-semibold text-[#0a0a0a]">
								{formatPaymentLabel(paymentMethod)}
							</span>
						</div>
						{discountCents > 0 && (
							<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
								<span className="text-sm text-green-700">
									Discount ({appliedPromo?.code})
								</span>
								<span className="font-mono tabular-nums text-sm text-green-700">
									−{formatPrice(discountCents, "MYR")}
								</span>
							</div>
						)}
						{taxCents > 0 && (
							<div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
								<span className="text-sm text-[#737373]">
									{selectedTaxRate?.name ?? "Tax"} (
									{(taxRateBps / 100).toFixed(0)}%)
								</span>
								<span className="font-mono tabular-nums text-sm text-[#737373]">
									{formatPrice(taxCents, "MYR")}
								</span>
							</div>
						)}
						{/* DOMAIN INVARIANT: show dueNowCents (installment amount), not totalCents */}
						<div className="flex items-center justify-between bg-[#f3f3f3] px-4 py-3">
							<span className="text-base font-bold text-[#0a0a0a]">
								{selectedPlan
									? `Due Today (1/${selectedPlan.numInstallments})`
									: "Total"}
							</span>
							<span className="font-mono tabular-nums text-xl font-bold text-[#0a0a0a]">
								{formatPrice(dueNowCents, "MYR")}
							</span>
						</div>
					</div>

					{/* CartSummary (detailed line items) */}
					<CartSummary
						items={items}
						discountCents={discountCents}
						taxRateBps={taxRateBps}
						dueNowCents={dueNowCents}
						paymentMethod={paymentMethod}
						amountTenderedCents={amountTenderedCents}
					/>

					{notes && (
						<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
							<p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Notes
							</p>
							<p className="text-sm text-[#0a0a0a]">{notes}</p>
						</div>
					)}

					{/* ── Origination attribution (Task #24) ─────────────────── */}
					<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3">
						<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
							Attribution{" "}
							<span className="normal-case font-normal">(optional)</span>
						</p>
						<div className="flex flex-col gap-3">
							{/* Sold by */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-xs font-medium text-[#0a0a0a]">
									Sold by
								</Label>
								<Select
									value={soldBy ?? "none"}
									onValueChange={(v) => onSoldByChange(v === "none" ? null : v)}
								>
									<SelectTrigger className="w-full max-w-xs border-[#e5e5e5] bg-white text-sm">
										<SelectValue placeholder="No attribution" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">No attribution</SelectItem>
										{(staffMembers as StaffMemberOption[]).map((m) => (
											<SelectItem
												key={m.userId ?? m.id}
												value={m.userId ?? m.id}
											>
												{m.name ?? m.id}
												{m.role ? ` (${m.role})` : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Lead source */}
							<div className="flex flex-col gap-1.5">
								<Label className="text-xs font-medium text-[#0a0a0a]">
									Lead source{" "}
									<span className="font-normal text-[#737373]">(referrer)</span>
								</Label>
								<Select
									value={leadSourceUserId ?? "none"}
									onValueChange={(v) =>
										onLeadSourceChange(v === "none" ? null : v)
									}
								>
									<SelectTrigger className="w-full max-w-xs border-[#e5e5e5] bg-white text-sm">
										<SelectValue placeholder="None" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">None</SelectItem>
										{(staffMembers as StaffMemberOption[]).map((m) => (
											<SelectItem
												key={m.userId ?? m.id}
												value={m.userId ?? m.id}
											>
												{m.name ?? m.id}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>

					<div className="rounded-xl bg-[#f3f3f3] border border-[#e5e5e5] px-4 py-3 text-xs text-[#737373]">
						Review the order above before confirming. This action cannot be
						undone.
					</div>

					<div className="flex justify-between pt-1">
						<button
							type="button"
							onClick={onBack}
							className="rounded-[10px] border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:border-[#a3a3a3]"
						>
							← Back
						</button>
						<Button
							disabled={!isReadyToSubmit || isPending}
							onClick={onSubmit}
							className="min-w-44 rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#262626] disabled:opacity-35"
							data-testid="pos-complete-sale-button"
						>
							{isPending ? (
								<>
									<LoadingSpinner size="sm" className="mr-2" />
									Processing...
								</>
							) : (
								<>
									Charge & Confirm
									<Check className="ml-1.5 h-4 w-4" />
								</>
							)}
						</Button>
					</div>
				</div>
			)}

			{/* Locked placeholder */}
			{state === "idle" && (
				<div className="mt-4 flex h-12 items-center justify-center rounded-xl bg-[#f3f3f3] text-xs text-[#a3a3a3]">
					Complete previous steps to unlock
				</div>
			)}
		</StepCard>
	);
}
