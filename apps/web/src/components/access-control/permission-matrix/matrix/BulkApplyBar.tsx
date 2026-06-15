import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PermissionResource } from "@/components/access-control/permission-matrix/permission-matrix.types";

export interface BulkApplyBarProps {
	selectedBatchRoles: Set<string>;
	resources: PermissionResource[];
	onClearSelection: () => void;
	onBulkSet: (enabled: boolean) => void;
}

/**
 * Row of bulk actions shown when ≥1 role is checked in the matrix headers.
 * Delegates the actual mutation loop to the parent via `onBulkSet` — same
 * contract as before the split.
 */
export function BulkApplyBar({
	selectedBatchRoles,
	onClearSelection,
	onBulkSet,
}: BulkApplyBarProps) {
	if (selectedBatchRoles.size === 0) return null;

	return (
		<div className="flex items-center gap-4 mt-4 pt-4 border-t">
			<Badge variant="secondary">
				{selectedBatchRoles.size} roles selected for batch operations
			</Badge>
			<div className="flex gap-2">
				<Button variant="outline" size="sm" onClick={onClearSelection}>
					Clear Selection
				</Button>
				<Button variant="outline" size="sm" onClick={() => onBulkSet(true)}>
					Grant All Permissions
				</Button>
				<Button variant="outline" size="sm" onClick={() => onBulkSet(false)}>
					Revoke All Permissions
				</Button>
			</div>
		</div>
	);
}
