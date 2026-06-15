// apps/server/src/services/ghl/payload-builders.ts
/**
 * Pure transform functions: Avantej entities → GHL payloads.
 *
 * No I/O. Easy to unit-test. The orchestrators (sync-customer.ts,
 * sync-staff.ts) compose these with ghlFetch and DB writes.
 */

import type { GhlContactPayload, GhlUserPayload } from "./types";

export interface AvantejUser {
	id: string;
	email: string;
	firstName?: string | null;
	lastName?: string | null;
	name?: string | null;
	phone?: string | null;
}

export interface AvantejCustomerProfile {
	id: string;
	// Nullable since Phase 4 — dependents in an account_group have no
	// control-panel user. GHL sync callers must early-return when this is null.
	userId: string | null;
	phone: string | null;
	dateOfBirth: Date | null;
	gender: string | null;
	address: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	medicalNotes: string | null;
	fitnessGoals: string[] | null;
	creditPoints: number;
	notes: string | null;
	isDeleted: boolean;
	deletedAt: Date | null;
	deletedSource: string | null;
}

export type CustomFieldKey =
	| "gender"
	| "emergencyContactName"
	| "emergencyContactPhone"
	| "medicalNotes"
	| "creditPoints"
	| "notes";

/**
 * Map of CustomFieldKey → GHL custom-field id (resolved per location).
 * Keys missing from the map are skipped (custom field not configured).
 */
export type CustomFieldIdMap = Partial<Record<CustomFieldKey, string>>;

export interface BuildContactArgs {
	locationId: string;
	user: AvantejUser;
	profile: AvantejCustomerProfile;
	memberStatus: "active" | "inactive";
	customFieldIds: CustomFieldIdMap;
	// Phase G org-shared model: stamps the per-country branch dropdown so GHL
	// knows which Avantej branch this contact belongs to. All three are
	// optional — when absent, no branch stamp is added (legacy per-branch
	// model continues working unchanged).
	branchCountryFieldId?: string | null;
	branchOptionLabel?: string | null;
}

export function buildContactPayload(args: BuildContactArgs): GhlContactPayload {
	const { locationId, user, profile, memberStatus, customFieldIds } = args;

	const tags: string[] = [];
	tags.push(
		memberStatus === "active" ? "customer:active" : "customer:inactive",
	);
	if (profile.fitnessGoals) {
		for (const g of profile.fitnessGoals) tags.push(`goal:${g}`);
	}

	const customFields: Array<{ id: string; value: string | number }> = [];
	const addCustomField = (
		key: CustomFieldKey,
		value: string | number | null,
	) => {
		const id = customFieldIds[key];
		if (id && value !== null && value !== "") {
			customFields.push({ id, value });
		}
	};
	addCustomField("gender", profile.gender);
	addCustomField("emergencyContactName", profile.emergencyContactName);
	addCustomField("emergencyContactPhone", profile.emergencyContactPhone);
	addCustomField("medicalNotes", profile.medicalNotes);
	addCustomField("creditPoints", profile.creditPoints);
	addCustomField("notes", profile.notes);

	if (args.branchCountryFieldId && args.branchOptionLabel) {
		customFields.push({
			id: args.branchCountryFieldId,
			value: args.branchOptionLabel,
		});
	}

	return {
		locationId,
		email: user.email,
		firstName: user.firstName ?? undefined,
		lastName: user.lastName ?? undefined,
		name: user.name ?? undefined,
		phone: profile.phone ?? undefined,
		address1: profile.address ?? undefined,
		dateOfBirth: profile.dateOfBirth
			? profile.dateOfBirth.toISOString().split("T")[0]
			: undefined,
		tags,
		customFields,
		source: "Avantej Sync",
	};
}

export interface BuildUserArgs {
	companyId: string;
	locationId: string;
	user: AvantejUser;
	memberRole: "admin" | "staff" | "trainer";
	// Phase G org-shared model: stamps the per-country branch dropdown so GHL
	// knows which Avantej branch this user belongs to. Both optional — when
	// absent, no branch stamp is added (legacy per-branch model unchanged).
	branchCountryFieldId?: string | null;
	branchOptionLabel?: string | null;
}

/**
 * Per-role GHL capability bundles. Avantej `admin` -> GHL `admin` role with
 * default permissions (omitted = all-true on GHL side). Non-admin Avantej
 * roles get `user` role with explicit `assignedDataOnly:true` permissions
 * and matching scopes — principle of least privilege.
 *
 * Trainer = wider operational access (calendar, opportunities) than staff.
 */
const ROLE_CAPABILITIES: Record<
	"trainer" | "staff",
	{
		permissions: Record<string, boolean>;
		scopes: string[];
	}
> = {
	trainer: {
		permissions: {
			contactsEnabled: true,
			conversationsEnabled: true,
			appointmentsEnabled: true,
			opportunitiesEnabled: true,
			calendarsEnabled: true,
			assignedDataOnly: true,
		},
		scopes: [
			"contacts.write",
			"conversations.write",
			"opportunities.write",
			"calendars.write",
		],
	},
	staff: {
		permissions: {
			contactsEnabled: true,
			conversationsEnabled: true,
			appointmentsEnabled: true,
			assignedDataOnly: true,
		},
		scopes: ["contacts.write", "conversations.write"],
	},
};

export function buildUserPayload(args: BuildUserArgs): GhlUserPayload {
	const { companyId, locationId, user, memberRole } = args;

	const base: GhlUserPayload = {
		companyId,
		firstName: user.firstName ?? "",
		lastName: user.lastName ?? "",
		email: user.email,
		type: "account",
		role: memberRole === "admin" ? "admin" : "user",
		locationIds: [locationId],
		platformLanguage: "en_US",
	};

	// Pass phone only when non-empty. GHL rejects empty strings on this field
	// and we never want to overwrite an existing phone with a blank value.
	if (user.phone && user.phone.trim() !== "") {
		base.phone = user.phone;
	}

	// GHL POST/PUT /users/ does NOT accept `customFields` (returns 422
	// "property customFields should not exist"). Branch tagging on users is
	// not supported by the GHL Users API; the locationId on the user already
	// pins them to the sub-account, which is sufficient for org-shared mode.
	// branchCountryFieldId / branchOptionLabel are intentionally unused here.

	if (memberRole === "admin") {
		return base;
	}

	const caps = ROLE_CAPABILITIES[memberRole];
	return {
		...base,
		permissions: caps.permissions,
		scopes: caps.scopes,
		scopesAssignedToOnly: caps.scopes,
	};
}
