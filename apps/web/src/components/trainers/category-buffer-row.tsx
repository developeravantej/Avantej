import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type CategoryBufferRowData = {
	categoryId: string;
	categoryName: string;
	orgDefaultBuffer: number;
	bufferTimeMinutes: number | null;
};

export function CategoryBufferRow({
	cat,
	onSave,
}: {
	cat: CategoryBufferRowData;
	onSave: (categoryId: string, bufferTimeMinutes: number | null) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(
		cat.bufferTimeMinutes !== null ? String(cat.bufferTimeMinutes) : "",
	);

	function handleSave() {
		const parsed = value === "" ? null : Number.parseInt(value, 10);
		if (parsed !== null && (Number.isNaN(parsed) || parsed < 0 || parsed > 480)) return;
		onSave(cat.categoryId, parsed);
		setEditing(false);
	}

	return (
		<div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
			<div>
				<span className="font-medium">{cat.categoryName}</span>
				<span className="ml-2 text-xs text-muted-foreground">
					(org default: {cat.orgDefaultBuffer} min)
				</span>
			</div>
			{editing ? (
				<div className="flex items-center gap-1">
					<Input
						type="number"
						min={0}
						max={480}
						className="h-7 w-20 text-sm"
						placeholder={String(cat.orgDefaultBuffer)}
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
					<Button size="sm" variant="ghost" onClick={handleSave}>
						Save
					</Button>
					<Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
						Cancel
					</Button>
				</div>
			) : (
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">
						{cat.bufferTimeMinutes !== null ? `${cat.bufferTimeMinutes} min` : "—"}
					</span>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							// Reset input value from current prop before opening (avoids stale state on re-edit)
							setValue(cat.bufferTimeMinutes !== null ? String(cat.bufferTimeMinutes) : "");
							setEditing(true);
						}}
					>
						Edit
					</Button>
				</div>
			)}
		</div>
	);
}
