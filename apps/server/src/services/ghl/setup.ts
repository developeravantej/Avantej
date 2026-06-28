// apps/server/src/services/ghl/setup.ts
/**
 * Setup utilities for connecting a new GHL location:
 *  - validateGhlApiKey: confirms an API key works for the given locationId
 *  - ensureCustomFieldsExist: idempotent custom-field provisioning
 */

import { ghlFetch } from "./http-client";
import type { CustomFieldIdMap, CustomFieldKey } from "./payload-builders";
import type { GhlCustomField, GhlLocation } from "./types";
import { GhlApiError } from "./types";

export async function validateGhlApiKey(
	apiKey: string,
	locationId: string,
): Promise<boolean> {
	try {
		const raw = await ghlFetch<unknown>({
			method: "GET",
			path: `/locations/${locationId}`,
			apiKey,
		});
		// GHL wraps in { location: { id, ... } }; accept bare too for safety.
		const loc =
			(raw as { location?: GhlLocation }).location ?? (raw as GhlLocation);
		return loc?.id === locationId;
	} catch (error) {
		if (error instanceof GhlApiError) return false;
		throw error;
	}
}

interface CustomFieldDef {
	key: CustomFieldKey;
	name: string;
	fieldKey: string;
	dataType: GhlCustomField["dataType"];
}

const REQUIRED_CUSTOM_FIELDS: CustomFieldDef[] = [
	{ key: "gender", name: "Gender", fieldKey: "gender", dataType: "TEXT" },
	{
		key: "emergencyContactName",
		name: "Emergency Contact Name",
		fieldKey: "emergency_contact_name",
		dataType: "TEXT",
	},
	{
		key: "emergencyContactPhone",
		name: "Emergency Contact Phone",
		fieldKey: "emergency_contact_phone",
		dataType: "PHONE",
	},
	{
		key: "medicalNotes",
		name: "Medical Notes",
		fieldKey: "medical_notes",
		dataType: "LARGE_TEXT",
	},
	{
		key: "creditPoints",
		name: "Credit Points",
		fieldKey: "credit_points",
		dataType: "NUMERICAL",
	},
	{
		key: "notes",
		name: "Internal Notes",
		fieldKey: "internal_notes",
		dataType: "LARGE_TEXT",
	},
	// Branch round-trip single-line fields. The GHL webhook template aliases
	// these to selected_country / selected_location on the way back into Avantej.
	{
		key: "designatedCountry",
		name: "Designated Country",
		fieldKey: "designated_country",
		dataType: "TEXT",
	},
	{
		key: "designatedBranch",
		name: "Designated Branch",
		fieldKey: "designated_branch",
		dataType: "TEXT",
	},
];

export async function ensureCustomFieldsExist(args: {
	apiKey: string;
	locationId: string;
}): Promise<CustomFieldIdMap> {
	const { apiKey, locationId } = args;

	const existing = await ghlFetch<{ customFields: GhlCustomField[] }>({
		method: "GET",
		path: `/locations/${locationId}/customFields`,
		apiKey,
	});

	const byFieldKey = new Map<string, string>();
	for (const cf of existing.customFields) {
		byFieldKey.set(cf.fieldKey, cf.id);
	}

	const result: CustomFieldIdMap = {};
	for (const def of REQUIRED_CUSTOM_FIELDS) {
		// GHL returns contact-model fieldKeys prefixed with "contact." — match
		// both the bare and prefixed forms so re-provisioning never creates
		// duplicate fields (mirrors branch-sync.ts discovery).
		const existingId =
			byFieldKey.get(def.fieldKey) ?? byFieldKey.get(`contact.${def.fieldKey}`);
		if (existingId) {
			result[def.key] = existingId;
			continue;
		}
		const created = await ghlFetch<{ id: string }>({
			method: "POST",
			path: `/locations/${locationId}/customFields`,
			apiKey,
			body: {
				name: def.name,
				fieldKey: def.fieldKey,
				dataType: def.dataType,
				model: "contact",
			},
		});
		result[def.key] = created.id;
	}
	return result;
}
