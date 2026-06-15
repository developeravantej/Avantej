import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	withRestored,
} from "../_safe-mutation";

// Covers hierarchy.reassignMember + branchInvites.create / revoke.
// reassignMember is exercised against a real member but the member's original
// scope is snapshotted and RESTORED in finally (withRestored), and the
// temporary node it is moved to is deleted only AFTER the scope is restored.
test.describe("branch — reassign member + branch invites", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("reassignMember moves a member to a new node and back", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		const nodes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodeList = Array.isArray(nodes) ? nodes : (nodes?.nodes ?? []);
		const root = nodeList.find(
			(n: any) => n.depth === 0 || n.type === "organization",
		);
		expect(root?.id).toBeTruthy();

		// A disposable destination node.
		const tmpName = testId("reassign-dest");
		const tmp = await rpc(page.request, "hierarchy/createNode", {
			organizationId,
			type: "country",
			name: tmpName,
			parentId: root.id,
		});
		const tmpId = tmp?.id;
		expect(tmpId, `createNode: ${JSON.stringify(tmp)}`).toBeTruthy();
		cleanup.add(`node ${tmpId}`, async () => {
			await rpcRaw(page.request, "hierarchy/deleteNode", {
				organizationId,
				nodeId: tmpId,
			});
		});

		// Pick a non-admin member to move (never the org's admin/owner).
		const members = await rpc(page.request, "members/list", { organizationId });
		const list = Array.isArray(members)
			? members
			: (members?.items ?? members?.members ?? []);
		const subject = list.find(
			(m: any) => m.role !== "admin" && m.status === "active" && !m.deletedAt,
		);
		test.skip(!subject, "no non-admin member to reassign");
		const memberId = subject.id;
		const originalScope = subject.hierarchyScopeId;

		await withRestored(
			// read original scope
			async () => originalScope as string,
			// restore: move the member back to its original node
			async (scope) => {
				await rpcRaw(page.request, "hierarchy/reassignMember", {
					organizationId,
					memberId,
					newHierarchyScopeId: scope,
				});
			},
			// body: reassign to the temp node and verify
			async () => {
				await rpc(page.request, "hierarchy/reassignMember", {
					organizationId,
					memberId,
					newHierarchyScopeId: tmpId,
				});
				const after = await rpc(page.request, "members/list", {
					organizationId,
				});
				const afterList = Array.isArray(after)
					? after
					: (after?.items ?? after?.members ?? []);
				const moved = afterList.find((m: any) => m.id === memberId);
				expect(moved?.hierarchyScopeId).toBe(tmpId);
			},
		);

		// And confirm the restore landed.
		const restored = await rpc(page.request, "members/list", {
			organizationId,
		});
		const restoredList = Array.isArray(restored)
			? restored
			: (restored?.items ?? restored?.members ?? []);
		expect(
			restoredList.find((m: any) => m.id === memberId)?.hierarchyScopeId,
		).toBe(originalScope);
	});

	test("branchInvites — create returns a token, list strips it, revoke removes it", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);

		// CREATE — the only response that carries the raw token.
		const created = await rpc(page.request, "branchInvites/create", {
			organizationId,
			branchId,
			maxUses: 5,
		});
		const inviteId = created?.id ?? created?.invite?.id;
		expect(inviteId, `create: ${JSON.stringify(created)}`).toBeTruthy();
		expect(
			created?.token ?? created?.invite?.token,
			"create should return the raw token",
		).toBeTruthy();
		cleanup.add(`invite ${inviteId}`, async () => {
			await rpcRaw(page.request, "branchInvites/revoke", {
				organizationId,
				id: inviteId,
			});
		});

		// LIST — invite present, token stripped.
		const listed = await rpc(page.request, "branchInvites/list", {
			organizationId,
			branchId,
		});
		const invites = Array.isArray(listed) ? listed : (listed?.items ?? []);
		const found = invites.find((i: any) => i.id === inviteId);
		expect(found, "invite should appear in list").toBeTruthy();
		expect(found.token ?? null, "list must not leak the token").toBeFalsy();

		// REVOKE — gone from the active list.
		await rpc(page.request, "branchInvites/revoke", {
			organizationId,
			id: inviteId,
		});
		const afterRevoke = await rpc(page.request, "branchInvites/list", {
			organizationId,
			branchId,
		});
		const afterInvites = Array.isArray(afterRevoke)
			? afterRevoke
			: (afterRevoke?.items ?? []);
		const stillActive = afterInvites.find(
			(i: any) => i.id === inviteId && i.status !== "revoked" && !i.revokedAt,
		);
		expect(stillActive, "revoked invite should not remain active").toBeFalsy();
	});
});
