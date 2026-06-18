import { test, expect, type APIRequestContext } from "@playwright/test";
import { Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

// Member lifecycle — API-driven + API-verified, self-cleaning.
// Covers create, suspend, reactivate, updateRole, updateScope, deactivate,
// softDelete, restore, remove — all exercised on ONE disposable member built
// from a spare registered account (developer.avantej), removed at the end so
// the run nets to zero. Skips cleanly if that account can't be added as a
// fresh member (e.g. it's already a member of this org).
const DISPOSABLE_EMAIL =
	process.env.E2E_DISPOSABLE_MEMBER_EMAIL ?? "developer.avantej@gmail.com";

async function findMember(
	request: APIRequestContext,
	organizationId: string,
	id: string,
) {
	const m = await rpc(request, "members/list", { organizationId });
	const list = Array.isArray(m) ? m : (m?.items ?? m?.members ?? []);
	return list.find((x: any) => x.id === id);
}

test.describe("members — member lifecycle", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("create → suspend/reactivate → role → scope → deactivate → softDelete/restore → remove", async ({
		page,
	}) => {
		const organizationId = getOrgId();

		// Discover the org-root scope + an alternate node for the scope move.
		const nodesRes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodes = Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? []);
		const root = nodes.find(
			(n: any) => n.depth === 0 || n.type === "organization",
		);
		const alt = nodes.find((n: any) => n.id !== root?.id);
		expect(
			root?.id && alt?.id,
			"need at least two hierarchy nodes",
		).toBeTruthy();

		// CREATE — from a spare account. Skip if it's already a member.
		const createRes = await rpcRaw(page.request, "members/create", {
			organizationId,
			email: DISPOSABLE_EMAIL,
			role: "staff",
			hierarchyScopeId: root.id,
		});
		const createBody = (await createRes.json())?.json ?? {};
		test.skip(
			createRes.status() !== 200,
			`cannot create disposable member (${createRes.status()}) — likely already a member`,
		);
		const id = createBody?.member?.id ?? createBody?.id;
		expect(id, `create: ${JSON.stringify(createBody)}`).toBeTruthy();
		cleanup.add(`member ${id}`, async () => {
			await rpcRaw(page.request, "members/remove", {
				organizationId,
				memberId: id,
			});
		});
		expect(await findMember(page.request, organizationId, id)).toBeTruthy();

		// SUSPEND → REACTIVATE
		await rpc(page.request, "members/suspend", {
			organizationId,
			memberId: id,
		});
		expect((await findMember(page.request, organizationId, id))?.status).toBe(
			"suspended",
		);
		await rpc(page.request, "members/reactivate", {
			organizationId,
			memberId: id,
		});
		expect((await findMember(page.request, organizationId, id))?.status).toBe(
			"active",
		);

		// UPDATE ROLE
		await rpc(page.request, "members/updateRole", {
			organizationId,
			memberId: id,
			newRole: "trainer",
		});
		expect((await findMember(page.request, organizationId, id))?.role).toBe(
			"trainer",
		);

		// UPDATE SCOPE
		await rpc(page.request, "members/updateScope", {
			organizationId,
			memberId: id,
			newHierarchyScopeId: alt.id,
		});
		expect(
			(await findMember(page.request, organizationId, id))?.hierarchyScopeId,
		).toBe(alt.id);

		// DEACTIVATE → status inactive
		await rpc(page.request, "members/deactivate", {
			organizationId,
			memberId: id,
		});
		expect((await findMember(page.request, organizationId, id))?.status).toBe(
			"inactive",
		);

		// SOFT DELETE → drops out of the default list; RESTORE → reappears
		await rpc(page.request, "members/softDelete", {
			organizationId,
			memberId: id,
		});
		expect(await findMember(page.request, organizationId, id)).toBeFalsy();
		await rpc(page.request, "members/restore", {
			organizationId,
			memberId: id,
		});
		expect(await findMember(page.request, organizationId, id)).toBeTruthy();

		// REMOVE → gone
		await rpc(page.request, "members/remove", { organizationId, memberId: id });
		expect(await findMember(page.request, organizationId, id)).toBeFalsy();
	});
});
