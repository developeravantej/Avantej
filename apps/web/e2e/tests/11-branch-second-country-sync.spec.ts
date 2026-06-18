/**
 * Demo walkthrough 11: Real GHL branch CRUD in a SECOND country.
 *
 * Verifies the lazy provisioning of a per-country GHL custom field:
 * the first branch created under a country WITHOUT an existing entry in
 * `organizations.ghl_country_field_map` triggers `ensureCountryFieldExists`
 * which POSTs `/locations/:locId/customFields` to create `${slug}_location`
 * with the new branch as the first option.
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "11"
 *
 * Skipped if no Thailand country node exists in the tenant hierarchy —
 * we don't auto-seed it because country creation has org-wide side effects.
 *
 * Side effects:
 *   - Creates a real branch node in tenant.hierarchy_nodes
 *   - May POST a new GHL custom field `thailand_location` on the connected
 *     location (only on first run in a fresh org — subsequent runs hit the
 *     append-path because the field is now cached)
 *   - finally{} archives the branch row + best-effort removes the option from
 *     the GHL field. NEVER deletes the GHL custom field itself, since other
 *     real branches may depend on it.
 *
 * Idempotent: handles both pre-state cases.
 *   - provision-path: map entry was missing → expect new entry + field create
 *   - append-path:    map entry already existed → expect option appended
 * The exercised path is recorded via test.info().annotations.
 */

import { test, expect } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { decrypt } from "@avantej-core/db";
import { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

test.use({ video: "on" });

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

interface GhlCustomFieldResponse {
	id: string;
	name?: string;
	fieldKey?: string;
	dataType?: string;
	picklistOptions?: Array<string | { value?: string; label?: string }>;
	options?: Array<string | { value?: string; label?: string }>;
}

async function ghlGetCustomField(
	apiKey: string,
	locId: string,
	fieldId: string,
): Promise<{
	status: number;
	body: { customField?: GhlCustomFieldResponse } | null;
}> {
	const res = await fetch(
		`${GHL_BASE_URL}/locations/${locId}/customFields/${fieldId}`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: GHL_API_VERSION,
				Accept: "application/json",
			},
		},
	);
	if (!res.ok) return { status: res.status, body: null };
	return {
		status: res.status,
		body: (await res.json()) as { customField?: GhlCustomFieldResponse },
	};
}

function extractOptionLabels(
	field: GhlCustomFieldResponse | undefined,
): string[] {
	if (!field) return [];
	const raw = field.picklistOptions ?? field.options ?? [];
	return raw.map((opt) =>
		typeof opt === "string" ? opt : (opt.label ?? opt.value ?? ""),
	);
}

interface CountryFieldEntry {
	ghlFieldId: string;
	fieldKey: string;
	createdAt?: string;
}
type CountryFieldMap = Record<string, CountryFieldEntry>;

test.describe("real GHL — second country", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("11 — branch CRUD in a 2nd country provisions per-country custom field", async ({
		page,
	}) => {
		const cp = getControlPanelDb();
		const t = await getTenantDb();

		// ── Lookup connected branch (gives us locationId + apiKey + orgId) ────
		const branchLink = await cp.query.ghlBranchLinks.findFirst({
			where: eq(ghlBranchLinks.isActive, true),
		});
		if (!branchLink) {
			throw new Error(
				"No active ghl_branch_links row. Connect a branch via the UI first.",
			);
		}
		const apiKey = decrypt(branchLink.ghlApiKey);
		expect(apiKey.startsWith("pit-"), "expected real PIT API key").toBeTruthy();
		const ghlLocationId = branchLink.ghlLocationId;
		const organizationId = branchLink.organizationId;

		// ── Locate Singapore country node + a state under it ────────────────
		const thailand = await t.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.type, "country"),
				eq(hierarchyNodes.name, "Singapore"),
				isNull(hierarchyNodes.archivedAt),
			),
		});
		test.skip(
			!thailand,
			"Singapore country node not seeded; add Singapore hierarchy (country + state) to enable",
		);
		// Type narrow for TS — `test.skip(!thailand, ...)` aborts but doesn't refine.
		if (!thailand) return;

		const thaiState = await t.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.type, "state"),
				eq(hierarchyNodes.parentId, thailand.id),
				isNull(hierarchyNodes.archivedAt),
			),
		});
		test.skip(
			!thaiState,
			"No state node under Singapore; seed at least one state to enable spec",
		);
		if (!thaiState) return;

		// ── Pre-flight: capture pre-state of ghl_country_field_map ────────────
		const orgBefore = await cp.query.organizations.findFirst({
			where: eq(organizations.id, organizationId),
		});
		if (!orgBefore) throw new Error(`Organization ${organizationId} not found`);
		const mapBefore: CountryFieldMap =
			(orgBefore.ghlCountryFieldMap as CountryFieldMap | null) ?? {};
		const preExisting = mapBefore[thailand.id];
		const path = preExisting ? "append" : "provision";
		test.info().annotations.push({
			type: "ghl-path",
			description: `Exercised ${path}-path (preExisting=${preExisting ? preExisting.ghlFieldId : "none"})`,
		});

		const suffix = Date.now();
		const branchName = `E2E SG Branch ${suffix}`;
		const branchCode = `E2ESG${suffix}`;
		// Mirror branch-sync.composeOptionLabel(statePrefix, branchName)
		// where statePrefix = thaiState.name and separator = " - ".
		const expectedOptionLabel = `${thaiState.name} - ${branchName}`;
		const expectedFieldKey = "singapore_location";

		let createdBranchId: string | null = null;

		try {
			// ── Step 1: Login admin ───────────────────────────────────────────
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);

			// ── Step 2: Navigate to Create Branch ─────────────────────────────
			// NOTE: route + selectors verified against
			// apps/web/src/routes/_authenticated/dashboard/_layout/branch/create.tsx
			// and apps/web/src/components/forms/hierarchical-branch-form.tsx
			// (id="country_name" on inputs, "Continue to State" / "Continue to
			// Branch" / "Create Branch" buttons, SelectItem values are node ids).
			await page.goto("/dashboard/branch/create");
			await page.waitForLoadState("networkidle");
			await expect(
				page.getByRole("heading", { name: /Create Branch/i }).first(),
			).toBeVisible({ timeout: 10_000 });

			// ── Step 3: Step 1 — pick existing Thailand country ───────────────
			// The country Select is rendered when not in "create new" mode; it
			// uses Radix Select so we open via the trigger and click the option.
			// We locate the trigger by its preceding Label "Select Country".
			const countryLabel = page.getByText("Select Country", { exact: true });
			await expect(countryLabel).toBeVisible({ timeout: 10_000 });
			// The trigger is the immediate sibling combobox under that label.
			const countryTrigger = page.getByRole("combobox").first();
			await countryTrigger.click();
			await page
				.getByRole("option", { name: new RegExp(`^${thailand.name}`) })
				.first()
				.click();

			// ── Step 4: Step 2 — pick existing state under Thailand ───────────
			// handleCountrySelect auto-advances to Step 2.
			const stateLabel = page.getByText("Select State", { exact: true });
			await expect(stateLabel).toBeVisible({ timeout: 10_000 });
			const stateTrigger = page.getByRole("combobox").first();
			await stateTrigger.click();
			await page
				.getByRole("option", { name: new RegExp(`^${thaiState.name}`) })
				.first()
				.click();

			// ── Step 5: Step 3 — fill branch form + submit ────────────────────
			await expect(page.locator("#branch_name")).toBeVisible({
				timeout: 10_000,
			});
			await page.locator("#branch_name").fill(branchName);
			await page.locator("#branch_code").fill(branchCode);

			// Real GHL POST happens during submit — allow generous timeout.
			await page.getByRole("button", { name: /^Create Branch$/i }).click();

			// ── Step 6: DB assert — new branch row exists ─────────────────────
			const newBranch = await waitForDb(
				() =>
					t.query.hierarchyNodes.findFirst({
						where: and(
							eq(hierarchyNodes.type, "branch"),
							eq(hierarchyNodes.name, branchName),
						),
					}),
				{ timeoutMs: 30_000 },
			);
			createdBranchId = newBranch.id;
			expect(newBranch.parentId).toBe(thaiState.id);

			// ── Step 7: org map now has Thailand entry with valid ghlFieldId ──
			const mapAfter = await waitForDb(
				async () => {
					const org = await cp.query.organizations.findFirst({
						where: eq(organizations.id, organizationId),
					});
					const m = (org?.ghlCountryFieldMap as CountryFieldMap | null) ?? {};
					return m[thailand.id] ? m : undefined;
				},
				{ timeoutMs: 20_000 },
			);
			const entry = mapAfter[thailand.id];
			expect(entry).toBeTruthy();
			expect(entry.ghlFieldId).toBeTruthy();
			expect(entry.ghlFieldId.length).toBeGreaterThan(8);
			expect(entry.fieldKey).toBe(expectedFieldKey);

			if (path === "append") {
				// Should be the same fieldId we saw pre-flight.
				expect(entry.ghlFieldId).toBe(preExisting?.ghlFieldId);
			}

			// ── Step 8: Round-trip to GHL — field exists + has our option ─────
			const live = await ghlGetCustomField(
				apiKey,
				ghlLocationId,
				entry.ghlFieldId,
			);
			expect(live.status).toBe(200);
			const field = live.body?.customField;
			expect(field).toBeTruthy();
			// fieldKey on the GHL side may be prefixed with "contact." for
			// contact-model fields (see ensureCountryFieldExists discovery).
			expect(field?.fieldKey ?? "").toMatch(
				new RegExp(`(^|\\.)${expectedFieldKey}$`),
			);
			expect(field?.dataType).toBe("SINGLE_OPTIONS");

			const labels = extractOptionLabels(field);
			expect(
				labels.some((l) => l === expectedOptionLabel),
				`expected option "${expectedOptionLabel}" in field options, got: ${JSON.stringify(labels)}`,
			).toBeTruthy();
		} finally {
			const skipCleanup = process.env.E2E_SKIP_GHL_CLEANUP === "1";
			if (skipCleanup) {
				console.log(
					`[teardown] E2E_SKIP_GHL_CLEANUP=1 — leaving branch=${createdBranchId} option="${expectedOptionLabel}" for inspection`,
				);
				return;
			}

			// ── Branch cleanup ────────────────────────────────────────────────
			// Soft-archive only (delete may hit FK from country_node_id).
			if (createdBranchId) {
				try {
					await t
						.update(hierarchyNodes)
						.set({ archivedAt: new Date(), updatedAt: new Date() })
						.where(eq(hierarchyNodes.id, createdBranchId));
				} catch (e) {
					console.warn("[teardown] branch archive:", e);
				}
			}

			// ── Best-effort: remove the option from the GHL field ─────────────
			// We deliberately DO NOT delete the custom field itself — other real
			// branches in this country (or future runs) depend on it.
			// Removal-by-option-label requires a PUT with the full picklistOptions
			// minus the one we added. If the upstream API surface changes this
			// is the safest no-op: leave the orphan label and log it.
			try {
				const orgRow = await cp.query.organizations.findFirst({
					where: eq(organizations.id, organizationId),
				});
				const m = (orgRow?.ghlCountryFieldMap as CountryFieldMap | null) ?? {};
				const fid = m[thailand.id]?.ghlFieldId;
				if (fid) {
					const live = await ghlGetCustomField(apiKey, ghlLocationId, fid);
					const labels = extractOptionLabels(live.body?.customField).filter(
						(l) => l !== expectedOptionLabel,
					);
					const res = await fetch(
						`${GHL_BASE_URL}/locations/${ghlLocationId}/customFields/${fid}`,
						{
							method: "PUT",
							headers: {
								Authorization: `Bearer ${apiKey}`,
								Version: GHL_API_VERSION,
								Accept: "application/json",
								"Content-Type": "application/json",
							},
							body: JSON.stringify({ options: labels }),
						},
					);
					if (!res.ok) {
						console.warn(
							`[teardown] GHL PUT option-trim failed: ${res.status} ${await res.text()}`,
						);
					}
				}
			} catch (e) {
				console.warn("[teardown] GHL option trim:", e);
			}
		}
	});
});
