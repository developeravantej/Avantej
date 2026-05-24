/** Shared types for split members router modules (Plan D-S7). */
export type GhlSyncResult = {
	status: "synced" | "skipped" | "error";
	reason?: string;
	ghlUserId?: string;
	error?: string;
};
