import { ItemsStep } from "@/components/pos/items-step";
import { TrainerPickerStep } from "@/components/pos/trainer-picker-step";
import type {
	CartItem,
	CustomerType,
	ItemTrainerAssignments,
	SelectedCustomer,
	TaxRateOption,
} from "@/components/pos/types";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/money";
import { StepCard, LockedBadge } from "./step-primitives";

interface ItemsStepCardProps {
	state: "done" | "active" | "idle";
	stepNumber: number;
	stepLabel: string;
	hideCustomerStep: boolean;
	customerLabel: string | null;
	customerInitials: string;
	customerTypeMode: CustomerType;
	organizationId: string;
	selectedCustomer: SelectedCustomer | null;
	items: CartItem[];
	hasServiceItems: boolean;
	trainerAssignments: ItemTrainerAssignments;
	taxRates: TaxRateOption[];
	selectedTaxRateId: string | null;
	notes: string;
	hasItems: boolean;
	onEdit: () => void;
	onGoToCustomer: () => void;
	onAddItem: (item: CartItem) => void;
	onUpdateItem: (id: string, patch: Partial<CartItem>) => void;
	onRemoveItem: (id: string) => void;
	onTrainerAssignmentsChange: (assignments: ItemTrainerAssignments) => void;
	onTaxRateChange: (id: string | null) => void;
	onNotesChange: (notes: string) => void;
	onContinue: () => void;
}

export function ItemsStepCard({
	state,
	stepNumber,
	stepLabel,
	hideCustomerStep,
	customerLabel,
	customerInitials,
	customerTypeMode,
	organizationId,
	selectedCustomer,
	items,
	hasServiceItems,
	trainerAssignments,
	taxRates,
	selectedTaxRateId,
	notes,
	hasItems,
	onEdit,
	onGoToCustomer,
	onAddItem,
	onUpdateItem,
	onRemoveItem,
	onTrainerAssignmentsChange,
	onTaxRateChange,
	onNotesChange,
	onContinue,
}: ItemsStepCardProps) {
	return (
		<StepCard
			n={stepNumber}
			label="Items"
			stepLabel={stepLabel}
			state={state}
			badge={<LockedBadge />}
			onEdit={onEdit}
		>
			{state === "active" && (
				<div className="flex flex-col gap-4">
					{/* Customer recap pill */}
					{customerLabel && (
						<div className="flex items-center gap-3 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-2.5">
							<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0a0a0a] text-[10px] font-bold text-white">
								{customerInitials}
							</div>
							<div className="flex-1 min-w-0">
								<p className="truncate text-sm font-semibold text-[#0a0a0a]">
									{customerLabel}
								</p>
								<p className="text-[11px] text-[#737373]">
									{customerTypeMode === "member" ? "Member" : "Walk-in"}
								</p>
							</div>
							{!hideCustomerStep && (
								<button
									type="button"
									onClick={onGoToCustomer}
									className="rounded-[10px] px-2 py-1 text-[11px] font-medium text-[#737373] transition hover:bg-white hover:text-[#0a0a0a]"
								>
									Change
								</button>
							)}
						</div>
					)}

					<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Add Items
					</p>

					<ItemsStep
						organizationId={organizationId}
						selectedCustomer={selectedCustomer}
						items={items}
						onAddItem={onAddItem}
						onUpdateItem={onUpdateItem}
						onRemoveItem={onRemoveItem}
						isWalkIn={customerTypeMode === "walk_in"}
					/>

					{/* Optional: trainer assignment */}
					{hasServiceItems && (
						<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
							<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Trainer Assignment{" "}
								<span className="normal-case font-normal">(optional)</span>
							</p>
							<TrainerPickerStep
								items={items}
								organizationId={organizationId}
								assignments={trainerAssignments}
								onChange={onTrainerAssignmentsChange}
							/>
						</div>
					)}

					{/* Tax */}
					{taxRates.length > 0 && (
						<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
							<p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
								Tax Rate
							</p>
							<div className="space-y-1.5">
								<Label htmlFor="tax-rate" className="sr-only">
									Tax rate
								</Label>
								<Select
									value={selectedTaxRateId ?? "none"}
									onValueChange={(v) =>
										onTaxRateChange(v === "none" ? null : v)
									}
								>
									<SelectTrigger
										id="tax-rate"
										className="w-full max-w-xs border-[#e5e5e5]"
									>
										<SelectValue placeholder="No tax" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">No tax</SelectItem>
										{taxRates.map((rate) => (
											<SelectItem key={rate.id} value={rate.id}>
												{rate.name} ({(rate.rateInBasisPoints / 100).toFixed(0)}
												%)
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					)}

					{/* Notes */}
					<div className="space-y-1.5">
						<Label
							htmlFor="sale-notes"
							className="text-xs font-medium text-[#0a0a0a]"
						>
							Notes{" "}
							<span className="font-normal text-[#737373]">(optional)</span>
						</Label>
						<Textarea
							id="sale-notes"
							placeholder="Any special instructions or notes..."
							value={notes}
							onChange={(e) => onNotesChange(e.target.value)}
							rows={2}
							className="resize-none border-[#e5e5e5]"
						/>
					</div>

					{/* Continue */}
					<div className="flex justify-end pt-1">
						<button
							type="button"
							disabled={!hasItems}
							onClick={onContinue}
							className="rounded-[10px] bg-[#0a0a0a] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-35"
						>
							Continue to Promotions →
						</button>
					</div>
				</div>
			)}

			{/* Done summary */}
			{state === "done" && items.length > 0 && (
				<div className="mt-3 space-y-2">
					{items.map((item) => (
						<div
							key={item.id}
							className="flex items-center justify-between text-sm"
						>
							<div className="flex items-center gap-2">
								<span className="flex h-5 w-5 items-center justify-center rounded border border-[#e5e5e5] bg-[#f3f3f3] text-[10px] font-bold text-[#0a0a0a]">
									×{item.quantity}
								</span>
								<span className="font-medium text-[#0a0a0a]">
									{item.description}
								</span>
							</div>
							<span className="font-mono tabular-nums font-bold text-[#0a0a0a]">
								{formatPrice(item.unitPriceCents * item.quantity, "MYR")}
							</span>
						</div>
					))}
				</div>
			)}
		</StepCard>
	);
}
