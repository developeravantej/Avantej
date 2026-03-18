import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	buildGhlEventKey,
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
