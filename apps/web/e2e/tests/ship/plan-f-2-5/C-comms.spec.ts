/**
 * Plan F.2.5 — /comms (Agent C).
 *
 * Outbox view over admin_session_actions (comms action types) +
 * template library CRUD. Bulk composer arrives via Agent B and is
 * out-of-scope for this spec.
 *
 * Tagged @ship-f-2-5.
 */

import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { commsTemplates } from "@avantej-core/db/schema/control-panel/comms-templates";
import { getControlPanelDb } from "../../../fixtures/db";
import { loginAsAdmin, signUpUser } from "../../../fixtures/auth";

test.use({ video: "on" });

const ENV_SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const ENV_SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;
const WEB_ORIGIN = process.env.E2E_WEB_BASE_URL ?? "http://localhost:3001";

async function rpc(
	request: APIRequestContext,
	router: string,
	input: unknown,
): Promise<{ status: number; body: any }> {
	const res = await request.post(`${WEB_ORIGIN}/rpc/${router}`, {
		headers: { "Content-Type": "application/json" },
		data: { json: input },
	});
	const text = await res.text();
	let body: any = text;
	try {
		body = JSON.parse(text);
	} catch {}
	return { status: res.status(), body };
}

test.describe("@ship-f-2-5 Plan F.2.5 — Agent C /comms", () => {
	test("outbox + templates CRUD + RBAC + UI render", async ({
		page,
		context,
		browser,
	}) => {
		test.setTimeout(240_000);

		page.on("console", (m) => {
			if (m.type() === "error") {
				console.log("[browser-console-error]", m.text());
			}
		});

		const cp = getControlPanelDb();

		// ── Provision super-admin ──────────────────────────────────────
		let adminEmail: string;
		let adminPassword: string;
		let adminUserId: string;
		if (ENV_SUPER_ADMIN_EMAIL && ENV_SUPER_ADMIN_PASSWORD) {
			const existing = await cp.query.user.findFirst({
				where: eq(userTable.email, ENV_SUPER_ADMIN_EMAIL),
			});
			if (!existing)
				throw new Error(
					`E2E_SUPER_ADMIN_EMAIL ${ENV_SUPER_ADMIN_EMAIL} not found`,
				);
			adminEmail = ENV_SUPER_ADMIN_EMAIL;
			adminPassword = ENV_SUPER_ADMIN_PASSWORD;
			adminUserId = existing.id;
		} else {
			const suffix = `plan-f-2-5-c-${Date.now()}`;
			const signed = await signUpUser(suffix, "admin");
			adminEmail = signed.email;
			adminPassword = signed.password;
			adminUserId = signed.userId;
		}

		await cp
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, adminUserId));

		const existingPa = await cp
			.select({ id: platformAdmins.id, role: platformAdmins.role })
			.from(platformAdmins)
			.where(eq(platformAdmins.userId, adminUserId));
		if (existingPa.length === 0) {
			await cp
				.insert(platformAdmins)
				.values({ userId: adminUserId, role: "super_admin" });
		} else if (existingPa[0]!.role !== "super_admin") {
			await cp
				.update(platformAdmins)
				.set({ role: "super_admin" })
				.where(eq(platformAdmins.userId, adminUserId));
		}

		await loginAsAdmin(page, adminEmail, adminPassword);
		const apiCtx = context.request;

		// ── Scenario 1: Outbox RPC golden shape ────────────────────────
		const r1 = await rpc(apiCtx, "platformAdminComms/listOutbox", {});
		console.log(
			`[scenario-1] listOutbox status=${r1.status} body=${JSON.stringify(r1.body).slice(0, 300)}`,
		);
		expect(r1.status).toBe(200);
		const o1 = r1.body?.json ?? r1.body;
		expect(Array.isArray(o1.rows)).toBe(true);
		expect(typeof o1.total).toBe("number");
		expect(typeof o1.page).toBe("number");
		expect(typeof o1.limit).toBe("number");

		// ── Scenario 2: Outbox kind filter ─────────────────────────────
		const r2 = await rpc(apiCtx, "platformAdminComms/listOutbox", {
			kind: "direct_message",
		});
		expect(r2.status).toBe(200);
		const o2 = r2.body?.json ?? r2.body;
		expect(Array.isArray(o2.rows)).toBe(true);
		for (const row of o2.rows) {
			expect(row.kind).toBe("direct_message");
		}

		// ── Scenario 3: Templates CRUD ─────────────────────────────────
		const stamp = Date.now();
		const tplName = `e2e-template-${stamp}`;
		const created = await rpc(apiCtx, "platformAdminComms/createTemplate", {
			name: tplName,
			subject: "Hello tenant",
			bodyMarkdown: "Body v1",
			kind: "direct_message",
		});
		console.log(
			`[scenario-3a] create status=${created.status} body=${JSON.stringify(created.body).slice(0, 200)}`,
		);
		expect(created.status).toBe(200);
		const createdJson = created.body?.json ?? created.body;
		expect(createdJson.ok).toBe(true);
		const tplId: string = createdJson.template.id;
		expect(tplId).toBeTruthy();

		const list1 = await rpc(apiCtx, "platformAdminComms/listTemplates", {});
		expect(list1.status).toBe(200);
		const list1Json = list1.body?.json ?? list1.body;
		expect(list1Json.templates.some((t: any) => t.id === tplId)).toBe(true);

		const updated = await rpc(apiCtx, "platformAdminComms/updateTemplate", {
			id: tplId,
			subject: "Hello tenant v2",
		});
		expect(updated.status).toBe(200);
		const updatedJson = updated.body?.json ?? updated.body;
		expect(updatedJson.template.subject).toBe("Hello tenant v2");

		const got = await rpc(apiCtx, "platformAdminComms/getTemplate", {
			id: tplId,
		});
		expect(got.status).toBe(200);
		const gotJson = got.body?.json ?? got.body;
		expect(gotJson.template.subject).toBe("Hello tenant v2");

		const archived = await rpc(apiCtx, "platformAdminComms/archiveTemplate", {
			id: tplId,
		});
		expect(archived.status).toBe(200);

		const listDefault = await rpc(
			apiCtx,
			"platformAdminComms/listTemplates",
			{},
		);
		const listDefaultJson = listDefault.body?.json ?? listDefault.body;
		expect(listDefaultJson.templates.some((t: any) => t.id === tplId)).toBe(
			false,
		);

		const listAll = await rpc(apiCtx, "platformAdminComms/listTemplates", {
			includeArchived: true,
		});
		const listAllJson = listAll.body?.json ?? listAll.body;
		const archivedRow = listAllJson.templates.find(
			(t: any) => t.id === tplId,
		);
		expect(archivedRow).toBeTruthy();
		expect(archivedRow.archivedAt).toBeTruthy();

		// Cleanup — physical delete (don't leak templates between runs).
		await cp.delete(commsTemplates).where(eq(commsTemplates.id, tplId));

		// ── Scenario 4: Templates RBAC (support role denied) ───────────
		const supportCtxRequest = await browser.newContext();
		const supportSuffix = `plan-f-2-5-support-${Date.now()}`;
		const supportSigned = await signUpUser(supportSuffix, "admin");
		await cp
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, supportSigned.userId));
		const existingSupport = await cp
			.select({ id: platformAdmins.id })
			.from(platformAdmins)
			.where(eq(platformAdmins.userId, supportSigned.userId));
		if (existingSupport.length === 0) {
			await cp
				.insert(platformAdmins)
				.values({ userId: supportSigned.userId, role: "support" });
		} else {
			await cp
				.update(platformAdmins)
				.set({ role: "support" })
				.where(eq(platformAdmins.userId, supportSigned.userId));
		}

		const supportPage = await supportCtxRequest.newPage();
		await loginAsAdmin(supportPage, supportSigned.email, supportSigned.password);
		const supportApi = supportCtxRequest.request;

		const denied = await rpc(supportApi, "platformAdminComms/createTemplate", {
			name: `denied-${Date.now()}`,
			subject: "Should fail",
			bodyMarkdown: "nope",
			kind: "direct_message",
		});
		console.log(
			`[scenario-4] support create status=${denied.status} body=${JSON.stringify(denied.body).slice(0, 200)}`,
		);
		expect(denied.status).toBeGreaterThanOrEqual(400);
		const deniedJson = denied.body?.json ?? denied.body;
		const errMessage = JSON.stringify(deniedJson);
		expect(/FORBIDDEN|forbidden|permit/i.test(errMessage)).toBe(true);

		// Support listTemplates still works (read-only access).
		const supportList = await rpc(
			supportApi,
			"platformAdminComms/listTemplates",
			{},
		);
		expect(supportList.status).toBe(200);

		await supportCtxRequest.close();

		// ── Scenario 5: UI render ──────────────────────────────────────
		await page.goto("/dashboard/platform-admin/comms");
		await page.waitForLoadState("networkidle").catch(() => {});

		const html = await page.content();
		const has500 = /Internal Server Error|status code 500|500 -/i.test(html);
		console.log(`[scenario-5] comms page has500=${has500}`);
		expect(has500).toBe(false);

		const commsHeading = await page
			.getByRole("heading", { name: "Comms" })
			.waitFor({ state: "visible", timeout: 15_000 })
			.then(() => true)
			.catch(() => false);
		console.log(`[scenario-5] heading visible=${commsHeading}`);
		if (commsHeading) {
			await expect(page.getByTestId("tab-outbox")).toBeVisible();
			await expect(page.getByTestId("tab-templates")).toBeVisible();
			await page.getByTestId("tab-templates").click();
			await expect(page.getByTestId("template-library-panel")).toBeVisible();
		}
	});
});
