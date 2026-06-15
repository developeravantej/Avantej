// ─── Shared types, constants & helpers for Announcements ──────────────────────

export type Priority = "low" | "normal" | "high" | "urgent";
export type TargetAudience = "all" | "staff" | "clients";
export type StatusFilter = "active" | "inactive" | "all";

export type AnnouncementRow = {
	id: string;
	title: string;
	message: string;
	priority: Priority;
	targetAudience: TargetAudience;
	branchId: string | null;
	startDate: string | null;
	endDate: string | null;
	isPinned: boolean;
	isActive: boolean;
	requiresAcknowledgement: boolean;
	createdAt: string;
	scopedBranchIds?: string[];
};

export type FormState = {
	title: string;
	message: string;
	priority: Priority;
	targetAudience: TargetAudience;
	startDate: string;
	endDate: string;
	isPinned: boolean;
	requiresAcknowledgement: boolean;
	scopedBranchIds: string[];
};

export const EMPTY_FORM: FormState = {
	title: "",
	message: "",
	priority: "normal",
	targetAudience: "all",
	startDate: "",
	endDate: "",
	isPinned: false,
	requiresAcknowledgement: false,
	scopedBranchIds: [],
};

// ─── Audience rail config ─────────────────────────────────────────────────────

export type AudienceKey = "all" | "staff" | "clients" | "branch";

export const AUDIENCE_FILTERS: {
	key: AudienceKey | "all";
	label: string;
	dot: string;
}[] = [
	{ key: "all", label: "All", dot: "" },
	{ key: "staff", label: "All Staff", dot: "bg-emerald-500" },
	{ key: "clients", label: "All Members", dot: "bg-purple-500" },
	{ key: "branch", label: "Branch-scoped", dot: "bg-sky-500" },
];

export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
	{ key: "active", label: "Active" },
	{ key: "inactive", label: "Inactive" },
	{ key: "all", label: "All" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export function formatShortDate(iso: string | null): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
	});
}

export function priorityDot(priority: Priority): string {
	switch (priority) {
		case "urgent":
			return "bg-red-500";
		case "high":
			return "bg-orange-500";
		case "normal":
			return "bg-blue-500";
		case "low":
			return "bg-slate-400";
	}
}

export function priorityLabel(priority: Priority): string {
	return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function audienceLabel(audience: TargetAudience): string {
	switch (audience) {
		case "all":
			return "All";
		case "staff":
			return "Staff";
		case "clients":
			return "Members";
	}
}
