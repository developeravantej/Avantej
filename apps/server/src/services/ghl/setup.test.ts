// apps/server/src/services/ghl/setup.test.ts
import { describe, test, expect, mock } from "bun:test";
import { validateGhlApiKey, ensureCustomFieldsExist } from "./setup";

describe("validateGhlApiKey", () => {
	test("returns true when GHL location lookup succeeds", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ id: "loc_1", name: "MOVE KL", companyId: "ag_1" }),
					{ status: 200 },
				),
			),
		);
		const ok = await validateGhlApiKey("k", "loc_1");
		expect(ok).toBe(true);
	});

	test("returns false when GHL returns 401", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(new Response("", { status: 401 })),
		);
		const ok = await validateGhlApiKey("bad_key", "loc_1");
		expect(ok).toBe(false);
	});

	test("returns false when location id mismatches", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({ id: "loc_other", name: "X", companyId: "ag_1" }),
					{ status: 200 },
				),
			),
		);
		const ok = await validateGhlApiKey("k", "loc_1");
		expect(ok).toBe(false);
	});
});

describe("ensureCustomFieldsExist", () => {
	test("returns existing field ids when all are already in GHL", async () => {
		(globalThis as any).fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						customFields: [
							{
								id: "cf_a",
								name: "Gender",
								fieldKey: "gender",
								dataType: "TEXT",
							},
							{
								id: "cf_b",
								name: "Medical Notes",
								fieldKey: "medical_notes",
								dataType: "LARGE_TEXT",
							},
						],
					}),
					{ status: 200 },
				),
			),
		);
		const result = await ensureCustomFieldsExist({
			apiKey: "k",
			locationId: "loc_1",
		});
		expect(result.gender).toBe("cf_a");
		expect(result.medicalNotes).toBe("cf_b");
	});

	test("creates missing custom fields and returns the new ids", async () => {
		const fetchMock = mock<(input: string, init?: RequestInit) => Promise<Response>>(async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (method === "GET" && url.includes("/customFields")) {
				return new Response(
					JSON.stringify({ customFields: [] }),
					{ status: 200 },
				);
			}
			if (method === "POST" && url.includes("/customFields")) {
				const body = JSON.parse(init!.body as string) as { name: string };
				return new Response(
					JSON.stringify({
						id: `cf_${body.name.toLowerCase().replace(/\s/g, "_")}`,
						name: body.name,
					}),
					{ status: 201 },
				);
			}
			return new Response("", { status: 404 });
		});
		(globalThis as any).fetch = fetchMock;

		const result = await ensureCustomFieldsExist({
			apiKey: "k",
			locationId: "loc_1",
		});
		expect(result.gender).toBeDefined();
		expect(result.medicalNotes).toBeDefined();
		// At least 6 custom fields: gender, ec name, ec phone, medical notes,
		// credit points, notes (per CustomFieldKey list)
		expect(Object.keys(result).length).toBeGreaterThanOrEqual(6);
	});
});
