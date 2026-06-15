/**
 * Re-export of drizzle migration journal manifests for runtime consumption
 * (e.g. the read-only Platform Admin migrations viewer — Plan F.4 Agent Mi).
 *
 * JSON is imported with `resolveJsonModule: true` and bundled at build time —
 * works in both bun (server tests) and the Cloudflare Workers runtime.
 *
 * NEVER mutate. These are the canonical drizzle-kit manifests and read-only.
 */

import controlPanelJournalJson from "./migrations/control-panel/meta/_journal.json" with {
	type: "json",
};
import tenantJournalJson from "./migrations/tenant/meta/_journal.json" with {
	type: "json",
};

export type DrizzleJournalEntry = {
	idx: number;
	version: string;
	when: number;
	tag: string;
	breakpoints?: boolean;
};

export type DrizzleJournal = {
	version: string;
	dialect: string;
	entries: DrizzleJournalEntry[];
};

export const controlPanelJournal = controlPanelJournalJson as DrizzleJournal;
export const tenantJournal = tenantJournalJson as DrizzleJournal;
