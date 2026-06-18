import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Hierarchy node lifecycle — API-driven + API-verified, self-cleaning.
// Covers hierarchy.createNode / updateNode / moveNode / deleteNode.
// Structure: org-root (organization) > country > state. We create two
// countries + a state, rename the state, move it between countries, then
// cascade-delete everything. deleteNode is the cleanup, so teardown is
// idempotent (rpcRaw — never throws on an already-deleted node).
test.describe("branch — hierarchy node lifecycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("createNode → updateNode → moveNode → deleteNode (API-verified)", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Locate the org-root node (depth 0 / type organization) to parent under.
		const nodes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodeList = Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
		const root = nodeList.find(
			(n: any) => n.depth === 0 || n.type === "organization",
		);
		expect(
			root?.id,
			`no org-root node in ${JSON.stringify(nodes)?.slice(0, 200)}`,
		).toBeTruthy();

		// CREATE two country nodes under the root.
		const c1Name = testId("country-a");
		const c2Name = testId("country-b");
		const c1 = await rpc(page.request, "hierarchy/createNode", {
			organizationId,
			type: "country",
			name: c1Name,
			parentId: root.id,
		});
		const c1Id = c1?.id;
		expect(c1Id, `createNode c1: ${JSON.stringify(c1)}`).toBeTruthy();
		cleanup.add(`node ${c1Id}`, async () => {
			await rpcRaw(page.request, "hierarchy/deleteNode", {
				organizationId,
				nodeId: c1Id,
			});
		});

		const c2 = await rpc(page.request, "hierarchy/createNode", {
			organizationId,
			type: "country",
			name: c2Name,
			parentId: root.id,
		});
		const c2Id = c2?.id;
		expect(c2Id, `createNode c2: ${JSON.stringify(c2)}`).toBeTruthy();
		cleanup.add(`node ${c2Id}`, async () => {
			await rpcRaw(page.request, "hierarchy/deleteNode", {
				organizationId,
				nodeId: c2Id,
			});
		});

		// CREATE a state under c1.
		const sName = testId("state");
		const s = await rpc(page.request, "hierarchy/createNode", {
			organizationId,
			type: "state",
			name: sName,
			parentId: c1Id,
		});
		const sId = s?.id;
		expect(sId, `createNode state: ${JSON.stringify(s)}`).toBeTruthy();
		cleanup.add(`node ${sId}`, async () => {
			await rpcRaw(page.request, "hierarchy/deleteNode", {
				organizationId,
				nodeId: sId,
			});
		});

		// ASSERT PRESENT in the tree.
		const afterCreate = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		expect(JSON.stringify(afterCreate)).toContain(sName);

		// UPDATE (rename) the state.
		const sRenamed = `${sName}-renamed`;
		const upd = await rpc(page.request, "hierarchy/updateNode", {
			organizationId,
			nodeId: sId,
			name: sRenamed,
		});
		expect(upd?.name).toBe(sRenamed);

		// MOVE the state from c1 to c2.
		const moved = await rpc(page.request, "hierarchy/moveNode", {
			organizationId,
			nodeId: sId,
			newParentId: c2Id,
		});
		expect(moved?.parentId).toBe(c2Id);

		// DELETE the state, then both countries; assert gone from the tree.
		await rpc(page.request, "hierarchy/deleteNode", {
			organizationId,
			nodeId: sId,
		});
		await rpc(page.request, "hierarchy/deleteNode", {
			organizationId,
			nodeId: c1Id,
		});
		await rpc(page.request, "hierarchy/deleteNode", {
			organizationId,
			nodeId: c2Id,
		});
		const afterDelete = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const blob = JSON.stringify(afterDelete);
		expect(blob).not.toContain(sRenamed);
		expect(blob).not.toContain(c1Name);
		expect(blob).not.toContain(c2Name);
	});
});
