import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type BranchOption = { id: string; name: string };

type Props = {
	branchOptions: BranchOption[];
	branchId: string;
	onBranchChange: (id: string) => void;
	date: string;
	onDateChange: (date: string) => void;
};

export function AttendanceFiltersBand({
	branchOptions,
	branchId,
	onBranchChange,
	date,
	onDateChange,
}: Props) {
	return (
		<div className="shrink-0 border-b border-border/40 px-6 py-3">
			<div className="flex flex-wrap items-end gap-3">
				{branchOptions.length > 0 && (
					<div className="flex flex-col gap-1">
						<Label className="text-xs">Branch</Label>
						<Select value={branchId || ""} onValueChange={onBranchChange}>
							<SelectTrigger className="h-9 w-56">
								<SelectValue placeholder="Select branch..." />
							</SelectTrigger>
							<SelectContent>
								{branchOptions.map((node) => (
									<SelectItem key={node.id} value={node.id}>
										{node.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				<div className="flex flex-col gap-1">
					<Label className="text-xs">Date</Label>
					<input
						type="date"
						value={date}
						onChange={(e) => onDateChange(e.target.value)}
						className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
					/>
				</div>
			</div>
		</div>
	);
}
