import { test, expect } from "@playwright/test";
import { rpc, rpcRaw, getOrgId } from "../_safe-mutation";

/**
 * UAT §8 — Organizational structure deletion guard.
 * "Note any case where deletion is blocked (for example, a location that still
 * has active clients)." A node with active children must NOT be deletable.
 *
 * deleteNode now defaults to BLOCK (autoDeleteChildren/autoReassignMembers
 * false): a node with children or subtree members is rejected with a typed 409
 * CONFLICT inside a single transaction, leaving the whole subtree intact (no
 * raw 500, no partial cascade).
 */
test.describe("§8 org structure — deletion guard", () => {
	test("deleting a node with active children is rejected", async ({ page }) => {
		const organizationId = getOrgId();
		const res = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodes = Array.isArray(res) ? res : (res?.nodes ?? []);
		expect(nodes.length).toBeGreaterThan(0);

		// A node that is some other node's parent has active children.
		const parentIds = new Set(
			nodes.map((n: any) => n.parentId).filter(Boolean),
		);
		const parent = nodes.find(
			(n: any) => parentIds.has(n.id) && n.type !== "branch",
		);
		test.skip(!parent, "no parent node with children to test the guard");

		const r = await rpcRaw(page.request, "hierarchy/deleteNode", {
			organizationId,
			nodeId: parent.id,
		});
		// Deletion must be REJECTED (any non-2xx). The API maps the block to a typed
		// 409 CONFLICT (see hierarchy/delete.procedures.ts); we still assert >=400 so
		// the spec stays robust to the exact status code.
		expect(
			r.status() >= 400,
			`deleteNode on a parent with children -> ${r.status()} (expected rejection)`,
		).toBeTruthy();

		// The real invariant: the node still exists (it was NOT deleted).
		const after = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const afterNodes = Array.isArray(after) ? after : (after?.nodes ?? []);
		expect(
			afterNodes.some((n: any) => n.id === parent.id),
			"node with active children must still exist after a blocked delete",
		).toBeTruthy();
	});

	test("blocked delete is a typed 409 and leaves the whole subtree intact", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const res = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodes = Array.isArray(res) ? res : (res?.nodes ?? []);
		const parentIds = new Set(
			nodes.map((n: any) => n.parentId).filter(Boolean),
		);
		const parent = nodes.find(
			(n: any) => parentIds.has(n.id) && n.type !== "branch",
		);
		test.skip(!parent, "no parent node with children to test the guard");

		// Snapshot the direct children before the delete attempt.
		const childIdsBefore = nodes
			.filter((n: any) => n.parentId === parent.id)
			.map((n: any) => n.id);

		const r = await rpcRaw(page.request, "hierarchy/deleteNode", {
			organizationId,
			nodeId: parent.id,
		});
		// The fix maps the block to a typed 409 CONFLICT — explicitly NOT a raw 500
		// (the old behavior relied on an FK-restrict error surfacing as 500).
		expect(
			r.status() === 409,
			`blocked delete should be a typed 409 CONFLICT, got ${r.status()}`,
		).toBeTruthy();

		// No half-delete: every child that existed before must still exist (the
		// whole operation is one transaction — it either all commits or all aborts).
		const after = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const afterIds = new Set(
			(Array.isArray(after) ? after : (after?.nodes ?? [])).map(
				(n: any) => n.id,
			),
		);
		expect(afterIds.has(parent.id), "parent must survive").toBeTruthy();
		for (const childId of childIdsBefore) {
			expect(
				afterIds.has(childId),
				`child ${childId} must survive a blocked delete (no partial cascade)`,
			).toBeTruthy();
		}
	});
});
