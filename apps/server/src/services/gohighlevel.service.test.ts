import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	applyAlphaCanonical,
	buildGhlEventKey,
	buildGhlResponseData,
	buildPlaceholderEmail,
	deriveDobFromAge,
	detectGhlEventType,
	extractCustomFieldsForProfile,
	extractGhlContactPayload,
	findHierarchyBranchByName,
	isPlaceholderEmail,
	verifyGhlWebhookAuth,
} from "./gohighlevel.service";

describe("GoHighLevel Service", () => {
	test("extracts contact payload from nested contact shape", () => {
		const payload = {
			contact: {
				id: "ghl_123",
				name: "Jane Doe",
				email: "jane@example.com",
				phone: "+60123456789",
			},
			customStatus: "client",
		};

		const extracted = extractGhlContactPayload(payload);

		expect(extracted.contactId).toBe("ghl_123");
		expect(extracted.name).toBe("Jane Doe");
		expect(extracted.email).toBe("jane@example.com");
		expect(extracted.phone).toBe("+60123456789");
		expect(extracted.dynamicFields).toEqual({ customStatus: "client" });
	});

	test("extracts email and phone from override fields when provided", () => {
		const payload = {
			contact: {
				id: "ghl_override_1",
				name: "Override User",
				email: "",
				phone: "",
				email_update_override: "override@example.com",
				phone_update_override: "+60111222333",
			},
		};

		const extracted = extractGhlContactPayload(payload);

		expect(extracted.contactId).toBe("ghl_override_1");
		expect(extracted.email).toBe("override@example.com");
		expect(extracted.phone).toBe("+60111222333");
	});

	test("extracts contact payload from flat selected-fields shape", () => {
		const payload = {
			id: "ghl_456",
			email: "john@example.com",
			phone: "+6598765432",
			name: "John Smith",
			lead_stage: "client",
		};

		const extracted = extractGhlContactPayload(payload);

		expect(extracted.contactId).toBe("ghl_456");
		expect(extracted.email).toBe("john@example.com");
		expect(extracted.dynamicFields).toEqual({ lead_stage: "client" });
	});

	test("builds requested webhook response data from nested contact fields", () => {
		const payload = {
			contact: {
				id: "ghl_999",
				name: "Jane Doe",
				first_name: "Jane",
				last_name: "Doe",
				email: "old-email@example.com",
				phone: "+60000000000",
				email_update_override: "jane@example.com",
				phone_update_override: "+60123456789",
				nric_no__id_no: "A1234567",
				homework_address_indicator: "home",
				full_address: "123 Main St",
				date_of_birth: "1990-01-01",
				emergency_contact_name: "John Doe",
				emergency_contact_no: "+60112223344",
				emergency_contact_relationship: "Brother",
				country_to_determine_branch__new: "MY",
				select_preferred_branch_1: "KL",
				select_main_branch_assigned_in_contract_for_service_thailand: "HQ",
				client_purchase: "Gold Package",
				commencement_date: "2026-03-01",
				currency_picker: "MYR",
				payment_method: "card",
				remark_on_paymentpackage: "Paid in full",
				primary_coach: "Coach A",
			},
		};

		const data = buildGhlResponseData(payload);

		expect(data).toEqual({
			id: "ghl_999",
			name: "Jane Doe",
			first_name: "Jane",
			last_name: "Doe",
			email: "jane@example.com",
			phone: "+60123456789",
			id_passport: "A1234567",
			address_type: "home",
			address: "123 Main St",
			dob: "1990-01-01",
			emergency_name: "John Doe",
			emergency_phone: "+60112223344",
			emergency_relationship: "Brother",
			country: "MY",
			location: "KLHQ",
			service: "Gold Package",
			service_start_date: "2026-03-01",
			currency: "MYR",
			payment_method: "card",
			remark: "Paid in full",
			primary_coach: "Coach A",
		});
	});

	test("builds requested webhook response data from flat selected-fields payload", () => {
		const payload = {
			id: "ghl_111",
			first_name: "John",
			last_name: "Smith",
			email: "old-john@example.com",
			email_update_override: "john@example.com",
			phone: "+60000000000",
			phone_update_override: "+6598765432",
			select_preferred_branch_1: "Penang",
		};

		const data = buildGhlResponseData(payload);

		expect(data.id).toBe("ghl_111");
		expect(data.first_name).toBe("John");
		expect(data.last_name).toBe("Smith");
		expect(data.name).toBe("John Smith");
		expect(data.email).toBe("john@example.com");
		expect(data.phone).toBe("+6598765432");
		expect(data.location).toBe("Penang");
		expect(data.primary_coach).toBeNull();
	});

	test("maps flat payload aliases used by gohighlevel custom webhook fields", () => {
		const payload = {
			id: "USerufAN3ZK3DfVfySqL",
			dob: "Jul 3rd 1989",
			name: "Chwan Ng",
			email: "ngchwanlii@gmail.com",
			phone: "+601139984911",
			remark: "Test",
			address: "Apt 3, San Mateo CA 94404",
			country: "Malaysia",
			service: "PT 2x12",
			currency: "MYR",
			location: "Kuala Lumpur - Desa Parkcitynull",
			last_name: "Ng",
			first_name: "Chwan",
			id_passport: "890703125617",
			address_type: "Work",
			primary_coach: "ADAM DOREE VICARY BIN DAUD",
			emergency_name: "Vivian Fam",
			payment_method: "Bank transfer",
			emergency_phone: "+60168730703",
			service_start_date: "2026-03-01",
			emergency_relationship: "Spouse",
		};

		const data = buildGhlResponseData(payload);

		expect(data.id).toBe("USerufAN3ZK3DfVfySqL");
		expect(data.name).toBe("Chwan Ng");
		expect(data.first_name).toBe("Chwan");
		expect(data.last_name).toBe("Ng");
		expect(data.email).toBe("ngchwanlii@gmail.com");
		expect(data.phone).toBe("+601139984911");
		expect(data.id_passport).toBe("890703125617");
		expect(data.address_type).toBe("Work");
		expect(data.address).toBe("Apt 3, San Mateo CA 94404");
		expect(data.dob).toBe("Jul 3rd 1989");
		expect(data.emergency_name).toBe("Vivian Fam");
		expect(data.emergency_phone).toBe("+60168730703");
		expect(data.emergency_relationship).toBe("Spouse");
		expect(data.country).toBe("Malaysia");
		expect(data.location).toBe("Kuala Lumpur - Desa Parkcitynull");
		expect(data.service).toBe("PT 2x12");
		expect(data.service_start_date).toBe("2026-03-01");
		expect(data.currency).toBe("MYR");
		expect(data.payment_method).toBe("Bank transfer");
		expect(data.remark).toBe("Test");
		expect(data.primary_coach).toBe("ADAM DOREE VICARY BIN DAUD");
	});

	test("throws when contact id is missing", () => {
		expect(() => extractGhlContactPayload({ email: "missing-id@example.com" })).toThrow(
			"Missing required field: contact.id"
		);
	});

	test("throws when both email and phone are missing", () => {
		expect(() => extractGhlContactPayload({ id: "ghl_777" })).toThrow(
			"Missing required field: email or phone",
		);
	});

	test("synthesizes placeholder email when only phone provided", () => {
		const extracted = extractGhlContactPayload({
			id: "ghl_phone_only",
			phone: "+60123456789",
		});
		expect(extracted.contactId).toBe("ghl_phone_only");
		expect(extracted.email).toBe("ghl-ghl_phone_only@ghl.placeholder");
		expect(extracted.emailIsPlaceholder).toBe(true);
		expect(extracted.phone).toBe("+60123456789");
	});

	test("emailIsPlaceholder is false when real email present", () => {
		const extracted = extractGhlContactPayload({
			id: "ghl_real",
			email: "real@example.com",
		});
		expect(extracted.emailIsPlaceholder).toBe(false);
		expect(extracted.email).toBe("real@example.com");
	});

	test("detects delete event type from explicit event type", () => {
		const eventType = detectGhlEventType({ eventType: "contact.delete" });
		expect(eventType).toBe("delete");
	});

	test("detects delete event type from deleted flag", () => {
		const eventType = detectGhlEventType({ deleted: true });
		expect(eventType).toBe("delete");
	});

	test("defaults to update for non-delete custom payloads", () => {
		const eventType = detectGhlEventType({ eventType: "contact.update" });
		expect(eventType).toBe("update");
	});

	test("builds stable event key for deterministic payload", async () => {
		const payloadA = {
			eventType: "contact.update",
			contact: {
				id: "ghl_abc",
				email: "stable@example.com",
			},
			x: 1,
			y: 2,
		};

		const payloadB = {
			y: 2,
			x: 1,
			contact: {
				email: "stable@example.com",
				id: "ghl_abc",
			},
			eventType: "contact.update",
		};

		const keyA = await buildGhlEventKey({
			locationId: "loc_1",
			contactId: "ghl_abc",
			eventType: "update",
			payload: payloadA,
		});
		const keyB = await buildGhlEventKey({
			locationId: "loc_1",
			contactId: "ghl_abc",
			eventType: "update",
			payload: payloadB,
		});

		expect(keyA).toBe(keyB);
		expect(keyA.startsWith("loc_1:ghl_abc:update:")).toBe(true);
	});

	test("accepts bearer token authorization when webhook secret is configured", async () => {
		await expect(
			verifyGhlWebhookAuth({
				rawBody: JSON.stringify({ id: "abc" }),
				signature: undefined,
				authorization: "Bearer super-secret",
				headerSecret: undefined,
				querySecret: undefined,
				webhookSecret: "super-secret",
			})
		).resolves.toBeUndefined();
	});

	test("accepts lowercase bearer authorization when webhook secret is configured", async () => {
		await expect(
			verifyGhlWebhookAuth({
				rawBody: JSON.stringify({ id: "abc" }),
				signature: undefined,
				authorization: "bearer super-secret",
				headerSecret: undefined,
				querySecret: undefined,
				webhookSecret: "super-secret",
			})
		).resolves.toBeUndefined();
	});

	test("accepts raw authorization token when webhook secret is configured", async () => {
		await expect(
			verifyGhlWebhookAuth({
				rawBody: JSON.stringify({ id: "abc" }),
				signature: undefined,
				authorization: "super-secret",
				headerSecret: undefined,
				querySecret: undefined,
				webhookSecret: "super-secret",
			})
		).resolves.toBeUndefined();
	});

	test("accepts x-wh-signature when webhook secret is configured", async () => {
		const rawBody = JSON.stringify({ id: "abc" });
		const signature = createHash("sha256").update(`${"super-secret"}.${rawBody}`).digest("hex");

		await expect(
			verifyGhlWebhookAuth({
				rawBody,
				signature,
				authorization: undefined,
				headerSecret: undefined,
				querySecret: undefined,
				webhookSecret: "super-secret",
			})
		).resolves.toBeUndefined();
	});

	test("rejects requests missing auth when webhook secret is configured", async () => {
		await expect(
			verifyGhlWebhookAuth({
				rawBody: JSON.stringify({ id: "abc" }),
				signature: undefined,
				authorization: undefined,
				headerSecret: undefined,
				querySecret: undefined,
				webhookSecret: "super-secret",
			})
		).rejects.toThrow("Missing or invalid webhook authorization");
	});
});

describe("applyAlphaCanonical (α strict canonical)", () => {
	test("skips with 'avantej-canonical' on update for linked contact", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "update",
		});
		expect(result).toEqual({ skip: true, reason: "avantej-canonical" });
	});

	test("skips with 'avantej-canonical' on delete for linked contact", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "delete",
		});
		expect(result).toEqual({ skip: true, reason: "avantej-canonical" });
	});

	test("skips with 'already-linked' on create for linked contact (echo / dedup)", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "create",
		});
		expect(result).toEqual({ skip: true, reason: "already-linked" });
	});

	test("does not skip on create for unlinked contact (form-submission flow)", () => {
		const result = applyAlphaCanonical({
			existingLink: null,
			eventType: "create",
		});
		expect(result).toEqual({ skip: false });
	});

	test("does not skip on update for unlinked contact (legacy upsert path)", () => {
		const result = applyAlphaCanonical({
			existingLink: null,
			eventType: "update",
		});
		expect(result).toEqual({ skip: false });
	});

	test("does not skip on custom event regardless of link state", () => {
		const linked = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "custom",
		});
		const unlinked = applyAlphaCanonical({
			existingLink: null,
			eventType: "custom",
		});
		expect(linked).toEqual({ skip: false });
		expect(unlinked).toEqual({ skip: false });
	});

	// Phase 2 carve-out: placeholder email backfill
	test("update with placeholder existing + real incoming → skip:false (backfill)", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "update",
			existingUserEmail: "ghl-abc@ghl.placeholder",
			incomingEmailIsPlaceholder: false,
		});
		expect(result).toEqual({ skip: false });
	});

	test("update with placeholder existing + placeholder incoming → still skipped", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "update",
			existingUserEmail: "ghl-abc@ghl.placeholder",
			incomingEmailIsPlaceholder: true,
		});
		expect(result).toEqual({ skip: true, reason: "avantej-canonical" });
	});

	test("update with real existing email is unaffected by carve-out", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "update",
			existingUserEmail: "real@example.com",
			incomingEmailIsPlaceholder: false,
		});
		expect(result).toEqual({ skip: true, reason: "avantej-canonical" });
	});

	test("delete on placeholder still canonical-skipped (no backfill via delete)", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "delete",
			existingUserEmail: "ghl-abc@ghl.placeholder",
			incomingEmailIsPlaceholder: false,
		});
		expect(result).toEqual({ skip: true, reason: "avantej-canonical" });
	});

	// Phase 3 carve-out: GHL only fires create, so backfill happens on re-submit.
	test("create re-submit with placeholder existing + real incoming → skip:false (backfill)", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "create",
			existingUserEmail: "ghl-xyz@ghl.placeholder",
			incomingEmailIsPlaceholder: false,
		});
		expect(result).toEqual({ skip: false });
	});

	test("create re-submit with placeholder + placeholder → still already-linked", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "create",
			existingUserEmail: "ghl-xyz@ghl.placeholder",
			incomingEmailIsPlaceholder: true,
		});
		expect(result).toEqual({ skip: true, reason: "already-linked" });
	});

	test("create re-submit with real existing email is unaffected by carve-out", () => {
		const result = applyAlphaCanonical({
			existingLink: { id: "lnk_1" },
			eventType: "create",
			existingUserEmail: "real@example.com",
			incomingEmailIsPlaceholder: false,
		});
		expect(result).toEqual({ skip: true, reason: "already-linked" });
	});
});

describe("Placeholder email helpers", () => {
	test("buildPlaceholderEmail produces ghl-<id>@ghl.placeholder", () => {
		expect(buildPlaceholderEmail("abc123")).toBe("ghl-abc123@ghl.placeholder");
	});

	test("isPlaceholderEmail detects placeholder domain", () => {
		expect(isPlaceholderEmail("ghl-xyz@ghl.placeholder")).toBe(true);
		expect(isPlaceholderEmail("real@example.com")).toBe(false);
		expect(isPlaceholderEmail(null)).toBe(false);
		expect(isPlaceholderEmail("")).toBe(false);
	});
});

describe("deriveDobFromAge", () => {
	test("returns Jan 1 of (currentYear - age) as UTC", () => {
		const now = new Date(Date.UTC(2026, 4, 19));
		const dob = deriveDobFromAge(30, now);
		expect(dob).not.toBeNull();
		expect(dob?.toISOString()).toBe("1996-01-01T00:00:00.000Z");
	});

	test("returns null for non-positive or absurd age", () => {
		expect(deriveDobFromAge(0)).toBeNull();
		expect(deriveDobFromAge(-5)).toBeNull();
		expect(deriveDobFromAge(200)).toBeNull();
		expect(deriveDobFromAge(Number.NaN)).toBeNull();
	});

	test("floors fractional age", () => {
		const now = new Date(Date.UTC(2026, 0, 1));
		const dob = deriveDobFromAge(25.9, now);
		expect(dob?.getUTCFullYear()).toBe(2001);
	});
});

describe("findHierarchyBranchByName", () => {
	const branches = [
		{ id: "b1", name: "KL Branch", type: "branch" },
		{ id: "b2", name: "Penang Branch", type: "branch" },
		{ id: "c1", name: "Malaysia", type: "country" },
	];

	test("matches branch name case-insensitively", () => {
		expect(findHierarchyBranchByName(branches, "kl branch")).toBe("b1");
		expect(findHierarchyBranchByName(branches, "  PENANG Branch  ")).toBe("b2");
	});

	test("returns null when no branch matches", () => {
		expect(findHierarchyBranchByName(branches, "Singapore")).toBeNull();
		expect(findHierarchyBranchByName(branches, "")).toBeNull();
		expect(findHierarchyBranchByName(branches, null)).toBeNull();
	});

	test("ignores non-branch nodes even if name matches", () => {
		expect(findHierarchyBranchByName(branches, "Malaysia")).toBeNull();
	});
});

describe("extractCustomFieldsForProfile", () => {
	test("extracts standard fields from nested contact", () => {
		const fields = extractCustomFieldsForProfile({
			contact: {
				id: "c1",
				gender: "female",
				age: "29",
				selected_country: "Malaysia",
				selected_location: "KL Branch",
				primary_staff: "Coach A",
				referrer_phone: "+60111222333",
				lead_acquisition_type: "Walk-in",
				lead_originator: "Instagram Campaign",
			},
		});
		expect(fields.gender).toBe("female");
		expect(fields.age).toBe(29);
		expect(fields.selectedCountry).toBe("Malaysia");
		expect(fields.selectedLocation).toBe("KL Branch");
		expect(fields.primaryStaff).toBe("Coach A");
		expect(fields.referrerPhone).toBe("+60111222333");
		expect(fields.leadAcquisitionType).toBe("Walk-in");
		expect(fields.leadOriginator).toBe("Instagram Campaign");
	});

	test("accepts sys_-prefixed and ops_-prefixed variants", () => {
		const fields = extractCustomFieldsForProfile({
			sys_selected_location: "Penang Branch",
			ops_primary_staff: "Coach B",
			sys_lead_acquisition_type: "Referral",
			sys_lead_originator: "Friend",
		});
		expect(fields.selectedLocation).toBe("Penang Branch");
		expect(fields.primaryStaff).toBe("Coach B");
		expect(fields.leadAcquisitionType).toBe("Referral");
		expect(fields.leadOriginator).toBe("Friend");
	});

	test("invalid age string yields null", () => {
		const fields = extractCustomFieldsForProfile({ age: "abc" });
		expect(fields.age).toBeNull();
	});

	test("empty strings yield null", () => {
		const fields = extractCustomFieldsForProfile({
			gender: "",
			selected_location: "",
		});
		expect(fields.gender).toBeNull();
		expect(fields.selectedLocation).toBeNull();
	});

	test("tolerates lead_originatator typo (matches GHL field id)", () => {
		const fields = extractCustomFieldsForProfile({
			contact: { lead_originatator: "Typo Source" },
		});
		expect(fields.leadOriginator).toBe("Typo Source");
	});

	test("treats literal 'null'/'undefined' strings from GHL merge tags as absent", () => {
		const fields = extractCustomFieldsForProfile({
			contact: {
				gender: "null",
				selected_location: "undefined",
				lead_acquisition_type: "NULL",
				lead_originator: "Undefined",
			},
		});
		expect(fields.gender).toBeNull();
		expect(fields.selectedLocation).toBeNull();
		expect(fields.leadAcquisitionType).toBeNull();
		expect(fields.leadOriginator).toBeNull();
	});
});
