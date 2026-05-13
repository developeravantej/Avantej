// apps/server/src/services/ghl/payload-builders.test.ts
import { describe, test, expect } from "bun:test";
import { buildContactPayload, buildUserPayload } from "./payload-builders";

describe("buildContactPayload", () => {
	const baseUser = {
		id: "user_123",
		email: "aisha@example.com",
		firstName: "Aisha",
		lastName: "Tan",
		name: "Aisha Tan",
	};
	const baseProfile = {
		id: "cp_1",
		userId: "user_123",
		phone: "+60123456789",
		dateOfBirth: new Date("1990-05-15"),
		gender: "female",
		address: "123 Jalan KL",
		emergencyContactName: null,
		emergencyContactPhone: null,
		medicalNotes: null,
		fitnessGoals: ["weight_loss", "strength"],
		creditPoints: 100,
		notes: null,
		isDeleted: false,
		deletedAt: null,
		deletedSource: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	test("maps required fields", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(result.locationId).toBe("loc_1");
		expect(result.email).toBe("aisha@example.com");
		expect(result.firstName).toBe("Aisha");
		expect(result.lastName).toBe("Tan");
		expect(result.phone).toBe("+60123456789");
		expect(result.address1).toBe("123 Jalan KL");
		expect(result.dateOfBirth).toBe("1990-05-15");
	});

	test("converts fitness_goals to tags with goal: prefix", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(result.tags).toContain("goal:weight_loss");
		expect(result.tags).toContain("goal:strength");
	});

	test("adds customer:active tag when member is active", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(result.tags).toContain("customer:active");
		expect(result.tags).not.toContain("customer:inactive");
	});

	test("adds customer:inactive tag when member is inactive", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "inactive",
			customFieldIds: {},
		});
		expect(result.tags).toContain("customer:inactive");
		expect(result.tags).not.toContain("customer:active");
	});

	test("includes custom fields when ids are provided", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: { ...baseProfile, medicalNotes: "Allergic to nuts" },
			memberStatus: "active",
			customFieldIds: {
				medicalNotes: "cf_med",
				gender: "cf_gender",
				creditPoints: "cf_credits",
			},
		});
		expect(result.customFields).toContainEqual({
			id: "cf_med",
			value: "Allergic to nuts",
		});
		expect(result.customFields).toContainEqual({
			id: "cf_gender",
			value: "female",
		});
		expect(result.customFields).toContainEqual({
			id: "cf_credits",
			value: 100,
		});
	});

	test("omits custom fields when no id is provided for that key", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(result.customFields).toEqual([]);
	});

	test("handles null phone gracefully", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: { ...baseProfile, phone: null },
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(result.phone).toBeUndefined();
	});

	test("stamps branch dropdown when branchCountryFieldId and branchOptionLabel are provided", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: { ...baseProfile, medicalNotes: "Allergic to nuts" },
			memberStatus: "active",
			customFieldIds: { medicalNotes: "cf_med" },
			branchCountryFieldId: "cf_country_my",
			branchOptionLabel: "Selangor - KL Branch",
		});
		expect(result.customFields).toContainEqual({
			id: "cf_country_my",
			value: "Selangor - KL Branch",
		});
		// existing custom fields still present
		expect(result.customFields).toContainEqual({
			id: "cf_med",
			value: "Allergic to nuts",
		});
	});

	test("omits branch stamp when branchCountryFieldId or branchOptionLabel is null/absent", () => {
		const resultNoArgs = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(resultNoArgs.customFields).toEqual([]);

		const resultNullLabel = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
			branchCountryFieldId: "cf_country_my",
			branchOptionLabel: null,
		});
		expect(resultNullLabel.customFields).toEqual([]);

		const resultNullId = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
			branchCountryFieldId: null,
			branchOptionLabel: "Selangor - KL Branch",
		});
		expect(resultNullId.customFields).toEqual([]);
	});

	test("source defaults to 'Avantej Sync'", () => {
		const result = buildContactPayload({
			locationId: "loc_1",
			user: baseUser,
			profile: baseProfile,
			memberStatus: "active",
			customFieldIds: {},
		});
		expect(result.source).toBe("Avantej Sync");
	});
});

describe("buildUserPayload", () => {
	const baseUser = {
		id: "u_1",
		email: "sarah@example.com",
		firstName: "Sarah",
		lastName: "Lee",
		name: "Sarah Lee",
	};

	test("maps admin role with no permissions/scopes (GHL defaults)", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: baseUser,
			memberRole: "admin",
		});
		expect(result.role).toBe("admin");
		expect(result.type).toBe("account");
		expect(result.locationIds).toEqual(["loc_1"]);
		expect(result.email).toBe("sarah@example.com");
		expect(result.firstName).toBe("Sarah");
		expect(result.lastName).toBe("Lee");
		expect(result.companyId).toBe("agency_xyz");
		expect(result.platformLanguage).toBe("en_US");
		// admin -> rely on GHL defaults
		expect(result.permissions).toBeUndefined();
		expect(result.scopes).toBeUndefined();
		expect(result.scopesAssignedToOnly).toBeUndefined();
	});

	test("maps staff role with restricted permissions + scopes", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: baseUser,
			memberRole: "staff",
		});
		expect(result.role).toBe("user");
		expect(result.platformLanguage).toBe("en_US");
		expect(result.permissions).toEqual({
			contactsEnabled: true,
			conversationsEnabled: true,
			appointmentsEnabled: true,
			assignedDataOnly: true,
		});
		expect(result.scopes).toEqual([
			"contacts.write",
			"conversations.write",
		]);
		expect(result.scopesAssignedToOnly).toEqual(result.scopes);
	});

	test("passes phone through when user has a non-empty phone", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: { ...baseUser, phone: "+60142075523" },
			memberRole: "staff",
		});
		expect(result.phone).toBe("+60142075523");
	});

	test("omits phone when user.phone is null", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: { ...baseUser, phone: null },
			memberRole: "staff",
		});
		expect(result.phone).toBeUndefined();
	});

	test("omits phone when user.phone is empty string", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: { ...baseUser, phone: "" },
			memberRole: "admin",
		});
		expect(result.phone).toBeUndefined();
	});

	test("omits phone when user.phone is undefined", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: baseUser,
			memberRole: "admin",
		});
		expect(result.phone).toBeUndefined();
	});

	test("never emits customFields — GHL POST/PUT /users/ rejects it (422)", () => {
		// branchCountryFieldId / branchOptionLabel are accepted as args for
		// signature stability with buildContactPayload, but must NOT result
		// in a customFields key on the user payload. GHL Users API does not
		// support custom fields; locationId already pins branch in org-shared
		// mode.
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: baseUser,
			memberRole: "staff",
			branchCountryFieldId: "cf_country_my",
			branchOptionLabel: "Selangor - KL Branch",
		});
		expect(result.customFields).toBeUndefined();

		const resultNoArgs = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: baseUser,
			memberRole: "staff",
		});
		expect(resultNoArgs.customFields).toBeUndefined();
	});

	test("maps trainer role with wider permissions + scopes", () => {
		const result = buildUserPayload({
			companyId: "agency_xyz",
			locationId: "loc_1",
			user: baseUser,
			memberRole: "trainer",
		});
		expect(result.role).toBe("user");
		expect(result.platformLanguage).toBe("en_US");
		expect(result.permissions).toEqual({
			contactsEnabled: true,
			conversationsEnabled: true,
			appointmentsEnabled: true,
			opportunitiesEnabled: true,
			calendarsEnabled: true,
			assignedDataOnly: true,
		});
		expect(result.scopes).toEqual([
			"contacts.write",
			"conversations.write",
			"opportunities.write",
			"calendars.write",
		]);
		expect(result.scopesAssignedToOnly).toEqual(result.scopes);
	});
});
