import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_OPTIONS } from "./constants";
import type { ExpenseCategory } from "./types";

export function CreateExpenseDialog({
	open,
	onOpenChange,
	formCategory,
	setFormCategory,
	formDescription,
	setFormDescription,
	formAmountRm,
	setFormAmountRm,
	formDate,
	setFormDate,
	formReceiptUrl,
	setFormReceiptUrl,
	isPending,
	onSubmit,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	formCategory: ExpenseCategory;
	setFormCategory: (val: ExpenseCategory) => void;
	formDescription: string;
	setFormDescription: (val: string) => void;
	formAmountRm: string;
	setFormAmountRm: (val: string) => void;
	formDate: string;
	setFormDate: (val: string) => void;
	formReceiptUrl: string;
	setFormReceiptUrl: (val: string) => void;
	isPending: boolean;
	onSubmit: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						EXPENSE TRACKER
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Submit Expense
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Fill in the details to submit a new expense claim.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-5">
						<div className="flex flex-col gap-1.5">
							<Label>Category</Label>
							<Select
								value={formCategory}
								onValueChange={(val) => setFormCategory(val as ExpenseCategory)}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select category" />
								</SelectTrigger>
								<SelectContent>
									{CATEGORY_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label>
								Description <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								placeholder="Describe the expense..."
								value={formDescription}
								onChange={(e) => setFormDescription(e.target.value)}
								rows={3}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label>
								Amount (RM) <span className="text-rose-600">*</span>
							</Label>
							<Input
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								value={formAmountRm}
								onChange={(e) => setFormAmountRm(e.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label>
								Expense Date <span className="text-rose-600">*</span>
							</Label>
							<Input
								type="date"
								value={formDate}
								onChange={(e) => setFormDate(e.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label>
								Receipt URL{" "}
								<span className="text-[#737373] text-xs font-normal">
									(optional)
								</span>
							</Label>
							<Input
								type="url"
								placeholder="https://..."
								value={formReceiptUrl}
								onChange={(e) => setFormReceiptUrl(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						onClick={onSubmit}
						disabled={isPending}
					>
						{isPending ? "Submitting…" : "Submit"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
