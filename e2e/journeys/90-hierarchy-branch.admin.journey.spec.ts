/**
 * Journey: Hierarchy & Branch management.
 * Suite: Hierarchy & Branch · Actor: tenant-admin
 * Routers in scope: hierarchy
 * Pages in scope: /dashboard/branch/create, /dashboard/branch/$id
 *
 * The `hierarchy` router models a 3-level tree below the organization root:
 *   country (depth 1) → state (depth 2) → branch (depth 3)
 * The Branch UI labels these "Country / Region / Area / Branch", but the
 * persisted node `type` enum is strictly ["country", "state", "branch"]
 * (see packages/api/src/routers/hierarchy.ts + hierarchy-validation.service.ts).
 * So the task's "region → area → branch" chain is realised here as the
 * country → state → branch chain.
 *
 * `validateHierarchyRules` enforces:
 *   - every non-organization node MUST have a parent
 *   - parent type must match (country↹organization, state↹country, branch↹state)
 *   - branch names are GLOBALLY unique → every spec run uses a unique suffix.
 *
 * `getNode` / `getDescendants` gate on `accessibleNodeIds` (admin's scope
 * subtree). Rooting the created chain under an already-accessible node keeps
 * every new node inside that subtree, so the access checks pass.
 *
 * Each journey SEEDS + ASSERTS via oRPC (deterministic + robust), then opens
 * the relevant /dashboard page so the recorded video shows the result.
 */
import { test, expect } from "@playwright/test";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";
import {
	TEST_ORG_ID,
	pickFirstBranchId,
	pickFirstActiveTrainer,
	pickFirstActiveClient,
} from "../helpers/seed-data";

// ─── Local types (mirror hierarchy router return shapes) ──────────────────────

interface HierarchyNode {
	id: string;
	name: string;
	type: "organization" | "country" | "state" | "branch";
	depth: number;
	parentId: string | null;
}

interface ListNodesResult {
	nodes: HierarchyNode[];
}

interface ReassignResult {
	member: { id: string; hierarchyScopeId: string };
}

interface BulkReassignResult {
	members: Array<{ id: string; hierarchyScopeId: string }>;
}

interface ListMembersResult {
	members: Array<{ id: string; hierarchyScopeId: string }>;
}

// Unique suffix per run — branch names are globally unique in the tenant.
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listNodes(
	page: import("@playwright/test").Page,
): Promise<HierarchyNode[]> {
	const res = await orpcCall<object, ListNodesResult>(
		page,
		"hierarchy",
		"listNodes",
		{
			organizationId: TEST_ORG_ID,
		},
	);
	return res?.nodes ?? [];
}

/** Idempotently delete a node (cascade deletes children + reassigns members). */
async function deleteNode(
	page: import("@playwright/test").Page,
	nodeId: string,
): Promise<void> {
	try {
		await orpcCall(page, "hierarchy", "deleteNode", {
			organizationId: TEST_ORG_ID,
			nodeId,
		});
	} catch (err) {
		if (err instanceof OrpcClientError && err.code === "NOT_FOUND") return;
		// Swallow other cleanup failures — best-effort teardown.
	}
}

test.describe("Hierarchy & Branch", () => {
	test("Admin builds a country → state → branch chain and sees it listed", {
		tag: ["@p1"],
	}, async ({ page }) => {
		// Created node ids, deepest-first, for cleanup. Deleting the top node
		// cascades, but we collect all so cleanup is robust if a step fails midway.
		const created: string[] = [];
		let countryId = "";
		let stateId = "";
		let branchId = "";
		let parentOrgId: string | null = null;

		await test.step("Resolve the organization root to parent the new country", async () => {
			const nodes = await listNodes(page);
			// A country's parent must be the organization root (depth 0, type organization).
			const orgRoot = nodes.find(
				(n) => n.type === "organization" || n.depth === 0,
			);
			parentOrgId = orgRoot?.id ?? null;
			expect(
				parentOrgId,
				"an organization root node must exist to parent a country",
			).toBeTruthy();
		});

		await test.step("Create the country node (depth 1)", async () => {
			const node = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"createNode",
				{
					organizationId: TEST_ORG_ID,
					type: "country",
					name: `E2E Country ${RUN}`,
					code: `E2EC${RUN}`.slice(0, 12),
					parentId: parentOrgId!,
				},
			);
			countryId = node.id;
			created.unshift(countryId);
			expect(node.type).toBe("country");
			expect(node.depth).toBe(1);
		});

		await test.step("Create the state node under the country (depth 2)", async () => {
			const node = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"createNode",
				{
					organizationId: TEST_ORG_ID,
					type: "state",
					name: `E2E State ${RUN}`,
					parentId: countryId,
				},
			);
			stateId = node.id;
			created.unshift(stateId);
			expect(node.type).toBe("state");
			expect(node.depth).toBe(2);
			expect(node.parentId).toBe(countryId);
		});

		await test.step("Create the branch node under the state (depth 3)", async () => {
			const node = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"createNode",
				{
					organizationId: TEST_ORG_ID,
					type: "branch",
					name: `E2E Branch ${RUN}`,
					parentId: stateId,
				},
			);
			branchId = node.id;
			created.unshift(branchId);
			expect(node.type).toBe("branch");
			expect(node.depth).toBe(3);
			expect(node.parentId).toBe(stateId);
		});

		await test.step("listNodes shows the full chain", async () => {
			const nodes = await listNodes(page);
			const ids = new Set(nodes.map((n) => n.id));
			expect(ids.has(countryId), "country must be listed").toBe(true);
			expect(ids.has(stateId), "state must be listed").toBe(true);
			expect(ids.has(branchId), "branch must be listed").toBe(true);
		});

		await test.step("Open the Create Branch page (UI heading renders)", async () => {
			await page.goto("/dashboard/branch/create");
			await expect(
				page.getByRole("heading", { name: /create branch/i }).first(),
			).toBeVisible();
			await expect(page.locator("body")).not.toContainText(
				/something went wrong/i,
			);
		});

		await test.step("Open the new branch detail page", async () => {
			await page.goto(`/dashboard/branch/${branchId}`);
			await expect(page).toHaveURL(new RegExp(`/dashboard/branch/${branchId}`));
			// The $id page resolves the branch name via react-query on the
			// active org; give it a beat, then assert tolerantly (no hard error).
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(
				/something went wrong/i,
			);
		});

		await test.step("Cleanup — delete the created chain (cascade)", async () => {
			// created is deepest-first; deleting the country alone cascades, but
			// iterate all to be safe and swallow NOT_FOUND.
			for (const id of created) {
				await deleteNode(page, id);
			}
			const nodes = await listNodes(page);
			const ids = new Set(nodes.map((n) => n.id));
			expect(ids.has(countryId), "country should be gone after delete").toBe(
				false,
			);
		});
	});

	test("Admin reassigns a single member to a new branch scope", {
		tag: ["@p1"],
	}, async ({ page }) => {
		let memberId = "";
		let originalScopeId = "";
		let targetBranchId = "";

		await test.step("Resolve a target branch scope (accessible to admin)", async () => {
			targetBranchId = await pickFirstBranchId(page);
			expect(
				targetBranchId,
				"a branch/location node must be resolvable",
			).toBeTruthy();
		});

		await test.step("Pick a member to move (trusted picker → tenant members.id)", async () => {
			// pickFirstActiveTrainer/Client return { memberId, hierarchyScopeId }
			// where memberId is the tenant `members.id` reassignMember expects.
			const candidate =
				(await pickFirstActiveTrainer(page)) ??
				(await pickFirstActiveClient(page));
			expect(
				candidate,
				"at least one active member must exist to reassign",
			).toBeTruthy();
			memberId = candidate!.memberId;
			// Capture the original scope so we can restore it in cleanup. If the
			// member is already on the target scope, restore is a no-op.
			originalScopeId = candidate!.hierarchyScopeId ?? targetBranchId;
		});

		await test.step("Reassign the member to the target branch scope", async () => {
			const res = await orpcCall<object, ReassignResult>(
				page,
				"hierarchy",
				"reassignMember",
				{
					organizationId: TEST_ORG_ID,
					memberId,
					newHierarchyScopeId: targetBranchId,
				},
			);
			expect(res.member.id).toBe(memberId);
			expect(res.member.hierarchyScopeId).toBe(targetBranchId);
		});

		await test.step("Assert the new scope via getNode + listMembers", async () => {
			// getNode confirms the target node is real and accessible.
			const node = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"getNode",
				{
					organizationId: TEST_ORG_ID,
					nodeId: targetBranchId,
				},
			);
			expect(node.id).toBe(targetBranchId);

			// listMembers for the target scope now includes the moved member.
			const list = await orpcCall<object, ListMembersResult>(
				page,
				"hierarchy",
				"listMembers",
				{
					organizationId: TEST_ORG_ID,
					hierarchyScopeId: targetBranchId,
				},
			);
			expect(
				list.members.some((m) => m.id === memberId),
				"moved member is in the new scope",
			).toBe(true);
		});

		await test.step("Open the branch detail page to visualise the scope", async () => {
			await page.goto(`/dashboard/branch/${targetBranchId}`);
			await expect(page).toHaveURL(
				new RegExp(`/dashboard/branch/${targetBranchId}`),
			);
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(
				/something went wrong/i,
			);
		});

		await test.step("Cleanup — restore the member to its original scope", async () => {
			if (memberId && originalScopeId && originalScopeId !== targetBranchId) {
				try {
					await orpcCall(page, "hierarchy", "reassignMember", {
						organizationId: TEST_ORG_ID,
						memberId,
						newHierarchyScopeId: originalScopeId,
					});
				} catch {
					// best-effort restore — swallow
				}
			}
		});
	});

	test("Admin bulk-reassigns members to a new branch scope", {
		tag: ["@p1"],
	}, async ({ page }) => {
		let targetBranchId = "";
		const moved: Array<{ id: string; originalScopeId: string }> = [];

		await test.step("Resolve a target branch scope", async () => {
			targetBranchId = await pickFirstBranchId(page);
			expect(
				targetBranchId,
				"a branch/location node must be resolvable",
			).toBeTruthy();
		});

		await test.step("Pick up to 2 members to bulk-move (trusted pickers)", async () => {
			// Reuse the trusted pickers — both return tenant `members.id` + scope.
			// A trainer + a client are distinct members, giving a 2-row bulk move.
			const trainer = await pickFirstActiveTrainer(page);
			const client = await pickFirstActiveClient(page);
			const candidates: Array<{ id: string; originalScopeId: string }> = [];
			const seen = new Set<string>();
			for (const c of [trainer, client]) {
				if (c && c.hierarchyScopeId && !seen.has(c.memberId)) {
					seen.add(c.memberId);
					candidates.push({
						id: c.memberId,
						originalScopeId: c.hierarchyScopeId,
					});
				}
			}
			expect(
				candidates.length,
				"at least one active member must exist for bulk reassign",
			).toBeGreaterThan(0);
			moved.push(...candidates);
		});

		await test.step("Bulk-reassign the members to the target scope", async () => {
			const res = await orpcCall<object, BulkReassignResult>(
				page,
				"hierarchy",
				"bulkReassignMembers",
				{
					organizationId: TEST_ORG_ID,
					memberIds: moved.map((m) => m.id),
					newHierarchyScopeId: targetBranchId,
				},
			);
			expect(res.members.length).toBe(moved.length);
			for (const m of res.members) {
				expect(m.hierarchyScopeId).toBe(targetBranchId);
			}
		});

		await test.step("Assert via listMembers — all moved members are in the new scope", async () => {
			const list = await orpcCall<object, ListMembersResult>(
				page,
				"hierarchy",
				"listMembers",
				{
					organizationId: TEST_ORG_ID,
					hierarchyScopeId: targetBranchId,
				},
			);
			const scopeIds = new Set(list.members.map((m) => m.id));
			for (const m of moved) {
				expect(
					scopeIds.has(m.id),
					`member ${m.id} should be in the new scope`,
				).toBe(true);
			}
		});

		await test.step("Open the branch detail page", async () => {
			await page.goto(`/dashboard/branch/${targetBranchId}`);
			await expect(page).toHaveURL(
				new RegExp(`/dashboard/branch/${targetBranchId}`),
			);
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(
				/something went wrong/i,
			);
		});

		await test.step("Cleanup — restore each member to its original scope", async () => {
			for (const m of moved) {
				if (m.originalScopeId && m.originalScopeId !== targetBranchId) {
					try {
						await orpcCall(page, "hierarchy", "reassignMember", {
							organizationId: TEST_ORG_ID,
							memberId: m.id,
							newHierarchyScopeId: m.originalScopeId,
						});
					} catch {
						// best-effort restore — swallow
					}
				}
			}
		});
	});

	test("getDescendants returns the full subtree of a freshly-built chain", {
		tag: ["@p2"],
	}, async ({ page }) => {
		const created: string[] = [];
		let parentOrgId: string | null = null;
		let countryId = "";
		let stateId = "";
		let branchId = "";

		await test.step("Resolve the organization root", async () => {
			const nodes = await listNodes(page);
			const orgRoot = nodes.find(
				(n) => n.type === "organization" || n.depth === 0,
			);
			parentOrgId = orgRoot?.id ?? null;
			expect(parentOrgId, "an organization root node must exist").toBeTruthy();
		});

		await test.step("Build a country → state → branch chain", async () => {
			const country = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"createNode",
				{
					organizationId: TEST_ORG_ID,
					type: "country",
					name: `E2E Desc Country ${RUN}`,
					parentId: parentOrgId!,
				},
			);
			countryId = country.id;
			created.unshift(countryId);

			const state = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"createNode",
				{
					organizationId: TEST_ORG_ID,
					type: "state",
					name: `E2E Desc State ${RUN}`,
					parentId: countryId,
				},
			);
			stateId = state.id;
			created.unshift(stateId);

			const branch = await orpcCall<object, HierarchyNode>(
				page,
				"hierarchy",
				"createNode",
				{
					organizationId: TEST_ORG_ID,
					type: "branch",
					name: `E2E Desc Branch ${RUN}`,
					parentId: stateId,
				},
			);
			branchId = branch.id;
			created.unshift(branchId);
		});

		await test.step("getDescendants(country) returns state + branch (not the country itself)", async () => {
			type DescResult = { descendants: HierarchyNode[] };
			const res = await orpcCall<object, DescResult>(
				page,
				"hierarchy",
				"getDescendants",
				{
					organizationId: TEST_ORG_ID,
					nodeId: countryId,
				},
			);
			const ids = new Set(res.descendants.map((n) => n.id));
			expect(ids.has(stateId), "state must be a descendant of country").toBe(
				true,
			);
			expect(ids.has(branchId), "branch must be a descendant of country").toBe(
				true,
			);
			expect(
				ids.has(countryId),
				"the node itself is excluded from descendants",
			).toBe(false);
		});

		await test.step("getDescendants(state) returns just the branch", async () => {
			type DescResult = { descendants: HierarchyNode[] };
			const res = await orpcCall<object, DescResult>(
				page,
				"hierarchy",
				"getDescendants",
				{
					organizationId: TEST_ORG_ID,
					nodeId: stateId,
				},
			);
			const ids = res.descendants.map((n) => n.id);
			expect(ids).toContain(branchId);
			expect(ids).not.toContain(stateId);
		});

		await test.step("Open the branch detail page for the leaf node", async () => {
			await page.goto(`/dashboard/branch/${branchId}`);
			await expect(page).toHaveURL(new RegExp(`/dashboard/branch/${branchId}`));
			await page.waitForTimeout(1200);
			await expect(page.locator("body")).not.toContainText(
				/something went wrong/i,
			);
		});

		await test.step("Cleanup — delete the chain (cascade)", async () => {
			for (const id of created) {
				await deleteNode(page, id);
			}
		});
	});
});
