import { test, expect } from "@playwright/test";
import { rpc, rpcRaw, getOrgId } from "../_safe-mutation";

/**
 * UAT §8 — Organizational structure deletion guard.
 * "Note any case where deletion is blocked (for example, a location that still
 * has active clients)." A node with active children must NOT be deletable.
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
		// Deletion must be REJECTED (any non-2xx). NOTE: the API returns 500 here
		// rather than a typed 4xx — the guard fires but throws a raw Error; a minor
		// error-mapping finding (should be CONFLICT/BAD_REQUEST).
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
});
