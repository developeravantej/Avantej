import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const DAYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;

type DayOfWeek =
	| "monday"
	| "tuesday"
	| "wednesday"
	| "thursday"
	| "friday"
	| "saturday"
	| "sunday";

export type PreferredTimeItem = { dayOfWeek: DayOfWeek; time: string; priority: number };

export function PreferredTimesEditor({
	items,
	onChange,
	onSave,
	onCancel,
	isSaving,
}: {
	items: PreferredTimeItem[];
	onChange: (items: PreferredTimeItem[]) => void;
	onSave: () => void;
	onCancel: () => void;
	isSaving: boolean;
}) {
	function updateItem(index: number, field: "dayOfWeek" | "time", value: string) {
		const next = items.map((item, i) =>
			i === index ? { ...item, [field]: value } : item,
		);
		onChange(next);
	}

	function removeItem(index: number) {
		const next = items.reduce<typeof items>((acc, item, i) => {
			if (i === index) return acc;
			acc.push({ ...item, priority: acc.length + 1 });
			return acc;
		}, []);
		onChange(next);
	}

	function addItem() {
		if (items.length >= 4) return;
		onChange([
			...items,
			{ dayOfWeek: "monday", time: "09:00", priority: items.length + 1 },
		]);
	}

	return (
		<div className="space-y-2">
			{items.map((item, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: order is the identity here
				<div key={i} className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
					<Select
						value={item.dayOfWeek}
						onValueChange={(v) => updateItem(i, "dayOfWeek", v as DayOfWeek)}
					>
						<SelectTrigger className="h-7 w-28 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{DAYS.map((d) => (
								<SelectItem key={d} value={d} className="text-xs capitalize">
									{d}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Input
						type="time"
						className="h-7 w-24 text-xs"
						value={item.time}
						onChange={(e) => updateItem(i, "time", e.target.value)}
					/>
					<Button
						size="sm"
						variant="ghost"
						className="h-7 px-2"
						onClick={() => removeItem(i)}
					>
						×
					</Button>
				</div>
			))}
			<div className="flex gap-2 pt-1">
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={addItem}
					disabled={items.length >= 4}
				>
					+ Add slot
				</Button>
				<Button
					size="sm"
					className="h-7 text-xs"
					onClick={onSave}
					disabled={isSaving}
				>
					{isSaving ? "Saving…" : "Save"}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7 text-xs"
					onClick={onCancel}
					disabled={isSaving}
				>
					Cancel
				</Button>
			</div>
		</div>
	);
}
