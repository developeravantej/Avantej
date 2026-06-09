import { UserX } from "lucide-react";
import { CustomerStep } from "@/components/pos/customer-step";
import type { CustomerType, SelectedCustomer } from "@/components/pos/types";
import { StepCard, LockedBadge } from "./step-primitives";

interface CustomerStepCardProps {
	state: "done" | "active" | "idle";
	stepNumber: number;
	stepLabel: string;
	customerTypeMode: CustomerType;
	customerLabel: string | null;
	customerInitials: string;
	hasCustomer: boolean;
	selectedCustomer: SelectedCustomer | null;
	organizationId: string;
	resolvedBranchId: string | null;
	onEdit: () => void;
	onCustomerTypeModeChange: (mode: CustomerType) => void;
	onCustomerSelect: (customer: SelectedCustomer) => void;
	onCustomerClear: () => void;
	onContinue: () => void;
}

export function CustomerStepCard({
	state,
	stepNumber,
	stepLabel,
	customerTypeMode,
	customerLabel,
	customerInitials,
	hasCustomer,
	selectedCustomer,
	organizationId,
	resolvedBranchId,
	onEdit,
	onCustomerTypeModeChange,
	onCustomerSelect,
	onCustomerClear,
	onContinue,
}: CustomerStepCardProps) {
	return (
		<StepCard
			n={stepNumber}
			label="Customer"
			stepLabel={stepLabel}
			state={state}
			badge={<LockedBadge />}
			onEdit={onEdit}
		>
			{/* Active content */}
			{state === "active" && (
				<div className="flex flex-col gap-4">
					{/* Mode toggle */}
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => onCustomerTypeModeChange("member")}
							className={
								customerTypeMode === "member"
									? "rounded-[10px] px-4 py-2 text-sm font-semibold transition-all bg-[#0a0a0a] text-white"
									: "rounded-[10px] px-4 py-2 text-sm font-semibold transition-all border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:border-[#a3a3a3]"
							}
						>
							Member
						</button>
						<button
							type="button"
							onClick={() => onCustomerTypeModeChange("walk_in")}
							className={
								customerTypeMode === "walk_in"
									? "rounded-[10px] px-4 py-2 text-sm font-semibold transition-all bg-[#0a0a0a] text-white"
									: "rounded-[10px] px-4 py-2 text-sm font-semibold transition-all border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:border-[#a3a3a3]"
							}
						>
							Walk-in
						</button>
					</div>

					{customerTypeMode === "member" && (
						<CustomerStep
							organizationId={organizationId}
							branchId={resolvedBranchId}
							selected={selectedCustomer}
							onSelect={onCustomerSelect}
							onClear={onCustomerClear}
						/>
					)}

					{customerTypeMode === "walk_in" && (
						<div className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d6cdb1]">
								<UserX className="h-5 w-5 text-[#0a0a0a]" />
							</div>
							<div>
								<p className="text-sm font-semibold text-[#0a0a0a]">
									Anonymous Walk-in
								</p>
								<p className="text-xs text-[#737373]">
									No customer record will be saved for this sale.
								</p>
							</div>
						</div>
					)}

					{/* Continue button */}
					<div className="flex justify-end pt-1">
						<button
							type="button"
							disabled={!hasCustomer}
							onClick={onContinue}
							className="rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-35"
						>
							Continue to Items →
						</button>
					</div>
				</div>
			)}

			{/* Done summary */}
			{state === "done" && (
				<div className="flex items-center gap-3 rounded-xl bg-[#f3f3f3] px-3 py-2.5">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d6cdb1] text-xs font-bold text-[#0a0a0a]">
						{customerInitials}
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-semibold text-[#0a0a0a]">
							{customerLabel}
						</p>
						<p className="text-[11px] text-[#737373]">
							{customerTypeMode === "member" ? "Member" : "Walk-in"}
						</p>
					</div>
					<span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[10px] font-semibold text-[#15803d]">
						Active
					</span>
				</div>
			)}
		</StepCard>
	);
}
