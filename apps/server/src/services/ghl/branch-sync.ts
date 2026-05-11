// apps/server/src/services/ghl/branch-sync.ts
/**
 * Branch ↔ GHL custom-field sync (Phase G "org-shared" model).
 *
 * Model: one GHL sub-account per Avantej org. Each country has a
 * SINGLE_OPTIONS custom field on contacts; option values are the branch
 * labels ("State - Branch"). Branch CRUD in Avantej propagates to the
 * options array via PUT.
 *
 * This module is pure orchestration — no router/hono coupling. Callers
 * pass tenantDb + controlPanelDb + decryptApiKey for testability.
 */

import { eq, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { ghlFetch } from "./http-client";
import type { GhlCustomField } from "./types";

export type ResolvedBranchPath = {
	organizationId: string;
	branchNodeId: string;
	branchName: string;
	countryNodeId: string;
	countryName: string;
	statePrefix: string | null;
	optionLabel: string;
};

type CountryFieldEntry = {
	ghlFieldId: string;
	fieldKey: string;
	createdAt: string;
};

type CountryFieldMap = Record<string, CountryFieldEntry>;

const OPTION_SEPARATOR = " - ";

/**
 * Lower-snake-ASCII slug for fieldKey derivation.
 * "Malaysia" -> "malaysia"
 * "United Kingdom" -> "united_kingdom"
 * "São Paulo" -> "sao_paulo" (strips diacritics)
 */
export function slugifyCountry(countryName: string): string {
	return countryName
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

/**
 * Compose the GHL dropdown option label. Trimmed, NFC-normalized.
 */
export function composeOptionLabel(
	statePrefix: string | null,
	branchName: string,
): string {
	const branch = branchName.trim().normalize("NFC");
	const prefix = statePrefix ? statePrefix.trim().normalize("NFC") : null;
	return prefix ? `${prefix}${OPTION_SEPARATOR}${branch}` : branch;
}

/**
 * Walk hierarchy from branch up to country. Uses denorm `country_node_id`
 * when populated (Phase G0); falls back to recursive walk via parent_id.
 */
export async function resolveBranchPath(
	tenantDb: NeonDatabase<typeof tenantSchema>,
	branchNodeId: string,
	organizationId: string,
): Promise<ResolvedBranchPath> {
	const branch = await tenantDb.query.hierarchyNodes.findFirst({
		where: eq(hierarchyNodes.id, branchNodeId),
	});
	if (!branch) throw new Error(`Branch node not found: ${branchNodeId}`);
	if (branch.type !== "branch") {
		throw new Error(
			`Node ${branchNodeId} is type='${branch.type}', expected 'branch'`,
		);
	}

	// Country via denorm FK (preferred)
	let countryNodeId = branch.countryNodeId ?? null;

	// Fallback: walk parents
	if (!countryNodeId) {
		let cursorId: string | null = branch.parentId ?? null;
		while (cursorId) {
			const node: typeof branch | undefined =
				await tenantDb.query.hierarchyNodes.findFirst({
					where: eq(hierarchyNodes.id, cursorId),
				});
			if (!node) break;
			if (node.type === "country") {
				countryNodeId = node.id;
				break;
			}
			cursorId = node.parentId ?? null;
		}
	}
	if (!countryNodeId) {
		throw new Error(
			`Branch ${branchNodeId} has no country ancestor; cannot sync to GHL`,
		);
	}

	const country = await tenantDb.query.hierarchyNodes.findFirst({
		where: eq(hierarchyNodes.id, countryNodeId),
	});
	if (!country) throw new Error(`Country node missing: ${countryNodeId}`);

	// State prefix = immediate non-country, non-organization ancestor (the parent
	// when parent is type='state'; null when branch is direct child of country).
	let statePrefix: string | null = null;
	if (branch.parentId) {
		const parent = await tenantDb.query.hierarchyNodes.findFirst({
			where: eq(hierarchyNodes.id, branch.parentId),
		});
		if (parent && parent.type !== "country" && parent.type !== "organization") {
			statePrefix = parent.name;
		}
	}

	const optionLabel = composeOptionLabel(statePrefix, branch.name);

	return {
		organizationId,
		branchNodeId: branch.id,
		branchName: branch.name,
		countryNodeId: country.id,
		countryName: country.name,
		statePrefix,
		optionLabel,
	};
}

async function readOrgRow(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
) {
	const org = await controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
	});
	if (!org) throw new Error(`Organization not found: ${organizationId}`);
	return org;
}

/**
 * Idempotent: return cached entry from organizations.ghlCountryFieldMap, or
 * create the GHL custom field (SINGLE_OPTIONS, contact model) and persist.
 */
export async function ensureCountryFieldExists(args: {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	organizationId: string;
	ghlLocationId: string;
	ghlApiKey: string;
	countryNodeId: string;
	countryName: string;
}): Promise<{ ghlFieldId: string; fieldKey: string }> {
	const org = await readOrgRow(args.controlPanelDb, args.organizationId);
	const map: CountryFieldMap =
		(org.ghlCountryFieldMap as CountryFieldMap | null) ?? {};
	const cached = map[args.countryNodeId];
	if (cached) {
		return { ghlFieldId: cached.ghlFieldId, fieldKey: cached.fieldKey };
	}

	const fieldKey = `${slugifyCountry(args.countryName)}_location`;
	const created = await ghlFetch<{ id: string; customField?: { id: string } }>({
		method: "POST",
		path: `/locations/${args.ghlLocationId}/customFields`,
		apiKey: args.ghlApiKey,
		body: {
			name: `Select Preferred Branch in ${args.countryName}`,
			fieldKey,
			dataType: "SINGLE_OPTIONS",
			model: "contact",
			options: [],
		},
	});
	const ghlFieldId = created.customField?.id ?? created.id;
	if (!ghlFieldId) {
		throw new Error("GHL did not return an id for the new custom field");
	}

	const newEntry: CountryFieldEntry = {
		ghlFieldId,
		fieldKey,
		createdAt: new Date().toISOString(),
	};
	const newEntryJson = JSON.stringify(newEntry);

	// Atomic jsonb merge at the SQL level: COALESCE handles a NULL map,
	// jsonb_set targets only this country's key, and the whole expression
	// evaluates in a single UPDATE so concurrent calls for different
	// countries don't stomp each other's entries.
	await args.controlPanelDb
		.update(organizations)
		.set({
			ghlCountryFieldMap: sql`jsonb_set(COALESCE(${organizations.ghlCountryFieldMap}, '{}'::jsonb), ARRAY[${args.countryNodeId}]::text[], ${newEntryJson}::jsonb, true)`,
			updatedAt: new Date(),
		})
		.where(eq(organizations.id, args.organizationId));

	return { ghlFieldId, fieldKey };
}

async function readFieldOptions(args: {
	ghlLocationId: string;
	ghlApiKey: string;
	ghlFieldId: string;
}): Promise<string[]> {
	const res = await ghlFetch<{
		customField?: GhlCustomField;
		options?: string[];
	}>({
		method: "GET",
		path: `/locations/${args.ghlLocationId}/customFields/${args.ghlFieldId}`,
		apiKey: args.ghlApiKey,
	});
	const opts = res.customField?.options ?? res.options ?? [];
	return [...opts];
}

async function putFieldOptions(args: {
	ghlLocationId: string;
	ghlApiKey: string;
	ghlFieldId: string;
	options: string[];
}): Promise<void> {
	await ghlFetch<unknown>({
		method: "PUT",
		path: `/locations/${args.ghlLocationId}/customFields/${args.ghlFieldId}`,
		apiKey: args.ghlApiKey,
		body: { options: args.options },
	});
}

export async function ensureBranchOption(args: {
	ghlLocationId: string;
	ghlApiKey: string;
	ghlFieldId: string;
	optionLabel: string;
}): Promise<string[]> {
	const existing = await readFieldOptions(args);
	if (existing.includes(args.optionLabel)) return existing;
	const next = [...existing, args.optionLabel];
	await putFieldOptions({ ...args, options: next });
	return next;
}

export async function removeBranchOption(args: {
	ghlLocationId: string;
	ghlApiKey: string;
	ghlFieldId: string;
	optionLabel: string;
}): Promise<string[]> {
	const existing = await readFieldOptions(args);
	if (!existing.includes(args.optionLabel)) return existing;
	const next = existing.filter((o) => o !== args.optionLabel);
	await putFieldOptions({ ...args, options: next });
	return next;
}

export async function renameBranchOption(args: {
	ghlLocationId: string;
	ghlApiKey: string;
	ghlFieldId: string;
	oldLabel: string;
	newLabel: string;
}): Promise<string[]> {
	if (args.oldLabel === args.newLabel) return readFieldOptions(args);
	const existing = await readFieldOptions(args);
	const hasOld = existing.includes(args.oldLabel);
	const hasNew = existing.includes(args.newLabel);
	if (!hasOld && hasNew) return existing; // already migrated
	const filtered = existing.filter(
		(o) => o !== args.oldLabel && o !== args.newLabel,
	);
	const next = [...filtered, args.newLabel];
	await putFieldOptions({ ...args, options: next });
	return next;
}

export type SyncBranchResult =
	| { status: "synced"; ghlFieldId: string; optionLabel: string }
	| { status: "skipped"; reason: "not-provisioned" | "non-branch" }
	| { status: "error"; error: string };

/**
 * High-level orchestrator. Reads org config, skips if not org-shared, then
 * ensures both the country field and the branch option exist in GHL.
 */
export async function syncBranchToGhl(args: {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	branchNodeId: string;
	decryptApiKey: (encrypted: string) => string;
}): Promise<SyncBranchResult> {
	try {
		const org = await readOrgRow(args.controlPanelDb, args.organizationId);
		if (
			org.ghlSyncModel !== "org-shared" ||
			!org.ghlLocationId ||
			!org.ghlApiKeyEncrypted
		) {
			return { status: "skipped", reason: "not-provisioned" };
		}

		const apiKey = args.decryptApiKey(org.ghlApiKeyEncrypted);
		const path = await resolveBranchPath(
			args.tenantDb,
			args.branchNodeId,
			args.organizationId,
		);

		const { ghlFieldId } = await ensureCountryFieldExists({
			controlPanelDb: args.controlPanelDb,
			organizationId: args.organizationId,
			ghlLocationId: org.ghlLocationId,
			ghlApiKey: apiKey,
			countryNodeId: path.countryNodeId,
			countryName: path.countryName,
		});

		await ensureBranchOption({
			ghlLocationId: org.ghlLocationId,
			ghlApiKey: apiKey,
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
}

/**
 * Helper for the hierarchy router. Returns true if the org is configured
 * for the org-shared GHL sync model and has been provisioned.
 */
export async function shouldSyncOrgShared(
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
): Promise<boolean> {
	const org = await controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.id, organizationId),
	});
	return (
		org?.ghlSyncModel === "org-shared" &&
		!!org.ghlLocationId &&
		!!org.ghlApiKeyEncrypted
	);
}
