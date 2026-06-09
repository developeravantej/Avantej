import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { describePolicy } from "./helpers";
import type { Policy } from "./types";

export function PolicyRow({
	policy,
	canEdit,
	onEdit,
	onDelete,
}: {
	policy: Policy;
	canEdit: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const isTenantWide = policy.branchId === null;
	return (
		<tr className="border-b border-[#f7f5ee] last:border-0 hover:bg-[#fcfaf6]">
			<td className="px-4 py-3 text-sm">
				<span className="font-medium">
					{isTenantWide
						? "Tenant default"
						: (policy.branchName ?? policy.branchId)}
				</span>
				{isTenantWide ? (
					<Badge variant="outline" className="ml-2 text-[10px]">
						All branches
					</Badge>
				) : null}
			</td>
			<td className="px-4 py-3 text-sm">
				<code className="font-mono text-[11px] bg-[#f3f3f3] px-1.5 py-0.5 rounded">
					{policy.cycleType}
				</code>
			</td>
			<td className="px-4 py-3 text-sm text-[#737373]">
				{describePolicy(policy)}
			</td>
			<td className="px-4 py-3 text-xs text-[#737373] tabular-nums">
				{new Date(policy.updatedAt).toLocaleDateString("en-MY", {
					day: "numeric",
					month: "short",
					year: "numeric",
				})}
			</td>
			<td className="px-4 py-3 text-right">
				{canEdit ? (
					<div className="inline-flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={onEdit}
						>
							<Pencil className="h-3.5 w-3.5" />
							<span className="sr-only">Edit</span>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
							onClick={onDelete}
						>
							<Trash2 className="h-3.5 w-3.5" />
							<span className="sr-only">Delete</span>
						</Button>
					</div>
				) : null}
			</td>
		</tr>
	);
}
