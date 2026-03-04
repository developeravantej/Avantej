import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	buildGhlEventKey,
	buildGhlResponseData,
	detectGhlEventType,
	extractGhlContactPayload,
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

	test("throws when email is missing", () => {
		expect(() => extractGhlContactPayload({ id: "ghl_777" })).toThrow(
			"Missing required field: email"
		);
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
