export type CycleType =
	| "calendar_month"
	| "monthly_anchored"
	| "semi_monthly"
	| "weekly";

export interface Policy {
	id: string;
	branchId: string | null;
	branchName: string | null;
	cycleType: CycleType;
	anchorDay: number | null;
	updatedBy: string | null;
	updatedAt: Date;
}

export interface BranchNode {
	id: string;
	name: string;
	type: string;
}
