export type InviteShape = {
	id: string;
	/**
	 * Plaintext token. Stripped from list responses for security (AC-A-06) —
	 * only present on create/regenerate. Treat as absent in list views; the
	 * QR `url` already carries the token for scanning.
	 */
	token?: string;
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
