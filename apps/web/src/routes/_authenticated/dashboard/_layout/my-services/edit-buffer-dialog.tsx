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
import { Separator } from "@/components/ui/separator";

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
			<DialogContent className="sm:max-w-md overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Set Buffer Time</DialogTitle>
					<DialogDescription>
						Override the default buffer time for this service.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-5 p-4">
					<div className="flex flex-col gap-1.5">
						<Label className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
							Service
						</Label>
						<p className="text-sm font-medium">
							{selectedService?.serviceName ?? "—"}
						</p>
					</div>

					{selectedService?.categoryName && (
						<div className="flex flex-col gap-1.5">
							<Label className="text-muted-foreground text-xs uppercase tracking-wide font-semibold">
								Category
							</Label>
							<p className="text-sm text-muted-foreground">
								{selectedService.categoryName}
							</p>
						</div>
					)}

					<Separator />

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
						<p className="text-xs text-muted-foreground">
							Category default:{" "}
							{selectedService && selectedService.categoryDefaultBuffer > 0
								? `${selectedService.categoryDefaultBuffer} min`
								: "None"}
						</p>
					</div>

					<DialogFooter className="px-0 pt-2 flex-col gap-2 sm:flex-row">
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
								className="text-destructive border-destructive hover:bg-destructive/5"
								onClick={onClearOverride}
								disabled={isPending}
							>
								Clear Override
							</Button>
						)}
						<Button type="button" onClick={onSave} disabled={isPending}>
							{isPending ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</div>
			</DialogContent>
		</Dialog>
	);
}
