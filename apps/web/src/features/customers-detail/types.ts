// ─── Shared types for Customer 360 feature ────────────────────────────────────

export type FreezeFormState = {
	packageInstanceId: string;
	startDate: string;
	endDate: string;
	reason: "medical" | "travel" | "other";
	feeWaived: boolean;
	notes: string;
};

export type LeadSourceProfileShape = {
	leadSourceId?: string | null;
	referrerMemberId?: string | null;
	campaignId?: string | null;
	leadAcquisitionType?: string | null;
} | null;

export type AttributedMemberShape = { id: string; name: string } | null;

export type HouseholdProfileShape = {
	id?: string | null;
	householdId?: string | null;
} | null;
