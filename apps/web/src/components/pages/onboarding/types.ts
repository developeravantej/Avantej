export type InviteShape = {
	id: string;
	token: string;
	url: string;
	usesCount: number;
	maxUses: number | null;
	isActive: boolean;
	expiresAt: string | Date;
	createdAt: string | Date;
};

export type Row = {
	branchId: string;
	branchName: string;
	invite: InviteShape | null;
};
