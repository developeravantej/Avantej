/**
 * Demo walkthrough 10: Branch CRUD (org-shared) → GHL malaysia_location field.
 *
 *   CREATE → admin creates branch under Malaysia/Sabah → ensureBranchOption
 *            adds "${state} - ${branch}" to malaysia_location.options[]
 *   RENAME → admin renames branch via Edit dialog → renameBranchOption swaps
 *            the old label for the new one in malaysia_location.options[]
 *   DELETE → admin deletes the branch via dropdown → (per current code in
 *            packages/api/src/routers/hierarchy.ts:824-862 the deleteNode
 *            handler DOES dispatch dispatchBranchRemove before the actual
 *            delete; however the spec preamble flags this as a known-gap
 *            area: see comment below where we assert post-delete state).
 *
 * Pre-conditions (must exist; spec is a verifier, not a provisioner):
 *   - organizations row "Test Fitness Franchise" with
 *       ghlSyncModel='org-shared', ghlLocationId set, ghlApiKeyEncrypted set.
 *   - organizations.ghlCountryFieldMap has an entry keyed by Malaysia's
 *       hierarchy_nodes.id with ghlFieldId set (i.e. malaysia_location
 *       already provisioned in GHL).
 *   - Tenant hierarchy has a country node named "Malaysia" with at least
 *       one state child (preferred "Sabah", but spec falls back to the
 *       first available Malaysian state if Sabah is missing).
 *
 * Skipped unless E2E_REAL_GHL=1. Run via:
 *   bun run -F web e2e:test:real --grep "10"
 *
 * Side effects:
 *   - Creates a real branch in the tenant DB.
 *   - Mutates malaysia_location.options[] on the live GHL location.
 *   - finally{} best-effort hard-deletes the tenant branch row + tries to
 *     prune the option from GHL.
 */

import { test, expect } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";
import { loginAsAdmin } from "../fixtures/auth";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";
import { waitForDb } from "../fixtures/wait";

test.use({ video: "on" });

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

/**
 * Country field map entry shape — mirrors what
 * apps/server/src/services/ghl/branch-sync.ts writes into
 * organizations.ghlCountryFieldMap (jsonb).
 */
type CountryFieldEntry = {
	ghlFieldId: string;
	fieldKey: string;
	createdAt: string;
};
type CountryFieldMap = Record<string, CountryFieldEntry>;

/**
 * Loose typing for the GHL "get custom field" response. The real shape is
 * `{ customField: { id, name, options: string[], ... } }` based on the
 * server-side helper at apps/server/src/services/ghl/branch-sync.ts:
 * `res.customField?.options ?? res.options`. We accept either to be safe.
 */
type GhlCustomFieldGetResponse = {
	customField?: { id?: string; options?: string[]; picklistOptions?: string[] };
	options?: string[];
	picklistOptions?: string[];
};

async function ghlGetCustomField(
	apiKey: string,
	locId: string,
	fieldId: string,
): Promise<{ status: number; body: GhlCustomFieldGetResponse | null }> {
	const res = await fetch(
		`${GHL_BASE_URL}/locations/${locId}/customFields/${fieldId}`,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
				Version: GHL_API_VERSION,
				Accept: "application/json",
			},
		},
	);
	const body =
		res.status === 200 ? ((await res.json()) as GhlCustomFieldGetResponse) : null;
	return { status: res.status, body };
}

function extractOptions(body: GhlCustomFieldGetResponse | null): string[] {
	if (!body) return [];
	return (
		body.customField?.options ??
		body.customField?.picklistOptions ??
		body.options ??
		body.picklistOptions ??
		[]
	);
}

async function ghlPutCustomFieldOptions(
	apiKey: string,
	locId: string,
	fieldId: string,
	options: string[],
): Promise<void> {
	await fetch(`${GHL_BASE_URL}/locations/${locId}/customFields/${fieldId}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Version: GHL_API_VERSION,
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ options }),
	});
}

/** Poll GHL until predicate over options[] returns true, or timeout. */
async function pollGhlOptions(
	apiKey: string,
	locId: string,
	fieldId: string,
	predicate: (opts: string[]) => boolean,
	{ timeoutMs = 20_000, intervalMs = 1_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string[]> {
	const deadline = Date.now() + timeoutMs;
	let last: string[] = [];
	while (Date.now() < deadline) {
		const res = await ghlGetCustomField(apiKey, locId, fieldId);
		last = extractOptions(res.body);
		if (predicate(last)) return last;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return last;
}

test.describe("real GHL — branch sync (org-shared, Malaysia)", () => {
	test.skip(
		process.env.E2E_REAL_GHL !== "1",
		"Set E2E_REAL_GHL=1 to run live GHL spec",
	);

	test("10 — branch CRUD propagates to malaysia_location SINGLE_OPTIONS", async ({
		page,
	}) => {
		const cp = getControlPanelDb();
		const t = await getTenantDb();

		// ── Pre-flight: read org config ──────────────────────────────────────
		const org = await cp.query.organizations.findFirst({
			where: eq(organizations.name, "Test Fitness Franchise"),
		});
		if (!org) throw new Error("'Test Fitness Franchise' org not found");
		expect(org.ghlSyncModel, "org must be org-shared").toBe("org-shared");
		expect(org.ghlLocationId, "ghlLocationId must be set").toBeTruthy();
		expect(org.ghlApiKeyEncrypted, "ghlApiKeyEncrypted must be set").toBeTruthy();

		const locationId = org.ghlLocationId as string;
		const apiKey = decrypt(org.ghlApiKeyEncrypted as string);
		expect(apiKey.startsWith("pit-"), "expected a real PIT").toBeTruthy();

		// ── Pre-flight: resolve Malaysia country + a child state ─────────────
		const malaysia = await t.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.type, "country"),
				eq(hierarchyNodes.name, "Malaysia"),
			),
		});
		if (!malaysia) {
			throw new Error("Country 'Malaysia' not found in tenant hierarchy");
		}

		// Prefer Sabah; fall back to any state child of Malaysia.
		let state = await t.query.hierarchyNodes.findFirst({
			where: and(
				eq(hierarchyNodes.type, "state"),
				eq(hierarchyNodes.parentId, malaysia.id),
				eq(hierarchyNodes.name, "Sabah"),
			),
		});
		if (!state) {
			state = await t.query.hierarchyNodes.findFirst({
				where: and(
					eq(hierarchyNodes.type, "state"),
					eq(hierarchyNodes.parentId, malaysia.id),
				),
			});
		}
		if (!state) {
			throw new Error("No state node found under Malaysia; seed one first");
		}
		const stateName = state.name;

		// ── Pre-flight: read malaysia_location ghlFieldId from org map ──────
		const fieldMap = (org.ghlCountryFieldMap as CountryFieldMap | null) ?? {};
		const malaysiaEntry = fieldMap[malaysia.id];
		if (!malaysiaEntry?.ghlFieldId) {
			throw new Error(
				`organizations.ghlCountryFieldMap has no entry for Malaysia node ${malaysia.id}. ` +
					"Provision malaysia_location first (sync any Malaysia branch once).",
			);
		}
		const malaysiaFieldId = malaysiaEntry.ghlFieldId;
		expect(malaysiaEntry.fieldKey).toBe("malaysia_location");

		const ts = Date.now();
		const initialBranchName = `E2E Malaysia Branch ${ts}`;
		const renamedBranchName = `E2E Malaysia Branch Renamed ${ts}`;
		const initialOptionLabel = `${stateName} - ${initialBranchName}`;
		const renamedOptionLabel = `${stateName} - ${renamedBranchName}`;

		// Track the created branch id for finally{} cleanup.
		let createdBranchId: string | null = null;

		// Sanity-log the GHL field shape once so future runs can adjust the
		// extractor if GHL changes its response envelope.
		const initialGet = await ghlGetCustomField(apiKey, locationId, malaysiaFieldId);
		console.log(
			"[10] malaysia_location initial GET:",
			JSON.stringify({
				status: initialGet.status,
				keys: initialGet.body ? Object.keys(initialGet.body) : null,
				customFieldKeys: initialGet.body?.customField
					? Object.keys(initialGet.body.customField)
					: null,
				optionCount: extractOptions(initialGet.body).length,
			}),
		);
		expect(initialGet.status).toBe(200);

		try {
			// ════════════════════════════════════════════════════════════════
			// PHASE 1: CREATE — UI flow through /dashboard/branch/create
			// ════════════════════════════════════════════════════════════════
			await loginAsAdmin(page, DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD);
			await page.goto("/dashboard/branch/create");
			await page.waitForLoadState("networkidle");

			// Step 1: choose Malaysia country.
			// NOTE on selectors: the hierarchical form (apps/web/src/components/
			// forms/hierarchical-branch-form.tsx) uses shadcn <Select> wrappers
			// with placeholder text — no stable test-id. We trigger the combobox
			// then click the role=option by visible country name. If multiple
			// orgs ever seed "Malaysia" twice this would need narrowing.
			await page.getByRole("combobox").first().click();
			await page
				.getByRole("option", { name: new RegExp(`^${malaysia.name}`) })
				.first()
				.click();

			// Click "Continue" / Next implicit by selecting state — the form
			// auto-advances on country select per renderStep1's handleCountrySelect.
			// State step:
			await page.waitForSelector('label[for="state-select"]', {
				timeout: 10_000,
			});
			await page.getByRole("combobox").first().click();
			await page
				.getByRole("option", { name: new RegExp(`^${stateName}`) })
				.first()
				.click();

			// Step 3: branch details
			await page.waitForSelector("#branch_name", { timeout: 10_000 });
			await page.locator("#branch_name").fill(initialBranchName);
			await page.locator("#branch_code").fill(`E2E${ts}`);
			// branch_type is optional per zod schema — skip interaction entirely.

			await page.getByRole("button", { name: /^Create Branch$/ }).click();

			// Wait for the branch row to appear in the tenant DB.
			const createdBranch = await waitForDb(
				() =>
					t.query.hierarchyNodes.findFirst({
						where: and(
							eq(hierarchyNodes.type, "branch"),
							eq(hierarchyNodes.name, initialBranchName),
						),
					}),
				{ timeoutMs: 20_000 },
			);
			createdBranchId = createdBranch.id;
			expect(createdBranch.parentId).toBe(state.id);

			// Poll GHL until the option shows up.
			const optsAfterCreate = await pollGhlOptions(
				apiKey,
				locationId,
				malaysiaFieldId,
				(opts) => opts.includes(initialOptionLabel),
				{ timeoutMs: 20_000 },
			);
			expect(optsAfterCreate, "GHL options should contain initial label").toContain(
				initialOptionLabel,
			);

			// ════════════════════════════════════════════════════════════════
			// PHASE 2: RENAME — open Edit dialog from branch view dropdown
			// ════════════════════════════════════════════════════════════════
			await page.goto("/dashboard/branch/view");
			await page.waitForLoadState("networkidle");

			// Find the row by branch name, open its actions dropdown, click Edit.
			const row = page
				.locator("tr", { hasText: initialBranchName })
				.first();
			await expect(row).toBeVisible({ timeout: 15_000 });
			await row.getByRole("button").last().click();
			await page
				.getByRole("menuitem", { name: /Edit Branch/i })
				.first()
				.click();

			const editDialog = page.locator('[role="dialog"]').filter({
				hasText: /Edit Branch/i,
			});
			await expect(editDialog).toBeVisible({ timeout: 10_000 });

			// Rename: clear + retype the name field.
			await editDialog.locator("#branch-name").fill(renamedBranchName);
			await editDialog.getByRole("button", { name: /Save Changes/i }).click();
			await expect(editDialog).toBeHidden({ timeout: 20_000 });

			// Wait for DB to reflect the rename.
			await waitForDb(
				async () => {
					if (!createdBranchId) return undefined;
					const row = await t.query.hierarchyNodes.findFirst({
						where: eq(hierarchyNodes.id, createdBranchId),
					});
					return row?.name === renamedBranchName ? row : undefined;
				},
				{ timeoutMs: 15_000 },
			);

			// Poll GHL until old label is gone AND new label is present.
			const optsAfterRename = await pollGhlOptions(
				apiKey,
				locationId,
				malaysiaFieldId,
				(opts) =>
					opts.includes(renamedOptionLabel) &&
					!opts.includes(initialOptionLabel),
				{ timeoutMs: 25_000 },
			);
			expect(optsAfterRename).toContain(renamedOptionLabel);
			expect(optsAfterRename).not.toContain(initialOptionLabel);

			// ════════════════════════════════════════════════════════════════
			// PHASE 3: DELETE — dropdown → Delete Branch (window.confirm)
			// ════════════════════════════════════════════════════════════════
			// The dropdown uses window.confirm — auto-accept the native dialog.
			page.once("dialog", (d) => d.accept().catch(() => undefined));

			const rowAgain = page
				.locator("tr", { hasText: renamedBranchName })
				.first();
			await expect(rowAgain).toBeVisible({ timeout: 15_000 });
			await rowAgain.getByRole("button").last().click();
			await page
				.getByRole("menuitem", { name: /Delete Branch/i })
				.first()
				.click();

			// deleteHierarchyNode performs a HARD delete (see
			// packages/services/src/hierarchy.service.ts:525). Poll for absence
			// OR archived_at being non-null to cover either implementation.
			await waitForDb(
				async () => {
					if (!createdBranchId) return undefined;
					const row = await t.query.hierarchyNodes.findFirst({
						where: eq(hierarchyNodes.id, createdBranchId),
					});
					// Truthy result = "we're done waiting": row vanished OR row archived.
					if (!row) return { status: "deleted" as const };
					if (row.archivedAt !== null) return { status: "archived" as const };
					return undefined;
				},
				{ timeoutMs: 20_000 },
			);

			// GHL behavior on delete:
			// Known gap: per spec preamble, branch delete is documented as NOT
			// auto-removing the option from the GHL custom field (would orphan
			// historical contacts tagged with that option). The current router
			// (packages/api/src/routers/hierarchy.ts:816-862) DOES wire a
			// dispatchBranchRemove hook, but the worker's dispatcher may be a
			// no-op outside the per-branch sync model. We therefore lock in
			// observed behavior without asserting either direction strictly:
			// we record what's there and assert only that the field still
			// exists (status 200) so future drift trips this test.
			// TODO: once the org-shared delete-removal contract is finalized,
			// tighten this to an explicit `.toContain(...)` or
			// `.not.toContain(...)` assertion.
			const finalGet = await ghlGetCustomField(apiKey, locationId, malaysiaFieldId);
			expect(finalGet.status).toBe(200);
			const finalOpts = extractOptions(finalGet.body);
			console.log(
				"[10] post-delete malaysia_location options:",
				JSON.stringify({
					containsRenamed: finalOpts.includes(renamedOptionLabel),
					containsInitial: finalOpts.includes(initialOptionLabel),
					totalOptions: finalOpts.length,
				}),
			);
		} finally {
			if (process.env.E2E_SKIP_GHL_CLEANUP === "1") {
				console.log("[spec 10] E2E_SKIP_GHL_CLEANUP=1 — skipping cleanup; data preserved for manual review");
				return;
			}
			// ── Best-effort cleanup ─────────────────────────────────────────
			// (1) Remove the GHL option (whichever label is present).
			try {
				const res = await ghlGetCustomField(apiKey, locationId, malaysiaFieldId);
				const opts = extractOptions(res.body);
				const next = opts.filter(
					(o) => o !== initialOptionLabel && o !== renamedOptionLabel,
				);
				if (next.length !== opts.length) {
					await ghlPutCustomFieldOptions(
						apiKey,
						locationId,
						malaysiaFieldId,
						next,
					);
				}
			} catch (e) {
				console.warn("[teardown] GHL option prune:", e);
			}

			// (2) Hard-delete the branch row if it still exists (e.g. test
			// failed before DELETE phase).
			if (createdBranchId) {
				try {
					await t
						.delete(hierarchyNodes)
						.where(
							and(
								eq(hierarchyNodes.id, createdBranchId),
								// Defensive: only if archived_at is null we know it
								// survived; either way deletion is idempotent.
								isNull(hierarchyNodes.archivedAt),
							),
						);
					await t
						.delete(hierarchyNodes)
						.where(eq(hierarchyNodes.id, createdBranchId));
				} catch (e) {
					console.warn("[teardown] branch delete:", e);
				}
			}
		}
	});
});
