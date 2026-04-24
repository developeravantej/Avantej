import { Button } from "@/components/ui/button";

export interface RolePaginationProps {
	visibleRoleStart: number;
	totalRoles: number;
	pageSize: number;
	onChangeStart: (next: number) => void;
}

/** "Showing 1-6 of 12 roles" + Previous/Next — shown only when role count > pageSize. */
export function RolePagination({
	visibleRoleStart,
	totalRoles,
	pageSize,
	onChangeStart,
}: RolePaginationProps) {
	if (totalRoles <= pageSize) return null;
	const canPrev = visibleRoleStart > 0;
	const canNext = visibleRoleStart + pageSize < totalRoles;
	return (
		<div className="flex items-center justify-between mt-4 pt-4 border-t">
			<div className="text-sm text-muted-foreground">
				Showing {visibleRoleStart + 1}-
				{Math.min(visibleRoleStart + pageSize, totalRoles)} of {totalRoles}{" "}
				roles
			</div>
			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => onChangeStart(Math.max(0, visibleRoleStart - pageSize))}
					disabled={!canPrev}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => onChangeStart(visibleRoleStart + pageSize)}
					disabled={!canNext}
				>
					Next
				</Button>
			</div>
		</div>
	);
}
