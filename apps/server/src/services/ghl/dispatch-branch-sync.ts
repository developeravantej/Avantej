/**
 * Server-side adapter for branch ↔ GHL custom-field-option sync.
 *
 * Mirrors `dispatch-staff-sync.ts`. Routers in `@avantej-core/api` reach
 * this via the Hono context (`context.honoContext.get("dispatchBranchSync")`),
 * not by direct import — keeps `apps/server` deps out of the shared package.
 */

import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import {
	composeOptionLabel,
	ensureBranchOption,
	ensureCountryFieldExists,
	removeBranchOption,
	renameBranchOption,
	resolveBranchPath,
	syncBranchToGhl,
	type SyncBranchResult,
} from "./branch-sync";

type CountryFieldEntry = {
	ghlFieldId: string;
	fieldKey: string;
	createdAt: string;
};
type CountryFieldMap = Record<string, CountryFieldEntry>;

export interface ServerDispatchBranchSyncArgs {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
}

export const dispatchBranchSync = (
	args: ServerDispatchBranchSyncArgs,
): Promise<SyncBranchResult> =>
	syncBranchToGhl({ ...args, decryptApiKey: decrypt });

/**
 * Read org row and validate it's provisioned for org-shared GHL sync.
 * Returns { ok: false } variant for skip cases; { ok: true, ... } when ready.
 */
type ProvisionedOrg =
	| {
			ok: true;
			ghlLocationId: string;
			ghlApiKey: string;
			countryFieldMap: CountryFieldMap;
	  }
	| { ok: false; result: SyncBranchResult };

async function readProvisionedOrg(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
): Promise<ProvisionedOrg> {
	const org = await controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
	});
	if (
		!org ||
		org.ghlSyncModel !== "org-shared" ||
		!org.ghlLocationId ||
		!org.ghlApiKeyEncrypted
	) {
		return {
			ok: false,
			result: { status: "skipped", reason: "not-provisioned" },
		};
	}
	return {
		ok: true,
		ghlLocationId: org.ghlLocationId,
		ghlApiKey: decrypt(org.ghlApiKeyEncrypted),
		countryFieldMap: (org.ghlCountryFieldMap as CountryFieldMap | null) ?? {},
	};
}

// ---------------------------------------------------------------------------
// Rename: an existing branch's name (or its state ancestor's name) changed
// ---------------------------------------------------------------------------

export interface DispatchBranchRenameArgs extends ServerDispatchBranchSyncArgs {
	/** Pre-rename branch name (used to reconstruct the OLD option label). */
	oldBranchName: string;
}

export const dispatchBranchRename = async (
	args: DispatchBranchRenameArgs,
): Promise<SyncBranchResult> => {
	try {
		const provisioned = await readProvisionedOrg(
			args.controlPanelDb,
			args.organizationId,
		);
		if (!provisioned.ok) return provisioned.result;

		// Resolve the path AFTER the rename: this gives us the NEW optionLabel
		// plus the (unchanged) statePrefix + country info.
		const path = await resolveBranchPath(
			args.tenantDb,
			args.branchNodeId,
			args.organizationId,
		);

		const oldOptionLabel = composeOptionLabel(
			path.statePrefix,
			args.oldBranchName,
		);

		// Look up ghlFieldId; provision the country field if missing.
		let ghlFieldId =
			provisioned.countryFieldMap[path.countryNodeId]?.ghlFieldId;
		if (!ghlFieldId) {
			const ensured = await ensureCountryFieldExists({
				controlPanelDb: args.controlPanelDb,
				organizationId: args.organizationId,
				ghlLocationId: provisioned.ghlLocationId,
				ghlApiKey: provisioned.ghlApiKey,
				countryNodeId: path.countryNodeId,
				countryName: path.countryName,
				// Rename path: seed with the NEW option label so the
				// fresh GHL field has at least one option.
				initialOption: path.optionLabel,
			});
			ghlFieldId = ensured.ghlFieldId;
		}

		await renameBranchOption({
			ghlLocationId: provisioned.ghlLocationId,
			ghlApiKey: provisioned.ghlApiKey,
			ghlFieldId,
			oldLabel: oldOptionLabel,
			newLabel: path.optionLabel,
		});

		return { status: "synced", ghlFieldId, optionLabel: path.optionLabel };
	} catch (err) {
		return {
			status: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
};

// ---------------------------------------------------------------------------
// Remove: a branch is being deleted. Caller invokes BEFORE the row is gone
// so we can resolve the path internally.
// ---------------------------------------------------------------------------

export type DispatchBranchRemoveArgs = ServerDispatchBranchSyncArgs;

export const dispatchBranchRemove = async (
	args: DispatchBranchRemoveArgs,
): Promise<SyncBranchResult> => {
	try {
		const provisioned = await readProvisionedOrg(
			args.controlPanelDb,
			args.organizationId,
		);
		if (!provisioned.ok) return provisioned.result;

		const path = await resolveBranchPath(
			args.tenantDb,
			args.branchNodeId,
			args.organizationId,
		);

		const ghlFieldId =
			provisioned.countryFieldMap[path.countryNodeId]?.ghlFieldId;
		if (!ghlFieldId) {
			// Country never had a field → nothing to remove.
			return { status: "skipped", reason: "not-provisioned" };
		}

		await removeBranchOption({
			ghlLocationId: provisioned.ghlLocationId,
			ghlApiKey: provisioned.ghlApiKey,
			ghlFieldId,
			optionLabel: path.optionLabel,
		});

		return { status: "synced", ghlFieldId, optionLabel: path.optionLabel };
	} catch (err) {
		return {
			status: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
};

// ---------------------------------------------------------------------------
// Move: a branch moved across countries. Caller invokes AFTER the move
// (denorm country_node_id has been updated by moveHierarchyNode).
// ---------------------------------------------------------------------------

export interface DispatchBranchMoveArgs extends ServerDispatchBranchSyncArgs {
	/** Country node id BEFORE the move. */
	oldCountryNodeId: string;
	/** Branch name BEFORE the move (used to reconstruct old option label). */
	oldBranchName: string;
	/** State prefix BEFORE the move (immediate non-country ancestor's name, or null). */
	oldStatePrefix: string | null;
}

export const dispatchBranchMove = async (
	args: DispatchBranchMoveArgs,
): Promise<SyncBranchResult> => {
	try {
		const provisioned = await readProvisionedOrg(
			args.controlPanelDb,
			args.organizationId,
		);
		if (!provisioned.ok) return provisioned.result;

		// Resolve NEW path (post-move state).
		const newPath = await resolveBranchPath(
			args.tenantDb,
			args.branchNodeId,
			args.organizationId,
		);

		const oldOptionLabel = composeOptionLabel(
			args.oldStatePrefix,
			args.oldBranchName,
		);

		const errors: string[] = [];

		// 1. Remove from old country's field (silent if old country has no entry).
		const oldGhlFieldId =
			provisioned.countryFieldMap[args.oldCountryNodeId]?.ghlFieldId;
		if (oldGhlFieldId) {
			try {
				await removeBranchOption({
					ghlLocationId: provisioned.ghlLocationId,
					ghlApiKey: provisioned.ghlApiKey,
					ghlFieldId: oldGhlFieldId,
					optionLabel: oldOptionLabel,
				});
			} catch (err) {
				errors.push(
					`remove from old country: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		// 2. Ensure new country field + add the option.
		let newGhlFieldId: string;
		try {
			const ensured = await ensureCountryFieldExists({
				controlPanelDb: args.controlPanelDb,
				organizationId: args.organizationId,
				ghlLocationId: provisioned.ghlLocationId,
				ghlApiKey: provisioned.ghlApiKey,
				countryNodeId: newPath.countryNodeId,
				countryName: newPath.countryName,
				// Move path: seed with the new branch's option label so
				// the fresh GHL field is immediately usable.
				initialOption: newPath.optionLabel,
			});
			newGhlFieldId = ensured.ghlFieldId;
			await ensureBranchOption({
				ghlLocationId: provisioned.ghlLocationId,
				ghlApiKey: provisioned.ghlApiKey,
				ghlFieldId: newGhlFieldId,
				optionLabel: newPath.optionLabel,
			});
		} catch (err) {
			errors.push(
				`add to new country: ${err instanceof Error ? err.message : String(err)}`,
			);
			return { status: "error", error: errors.join("; ") };
		}

		if (errors.length > 0) {
			return { status: "error", error: errors.join("; ") };
		}

		return {
			status: "synced",
			ghlFieldId: newGhlFieldId,
			optionLabel: newPath.optionLabel,
		};
	} catch (err) {
		return {
			status: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
};
