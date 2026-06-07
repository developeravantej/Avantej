import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import {
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	expectRejected,
	expectForbidden,
} from "../_safe-mutation";

const DISPOSABLE_EMAIL =
	process.env.E2E_DISPOSABLE_MEMBER_EMAIL ?? "developer.avantej@gmail.com";
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("members — invariants", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("a userId can be a member only once (duplicate → CONFLICT)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const nodesRes = await rpc(page.request, "hierarchy/listNodes", {
			organizationId,
		});
		const nodes = Array.isArray(nodesRes) ? nodesRes : (nodesRes?.nodes ?? []);
		const root = nodes.find(
			(n: any) => n.depth === 0 || n.type === "organization",
		);

		// First add — skip if the spare account is already a member.
		const first = await rpcRaw(page.request, "members/create", {
			organizationId,
			email: DISPOSABLE_EMAIL,
			role: "staff",
			hierarchyScopeId: root.id,
		});
		test.skip(
			first.status() !== 200,
			`cannot add disposable member (${first.status()}) — likely already a member`,
		);
		const firstBody = (await first.json())?.json ?? {};
		const id = firstBody?.member?.id ?? firstBody?.id;
		cleanup.add(`member ${id}`, async () => {
			await rpcRaw(page.request, "members/remove", {
				organizationId,
				memberId: id,
			});
		});

		// Second add with the SAME email/userId → CONFLICT (app-layer uniqueness).
		await expectRejected(
			page.request,
			"members/create",
			{
				organizationId,
				email: DISPOSABLE_EMAIL,
				role: "staff",
				hierarchyScopeId: root.id,
			},
			[409, 400],
		);
	});

	test("the last admin cannot be removed (BAD_REQUEST)", async ({ page }) => {
		const organizationId = getOrgId();
		const m = await rpc(page.request, "members/list", { organizationId });
		const list = Array.isArray(m) ? m : (m?.items ?? m?.members ?? []);
		const admins = list.filter(
			(x: any) => x.role === "admin" && x.status === "active" && !x.deletedAt,
		);
		// Only safe to assert when there is exactly ONE admin — then remove() is
		// GUARANTEED to be rejected and never actually executes. With >1 admin the
		// request would succeed and destroy an admin, so we skip.
		test.skip(
			admins.length !== 1,
			`expected exactly 1 active admin, found ${admins.length} — skipping to avoid destroying one`,
		);
		await expectRejected(
			page.request,
			"members/remove",
			{ organizationId, memberId: admins[0].id },
			[400],
		);
	});

	test("a non-admin is forbidden from mutating an out-of-scope member", async ({
		playwright,
	}) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed`",
		);
		const organizationId = getOrgId();

		// Find a member outside the staff user's scope (the admin at org root is a
		// safe target — staff is scoped to a branch).
		const admin = await playwright.request.newContext({
			baseURL: BASE,
			storageState: "_e2e/.auth/admin.json",
		});
		const m = await rpc(admin, "members/list", { organizationId });
		const list = Array.isArray(m) ? m : (m?.items ?? m?.members ?? []);
		const target = list.find(
			(x: any) => x.role === "admin" && x.status === "active",
		);
		await admin.dispose();
		expect(target?.id).toBeTruthy();

		const staff: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
		// Staff (non-admin) updating a member it cannot reach → FORBIDDEN.
		await expectForbidden(staff, "members/updateRole", {
			organizationId,
			memberId: target.id,
			newRole: "staff",
		});
		await staff.dispose();
	});
});
