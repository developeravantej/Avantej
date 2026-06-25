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

	test("matches contact.-prefixed fieldKeys without creating duplicates", async () => {
		// GHL returns contact-model custom fields with a "contact." prefix on
		// fieldKey. Discovery must match these so re-provisioning does not POST
		// duplicate fields.
		let postCount = 0;
		const fetchMock = mock<
			(input: string, init?: RequestInit) => Promise<Response>
		>(async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (method === "GET" && url.includes("/customFields")) {
				return new Response(
					JSON.stringify({
						customFields: [
							{
								id: "cf_g",
								name: "Gender",
								fieldKey: "contact.gender",
								dataType: "TEXT",
							},
							{
								id: "cf_ecn",
								name: "Emergency Contact Name",
								fieldKey: "contact.emergency_contact_name",
								dataType: "TEXT",
							},
							{
								id: "cf_ecp",
								name: "Emergency Contact Phone",
								fieldKey: "contact.emergency_contact_phone",
								dataType: "PHONE",
							},
							{
								id: "cf_mn",
								name: "Medical Notes",
								fieldKey: "contact.medical_notes",
								dataType: "LARGE_TEXT",
							},
							{
								id: "cf_cp",
								name: "Credit Points",
								fieldKey: "contact.credit_points",
								dataType: "NUMERICAL",
							},
							{
								id: "cf_n",
								name: "Internal Notes",
								fieldKey: "contact.internal_notes",
								dataType: "LARGE_TEXT",
							},
							{
								id: "cf_dc",
								name: "Designated Country",
								fieldKey: "contact.designated_country",
								dataType: "TEXT",
							},
							{
								id: "cf_db",
								name: "Designated Branch",
								fieldKey: "contact.designated_branch",
								dataType: "TEXT",
							},
						],
					}),
					{ status: 200 },
				);
			}
			if (method === "POST" && url.includes("/customFields")) {
				postCount++;
				return new Response(JSON.stringify({ id: "cf_new" }), { status: 201 });
			}
			return new Response("", { status: 404 });
		});
		(globalThis as any).fetch = fetchMock;

		const result = await ensureCustomFieldsExist({
			apiKey: "k",
			locationId: "loc_1",
		});

		expect(postCount).toBe(0);
		expect(result.gender).toBe("cf_g");
		expect(result.emergencyContactName).toBe("cf_ecn");
		expect(result.emergencyContactPhone).toBe("cf_ecp");
		expect(result.medicalNotes).toBe("cf_mn");
		expect(result.creditPoints).toBe("cf_cp");
		expect(result.notes).toBe("cf_n");
		expect(result.designatedCountry).toBe("cf_dc");
		expect(result.designatedBranch).toBe("cf_db");
	});

	test("creates missing custom fields and returns the new ids", async () => {
		const fetchMock = mock<
			(input: string, init?: RequestInit) => Promise<Response>
		>(async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (method === "GET" && url.includes("/customFields")) {
				return new Response(JSON.stringify({ customFields: [] }), {
					status: 200,
				});
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
