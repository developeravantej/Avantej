// ─── Types ─────────────────────────────────────────────────────────────────────

export type NodeWithStats = {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
	address: string | null;
	openingHours: unknown | null;
	membersCount: number | null;
	staffCount: number | null;
	monthRevenueCents: number | null;
	/** WS1: ISO currency of this node's country (from the stats API). */
	currency?: string;
	stale: boolean;
};

// Opening hours shape from DB: { monday: { open: string; close: string } | null, ... }
export type OpeningHoursShape = Record<
	string,
	{ open: string; close: string } | null | undefined
>;

export const DAYS_OF_WEEK = [
	{ key: "monday", label: "Monday" },
	{ key: "tuesday", label: "Tuesday" },
	{ key: "wednesday", label: "Wednesday" },
	{ key: "thursday", label: "Thursday" },
	{ key: "friday", label: "Friday" },
	{ key: "saturday", label: "Saturday" },
	{ key: "sunday", label: "Sunday" },
];

// Legacy HierarchyNode shape for edit dialog
export type HierarchyNode = {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
	code?: string | null;
};
