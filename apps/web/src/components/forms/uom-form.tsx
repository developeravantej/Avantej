import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export interface UomFormData {
	name: string;
	description?: string;
	baseUomId?: string;
	conversionFactor?: string;
}

interface UomFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mode?: "create" | "edit";
	initialData?: UomFormData & { id: string };
	onSubmit: (data: UomFormData) => void;
	isLoading?: boolean;
	/** Optional list of base UOMs for the baseUomId selector */
	baseUoms?: { id: string; name: string }[];
}

export function UomFormDialog({
	isOpen,
	onClose,
	mode = "create",
	initialData,
	onSubmit,
	isLoading,
	baseUoms,
}: UomFormDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [baseUomId, setBaseUomId] = useState("");
	const [conversionFactor, setConversionFactor] = useState("");

	useEffect(() => {
		if (isOpen) {
			setName(initialData?.name ?? "");
			setDescription(initialData?.description ?? "");
			setBaseUomId(initialData?.baseUomId ?? "");
			setConversionFactor(initialData?.conversionFactor ?? "");
		}
	}, [isOpen, initialData]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		onSubmit({
			name: name.trim(),
			description: description.trim() || undefined,
			baseUomId: baseUomId || undefined,
			conversionFactor: conversionFactor || undefined,
		});
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Add New UoM" : "Edit UoM"}
					</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="uom-name">
							Name <span className="text-destructive">*</span>
						</Label>
						<Input
							id="uom-name"
							placeholder="e.g., Piece, Kilogram"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="uom-description">Description</Label>
						<Textarea
							id="uom-description"
							placeholder="Optional description for this UoM"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={3}
						/>
					</div>

					{baseUoms && baseUoms.length > 0 && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="uom-base">Base UoM (optional)</Label>
							<select
								id="uom-base"
								value={baseUomId}
								onChange={(e) => setBaseUomId(e.target.value)}
								className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
							>
								<option value="">None (this is a base UoM)</option>
								{baseUoms.map((u) => (
									<option key={u.id} value={u.id}>
										{u.name}
									</option>
								))}
							</select>
						</div>
					)}

					{baseUomId && (
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="uom-factor">Conversion Factor</Label>
							<Input
								id="uom-factor"
								type="number"
								step="any"
								min="0"
								placeholder="e.g., 1000"
								value={conversionFactor}
								onChange={(e) => setConversionFactor(e.target.value)}
							/>
						</div>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading || !name.trim()}>
							{isLoading
								? mode === "create"
									? "Adding..."
									: "Saving..."
								: mode === "create"
									? "Add UoM"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
