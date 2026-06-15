import { PaymentStep } from "@/components/pos/payment-step";
import type { CartItem, PaymentMethod } from "@/components/pos/types";
import { StepCard, LockedBadge } from "./step-primitives";
import { formatPaymentLabel } from "./helpers";

interface PaymentStepCardProps {
	state: "done" | "active" | "idle";
	stepNumber: number;
	stepLabel: string;
	organizationId: string;
	items: CartItem[];
	discountCents: number;
	taxRateBps: number;
	dueNowCents: number;
	paymentMethod: PaymentMethod | null;
	paymentReference: string;
	amountTenderedCents: number;
	tenderedTouched: boolean;
	selectedInstallmentPlanId: string | null;
	preferredTrainerId: string | null;
	hasPaymentMethod: boolean;
	cashOk: boolean;
	onEdit: () => void;
	onMethodChange: (method: PaymentMethod) => void;
	onReferenceChange: (ref: string) => void;
	onAmountTenderedChange: (amount: number) => void;
	onTenderedTouched: () => void;
	onInstallmentPlanChange: (id: string | null) => void;
	onPreferredTrainerChange: (id: string | null) => void;
	onBack: () => void;
	onContinue: () => void;
}

export function PaymentStepCard({
	state,
	stepNumber,
	stepLabel,
	organizationId,
	items,
	discountCents,
	taxRateBps,
	dueNowCents,
	paymentMethod,
	paymentReference,
	amountTenderedCents,
	tenderedTouched,
	selectedInstallmentPlanId,
	preferredTrainerId,
	hasPaymentMethod,
	cashOk,
	onEdit,
	onMethodChange,
	onReferenceChange,
	onAmountTenderedChange,
	onTenderedTouched,
	onInstallmentPlanChange,
	onPreferredTrainerChange,
	onBack,
	onContinue,
}: PaymentStepCardProps) {
	return (
		<StepCard
			n={stepNumber}
			label="Payment Method"
			stepLabel={stepLabel}
			state={state}
			badge={<LockedBadge />}
			onEdit={onEdit}
		>
			{state === "active" && (
				<div className="flex flex-col gap-5">
					<PaymentStep
						organizationId={organizationId}
						items={items}
						discountCents={discountCents}
						taxRateBps={taxRateBps}
						dueNowCents={dueNowCents}
						method={paymentMethod}
						paymentReference={paymentReference}
						amountTenderedCents={amountTenderedCents}
						tenderedTouched={tenderedTouched}
						selectedInstallmentPlanId={selectedInstallmentPlanId}
						preferredTrainerId={preferredTrainerId}
						onMethodChange={onMethodChange}
						onReferenceChange={onReferenceChange}
						onAmountTenderedChange={onAmountTenderedChange}
						onTenderedTouched={onTenderedTouched}
						onInstallmentPlanChange={onInstallmentPlanChange}
						onPreferredTrainerChange={onPreferredTrainerChange}
					/>

					<div className="flex justify-between pt-1">
						<button
							type="button"
							onClick={onBack}
							className="rounded-[10px] border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:border-[#a3a3a3]"
						>
							← Back
						</button>
						<button
							type="button"
							disabled={!(hasPaymentMethod && cashOk)}
							onClick={onContinue}
							className="rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-35"
						>
							Review & Confirm →
						</button>
					</div>
				</div>
			)}

			{/* Done summary */}
			{state === "done" && paymentMethod && (
				<div className="mt-3 flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2">
					<span className="text-sm font-semibold text-[#0a0a0a]">
						{formatPaymentLabel(paymentMethod)}
					</span>
					{paymentReference && (
						<span className="font-mono text-xs text-[#737373]">
							Ref: {paymentReference}
						</span>
					)}
				</div>
			)}
		</StepCard>
	);
}
