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
}

export interface AvantejCustomerProfile {
	id: string;
	userId: string;
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
}

export function buildContactPayload(
	args: BuildContactArgs,
): GhlContactPayload {
	const { locationId, user, profile, memberStatus, customFieldIds } = args;

	const tags: string[] = [];
	tags.push(memberStatus === "active" ? "customer:active" : "customer:inactive");
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
}

export function buildUserPayload(args: BuildUserArgs): GhlUserPayload {
	const { companyId, locationId, user, memberRole } = args;
	return {
		companyId,
		firstName: user.firstName ?? "",
		lastName: user.lastName ?? "",
		email: user.email,
		type: "account",
		role: memberRole === "admin" ? "admin" : "user",
		locationIds: [locationId],
	};
}
