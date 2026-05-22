// apps/server/src/services/ghl/staff-option-sync.ts
/**
 * Avantej-managed GHL "Primary Staff" SINGLE_OPTIONS dropdown (Path C).
 *
 * Desired-state reconcile: on any staff change we rebuild the WHOLE option list
 * from the org's currently-active synced staff, PUT it to GHL, and store each
 * member's unique label on ghl_user_links. This handles add / rename / delete /
 * duplicate-name disambiguation in one shot (no need to track the previous name)
 * and makes inbound lead resolution an exact label match.
 *
 * Pure orchestration — callers pass tenantDb + controlPanelDb + decryptApiKey
 * for testability (mirrors branch-sync.ts).
 */

import { and, eq, inArray } from "drizzle-orm";
import { user } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { ghlFetch } from "./http-client";
import {
	buildStaffOptionLabels,
	type StaffForLabel,
} from "./staff-option-labels";
import type { GhlCustomField } from "./types";

const PRIMARY_STAFF_FIELD_KEY = "primary_staff";

/**
 * Idempotent: return cached organizations.ghlPrimaryStaffFieldId, discover an
 * existing field by fieldKey, or create the SINGLE_OPTIONS field. GHL requires
 * ≥1 option on creation, so `initialOption` seeds a fresh field.
 */
export async function ensurePrimaryStaffField(args: {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	organizationId: string;
	ghlLocationId: string;
	ghlApiKey: string;
	initialOption: string;
}): Promise<string> {
	const org = await args.controlPanelDb.query.organizations.findFirst({
		where: eq(organizations.id, args.organizationId),
	});
	if (!org) throw new Error(`Organization not found: ${args.organizationId}`);
	if (org.ghlPrimaryStaffFieldId) return org.ghlPrimaryStaffFieldId;

	// Discovery: a field with this key may already exist on the GHL location.
	const list = await ghlFetch<{ customFields?: GhlCustomField[] }>({
		method: "GET",
		path: `/locations/${args.ghlLocationId}/customFields`,
		apiKey: args.ghlApiKey,
	});
	const targetKey = `contact.${PRIMARY_STAFF_FIELD_KEY}`;
	const existing = (list.customFields ?? []).find(
		(f) =>
			f.fieldKey === PRIMARY_STAFF_FIELD_KEY || f.fieldKey === targetKey,
	);
	let ghlFieldId: string | undefined = existing?.id;

	if (!ghlFieldId) {
		const created = await ghlFetch<{
			id: string;
			customField?: { id: string };
		}>({
			method: "POST",
			path: `/locations/${args.ghlLocationId}/customFields`,
			apiKey: args.ghlApiKey,
			body: {
				name: "Primary Staff",
				fieldKey: PRIMARY_STAFF_FIELD_KEY,
				dataType: "SINGLE_OPTIONS",
				model: "contact",
				options: [args.initialOption],
			},
		});
		ghlFieldId = created.customField?.id ?? created.id;
	}
	if (!ghlFieldId) {
		throw new Error("GHL did not return an id for the Primary Staff field");
	}

	await args.controlPanelDb
		.update(organizations)
		.set({ ghlPrimaryStaffFieldId: ghlFieldId, updatedAt: new Date() })
		.where(eq(organizations.id, args.organizationId));

	return ghlFieldId;
}

export type ReconcileResult =
	| { status: "synced"; ghlFieldId: string; optionCount: number }
	| { status: "skipped"; reason: "not-provisioned" | "no-active-staff" }
	| { status: "error"; error: string };

/**
 * Rebuild the Primary Staff option list from currently-active synced staff and
 * persist each member's label. Safe to call after any staff create/update/delete.
 */
export async function reconcilePrimaryStaffOptions(args: {
	controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	decryptApiKey: (encrypted: string) => string;
}): Promise<ReconcileResult> {
	try {
		const org = await args.controlPanelDb.query.organizations.findFirst({
			where: eq(organizations.id, args.organizationId),
		});
		if (
			!org ||
			org.ghlSyncModel !== "org-shared" ||
			!org.ghlLocationId ||
			!org.ghlApiKeyEncrypted
		) {
			return { status: "skipped", reason: "not-provisioned" };
		}
		const apiKey = args.decryptApiKey(org.ghlApiKeyEncrypted);

		// Active synced staff = active ghl_user_links joined to active members.
		const links = await args.tenantDb
			.select({
				memberId: ghlUserLinks.memberId,
				userId: ghlUserLinks.userId,
				branchNodeId: ghlUserLinks.branchNodeId,
			})
			.from(ghlUserLinks)
			.innerJoin(members, eq(members.id, ghlUserLinks.memberId))
			.where(
				and(
					eq(ghlUserLinks.syncStatus, "active"),
					eq(members.status, "active"),
				),
			);
		if (links.length === 0) {
			return { status: "skipped", reason: "no-active-staff" };
		}

		// Names (control-panel) + branch names (tenant) for label building.
		const userRows = await args.controlPanelDb
			.select({
				id: user.id,
				name: user.name,
				firstName: user.firstName,
				lastName: user.lastName,
			})
			.from(user)
			.where(
				inArray(
					user.id,
					links.map((l) => l.userId),
				),
			);
		const nameByUserId = new Map(
			userRows.map((u) => [
				u.id,
				(u.name && u.name.trim()) ||
					`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
			]),
		);

		const branchIds = [...new Set(links.map((l) => l.branchNodeId))];
		const branchRows = await args.tenantDb
			.select({ id: hierarchyNodes.id, name: hierarchyNodes.name })
			.from(hierarchyNodes)
			.where(inArray(hierarchyNodes.id, branchIds));
		const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]));

		const staff: StaffForLabel[] = links.map((l) => ({
			memberId: l.memberId,
			name: nameByUserId.get(l.userId) ?? "",
			branchName: branchNameById.get(l.branchNodeId) ?? null,
		}));
		const labels = buildStaffOptionLabels(staff);
		if (labels.length === 0) {
			return { status: "skipped", reason: "no-active-staff" };
		}

		const optionStrings = labels.map((l) => l.label);

		const ghlFieldId = await ensurePrimaryStaffField({
			controlPanelDb: args.controlPanelDb,
			organizationId: args.organizationId,
			ghlLocationId: org.ghlLocationId,
			ghlApiKey: apiKey,
			initialOption: optionStrings[0] ?? "—",
		});

		// Desired-state: PUT the full options array (replaces existing).
		await ghlFetch<unknown>({
			method: "PUT",
			path: `/locations/${org.ghlLocationId}/customFields/${ghlFieldId}`,
			apiKey,
			body: { options: optionStrings },
		});

		// Persist each member's label so inbound can resolve label → member.
		// Single UPDATE … FROM (values) keeps it to one round-trip.
		for (const { memberId, label } of labels) {
			await args.tenantDb
				.update(ghlUserLinks)
				.set({ primaryStaffOptionLabel: label, updatedAt: new Date() })
				.where(eq(ghlUserLinks.memberId, memberId));
		}

		return {
			status: "synced",
			ghlFieldId,
			optionCount: optionStrings.length,
		};
	} catch (err) {
		return {
			status: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
