import { PromoStep } from "@/components/pos/promo-step";
import type {
	AppliedPromo,
	CartItem,
	CustomerType,
} from "@/components/pos/types";
import { formatPrice } from "@/lib/money";
import { StepCard, LockedBadge } from "./step-primitives";

interface PromoStepCardProps {
	state: "done" | "active" | "idle";
	stepNumber: number;
	stepLabel: string;
	organizationId: string;
	customerTypeMode: CustomerType;
	selectedCustomerId: string | null;
	resolvedBranchId: string | null;
	items: CartItem[];
	appliedPromo: AppliedPromo | null;
	discountCents: number;
	onEdit: () => void;
	onApply: (promo: AppliedPromo) => void;
	onRemove: () => void;
	onBack: () => void;
	onContinue: () => void;
}

export function PromoStepCard({
	state,
	stepNumber,
	stepLabel,
	organizationId,
	customerTypeMode,
	selectedCustomerId,
	resolvedBranchId,
	items,
	appliedPromo,
	discountCents,
	onEdit,
	onApply,
	onRemove,
	onBack,
	onContinue,
}: PromoStepCardProps) {
	return (
		<StepCard
			n={stepNumber}
			label="Promotions & Discounts"
			stepLabel={stepLabel}
			state={state}
			badge={<LockedBadge />}
			onEdit={onEdit}
		>
			{state === "active" && (
				<div className="flex flex-col gap-4">
					<PromoStep
						organizationId={organizationId}
						customerId={
							customerTypeMode === "member"
								? (selectedCustomerId ?? "")
								: "anonymous"
						}
						branchId={resolvedBranchId}
						items={items}
						applied={appliedPromo}
						onApply={onApply}
						onRemove={onRemove}
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
							onClick={onContinue}
							className="rounded-xl bg-[#0a0a0a] px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#262626]"
						>
							Continue to Payment →
						</button>
					</div>
				</div>
			)}

			{/* Done summary */}
			{state === "done" && (
				<div className="mt-3">
					{appliedPromo ? (
						<div className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2">
							<span className="text-sm font-semibold text-[#0a0a0a]">
								{appliedPromo.code}
							</span>
							<span className="font-mono tabular-nums text-sm font-semibold text-green-700">
								−{formatPrice(discountCents, "MYR")}
							</span>
						</div>
					) : (
						<p className="text-sm text-[#737373]">No promotion applied</p>
					)}
				</div>
			)}
		</StepCard>
	);
}
