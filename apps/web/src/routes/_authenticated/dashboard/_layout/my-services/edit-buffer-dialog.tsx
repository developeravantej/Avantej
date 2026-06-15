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

type SelectedService = {
	serviceName: string;
	categoryName: string | null;
	categoryDefaultBuffer: number;
	bufferTimeMinutes: number | null;
} | null;

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedService: SelectedService;
	bufferInput: string;
	setBufferInput: (val: string) => void;
	onSave: () => void;
	onClearOverride: () => void;
	onCancel: () => void;
	isPending: boolean;
};

export function EditBufferDialog({
	open,
	onOpenChange,
	selectedService,
	bufferInput,
	setBufferInput,
	onSave,
	onClearOverride,
	onCancel,
	isPending,
}: Props) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						SERVICE CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Set Buffer Time
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Override the default buffer time for this service.
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-5">
						<div className="flex flex-col gap-1.5">
							<Label className="text-[#737373] text-xs uppercase tracking-wide font-semibold">
								Service
							</Label>
							<p className="text-sm font-medium">
								{selectedService?.serviceName ?? "—"}
							</p>
						</div>

						{selectedService?.categoryName && (
							<div className="flex flex-col gap-1.5">
								<Label className="text-[#737373] text-xs uppercase tracking-wide font-semibold">
									Category
								</Label>
								<p className="text-sm text-[#737373]">
									{selectedService.categoryName}
								</p>
							</div>
						)}

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="buffer-input">My Buffer (minutes)</Label>
							<Input
								id="buffer-input"
								type="number"
								min={0}
								step={1}
								placeholder="Leave blank to use category default"
								value={bufferInput}
								onChange={(e) => setBufferInput(e.target.value)}
							/>
							<p className="text-xs text-[#737373]">
								Category default:{" "}
								{selectedService && selectedService.categoryDefaultBuffer > 0
									? `${selectedService.categoryDefaultBuffer} min`
									: "None"}
							</p>
						</div>
					</div>
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isPending}
					>
						Cancel
					</Button>
					{selectedService?.bufferTimeMinutes != null && (
						<Button
							type="button"
							variant="outline"
							className="text-rose-600 border-rose-600 hover:bg-rose-600/5"
							onClick={onClearOverride}
							disabled={isPending}
						>
							Clear Override
						</Button>
					)}
					<Button
						type="button"
						onClick={onSave}
						disabled={isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{isPending ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
