// apps/server/src/services/ghl/sync-context.ts
/**
 * Resolves the per-org GHL sync configuration for a single branch.
 *
 * Two models are supported (Phase G):
 *   - "org-shared": one GHL sub-account per org; branches are differentiated
 *     by a per-country SINGLE_OPTIONS custom field on contacts. Location id
 *     and api key live on the `organizations` row.
 *   - "per-branch" (legacy): one GHL sub-account per Avantej branch; config
 *     lives on `ghl_branch_links` keyed by (org, branchNodeId).
 *
 * Both sync orchestrators (sync-customer.ts and sync-staff.ts) and the staff
 * dispatcher in @avantej-core/services use this helper to pick the right
 * data source and (in org-shared mode) materialize a branch-stamp custom
 * field that the payload builders thread onto outbound GHL requests.
 *
 * Side effect: in org-shared mode this calls `ensureCountryFieldExists`,
 * which is itself idempotent (caches into `organizations.ghlCountryFieldMap`).
 */

import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ensureCountryFieldExists, resolveBranchPath } from "./branch-sync";

type CountryFieldEntry = {
	ghlFieldId: string;
	fieldKey: string;
	createdAt: string;
};
type CountryFieldMap = Record<string, CountryFieldEntry>;

export type LegacyBranchLink = typeof ghlBranchLinks.$inferSelect;

export type SyncContext =
	| {
			model: "org-shared";
			locationId: string;
			apiKey: string;
			branchCountryFieldId: string;
			branchOptionLabel: string;
	  }
	| {
			model: "per-branch";
			locationId: string;
			apiKey: string;
			legacyBranchLink: LegacyBranchLink;
	  }
	| {
			model: "skipped";
			reason: "branch-not-connected" | "not-provisioned";
	  };

export interface ResolveSyncContextArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
	decryptApiKey: (encrypted: string) => string;
}

/**
 * Read the org row (if the schema/mock supplies it), otherwise treat as the
 * legacy per-branch model. This tolerance keeps the helper usable from test
 * harnesses that only stub `ghlBranchLinks`.
 */
async function tryReadOrg(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
) {
	const orgQuery = (
		controlPanelDb as unknown as {
			query?: { organizations?: { findFirst?: Function } };
		}
	).query?.organizations?.findFirst;
	if (typeof orgQuery !== "function") return null;
	return await controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
	});
}

export async function resolveSyncContext(
	args: ResolveSyncContextArgs,
): Promise<SyncContext> {
	const {
		controlPanelDb,
		tenantDb,
		organizationId,
		branchNodeId,
		decryptApiKey,
	} = args;

	const org = await tryReadOrg(controlPanelDb, organizationId);

	if (org && org.ghlSyncModel === "org-shared") {
		if (!org.ghlLocationId || !org.ghlApiKeyEncrypted) {
			return { model: "skipped", reason: "not-provisioned" };
		}
		const apiKey = decryptApiKey(org.ghlApiKeyEncrypted);
		const path = await resolveBranchPath(
			tenantDb,
			branchNodeId,
			organizationId,
		);

		// Look up the country field from the cached map; lazily create it if
		// missing (a contact/user from a new country may be synced before any
		// branch CRUD has triggered field creation).
		const map: CountryFieldMap =
			(org.ghlCountryFieldMap as CountryFieldMap | null) ?? {};
		let branchCountryFieldId: string;
		const cached = map[path.countryNodeId];
		if (cached) {
			branchCountryFieldId = cached.ghlFieldId;
		} else {
			const created = await ensureCountryFieldExists({
				controlPanelDb,
				organizationId,
				ghlLocationId: org.ghlLocationId,
				ghlApiKey: apiKey,
				countryNodeId: path.countryNodeId,
				countryName: path.countryName,
				// Contact/staff sync path: seed with the current branch's
				// option label so the fresh GHL field has at least one option.
				initialOption: path.optionLabel,
			});
			branchCountryFieldId = created.ghlFieldId;
		}

		return {
			model: "org-shared",
			locationId: org.ghlLocationId,
			apiKey,
			branchCountryFieldId,
			branchOptionLabel: path.optionLabel,
		};
	}

	// Legacy per-branch (also covers null ghlSyncModel and missing org row)
	const link = await controlPanelDb.query.ghlBranchLinks.findFirst({
		where: and(
			eq(ghlBranchLinks.organizationId, organizationId),
			eq(ghlBranchLinks.tenantBranchId, branchNodeId),
			eq(ghlBranchLinks.isActive, true),
		),
	});
	if (!link || !link.isActive) {
		return { model: "skipped", reason: "branch-not-connected" };
	}
	return {
		model: "per-branch",
		locationId: link.ghlLocationId,
		apiKey: decryptApiKey(link.ghlApiKey),
		legacyBranchLink: link,
	};
}
