import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { FormState } from "./types";

export type PlanFormDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editingId: string | null;
	form: FormState;
	setForm: React.Dispatch<React.SetStateAction<FormState>>;
	onSubmit: (e: React.FormEvent) => void;
	onCancel: () => void;
	isCreating: boolean;
	isUpdating: boolean;
};

export function PlanFormDialog({
	open,
	onOpenChange,
	editingId,
	form,
	setForm,
	onSubmit,
	onCancel,
	isCreating,
	isUpdating,
}: PlanFormDialogProps) {
	const isSaving = isCreating || isUpdating;

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onCancel();
				else onOpenChange(true);
			}}
		>
			<DialogContent
				className="sm:max-w-lg p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INSTALLMENT PLANS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{editingId ? "Edit Installment Plan" : "Add Installment Plan"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{editingId
							? "Update plan details. The plan code cannot be changed."
							: "Define a new installment plan to offer on package services."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={onSubmit}>
					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="space-y-4">
							{/* Code */}
							<div>
								<label
									htmlFor="ip-code"
									className="block text-xs font-medium text-[#0a0a0a] mb-1"
								>
									Code {!editingId && "*"}
								</label>
								<Input
									id="ip-code"
									placeholder="e.g. monthly_6"
									value={form.code}
									onChange={(e) =>
										setForm((f) => ({ ...f, code: e.target.value }))
									}
									className="font-mono"
									required={!editingId}
									disabled={!!editingId}
								/>
								<p className="mt-1 text-[11px] text-[#8a8f91]">
									{editingId
										? "Cannot be changed after creation."
										: "Short identifier used internally. Cannot be changed later."}
								</p>
							</div>

							{/* Name */}
							<div>
								<label
									htmlFor="ip-name"
									className="block text-xs font-medium text-[#0a0a0a] mb-1"
								>
									Name *
								</label>
								<Input
									id="ip-name"
									placeholder="e.g. Monthly (6 payments)"
									value={form.name}
									onChange={(e) =>
										setForm((f) => ({ ...f, name: e.target.value }))
									}
									required
								/>
							</div>

							{/* Installments + Interval days */}
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label
										htmlFor="ip-num"
										className="block text-xs font-medium text-[#0a0a0a] mb-1"
									>
										Installments *
									</label>
									<Input
										id="ip-num"
										type="number"
										min="1"
										step="1"
										placeholder="e.g. 6"
										value={form.numInstallments}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												numInstallments: e.target.value,
											}))
										}
										required
									/>
									<p className="mt-1 text-[11px] text-[#8a8f91]">
										Use 1 for full single payment.
									</p>
								</div>
								<div>
									<label
										htmlFor="ip-days"
										className="block text-xs font-medium text-[#0a0a0a] mb-1"
									>
										Interval (days) *
									</label>
									<Input
										id="ip-days"
										type="number"
										min="1"
										step="1"
										placeholder="e.g. 30"
										value={form.defaultIntervalDays}
										onChange={(e) =>
											setForm((f) => ({
												...f,
												defaultIntervalDays: e.target.value,
											}))
										}
										required
									/>
									<p className="mt-1 text-[11px] text-[#8a8f91]">
										Services can override this.
									</p>
								</div>
							</div>

							{/* Premium */}
							<div>
								<label
									htmlFor="ip-premium"
									className="block text-xs font-medium text-[#0a0a0a] mb-1"
								>
									Price Premium (%)
								</label>
								<Input
									id="ip-premium"
									type="number"
									min="0"
									max="100"
									step="0.01"
									placeholder="0"
									value={form.pricePremiumPct}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											pricePremiumPct: e.target.value,
										}))
									}
								/>
								<p className="mt-1 text-[11px] text-[#8a8f91]">
									Markup on base price when this plan is selected. 0 = no
									premium.
								</p>
							</div>

							{/* Description */}
							<div>
								<label
									htmlFor="ip-desc"
									className="block text-xs font-medium text-[#0a0a0a] mb-1"
								>
									Description
								</label>
								<Textarea
									id="ip-desc"
									placeholder="Optional notes about this plan"
									rows={3}
									value={form.description}
									onChange={(e) =>
										setForm((f) => ({ ...f, description: e.target.value }))
									}
								/>
							</div>

							{/* Is default — only on create */}
							{!editingId && (
								<div className="flex items-center gap-2">
									<Checkbox
										id="ip-default"
										checked={form.isDefault}
										onCheckedChange={(c) =>
											setForm((f) => ({ ...f, isDefault: c === true }))
										}
									/>
									<label
										htmlFor="ip-default"
										className="cursor-pointer text-sm text-[#0a0a0a]"
									>
										Set as default plan
									</label>
								</div>
							)}
						</div>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<button
							type="button"
							onClick={onCancel}
							disabled={isSaving}
							className="rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-sm font-medium text-[#0a0a0a] transition-colors hover:bg-[#f7f5ee] disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={isSaving}
							className="rounded-lg bg-[#0a0a0a] text-white hover:bg-[#262626] px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
						>
							{isSaving ? "Saving…" : editingId ? "Save Changes" : "Add Plan"}
						</button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
