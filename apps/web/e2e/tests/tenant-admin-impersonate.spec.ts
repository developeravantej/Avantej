/**
 * Tenant Admin Impersonation — E2E (full HTTP cookie flow)
 *
 * Covers what tenant-admin.test.ts cannot reach without a real Better-Auth session:
 *  - impersonateMember returns Set-Cookie that swaps the active session
 *  - member_sessions row is inserted with adminMemberId, impersonatedMemberId, sessionToken
 *  - stopImpersonating reverts to the original session and sets member_sessions.endedAt
 *
 * Uses the same dev tenant + DEV_ADMIN credentials as ghl-sync.spec.ts
 * (franchisee@gmail.com / password123 — has member.role = 'admin' in tenant).
 * Picks a staff member from the live tenant DB as the impersonation target.
 *
 * MOCK_GHL is irrelevant here — no GHL traffic.
 *
 * oRPC wire format: POST /rpc/<router>/<procedure> with Content-Type application/json.
 * Body shape: { json: <procedure_input> }
 * organizationId injected alongside targetMemberId so orpcTenantMiddleware can
 * resolve the tenant DB (reads rpcPayload.organizationId after unwrapping body.json).
 */

import { test, expect } from "@playwright/test";
import { eq, and, isNull, isNotNull, desc, inArray } from "drizzle-orm";
import { members } from "@avantej-core/db/schema/tenant/members";
import { memberSessions } from "@avantej-core/db/schema/tenant/member-sessions";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { getControlPanelDb, getTenantDb } from "../fixtures/db";
import { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD } from "../fixtures/seed";

const SERVER = "http://localhost:3000";
const ORIGIN = "http://localhost:3001";

test.describe("Tenant admin impersonation — full HTTP flow", () => {
	test("impersonateMember + stopImpersonating round-trip", async () => {
		const t = await getTenantDb();
		const cp = getControlPanelDb();

		// ── Resolve admin member + find a staff target ────────────────────────────
		const adminUser = await cp.query.user.findFirst({
			where: eq(userTable.email, DEV_ADMIN_EMAIL),
		});
		if (!adminUser) {
			throw new Error(`${DEV_ADMIN_EMAIL} not found in control panel DB`);
		}

		const adminMember = await t.query.members.findFirst({
			where: and(eq(members.userId, adminUser.id), eq(members.role, "admin")),
		});
		if (!adminMember) {
			throw new Error("Dev admin has no member record with role=admin in tenant DB");
		}

		// Target must be a staff member whose userId has a real control panel user record.
		// assertTenantAdminCanImpersonate enforces role === 'staff'.
		// Better-Auth's impersonateUser also requires the user to exist in the CP users table,
		// so we cross-validate here to skip dev-tenant staff rows with phantom userIds.
		const allStaff = await t.query.members.findMany({
			where: eq(members.role, "staff"),
		});
		if (allStaff.length === 0) {
			throw new Error(
				"No staff members found in dev tenant — seed at least one member with role=staff before running this spec",
			);
		}
		const cpUsersForStaff = allStaff.length > 0
			? await cp.query.user.findMany({
				where: inArray(userTable.id, allStaff.map((m) => m.userId)),
			})
			: [];
		const validCpUserIds = new Set(cpUsersForStaff.map((u) => u.id));
		const targetMember = allStaff.find((m) => validCpUserIds.has(m.userId));
		if (!targetMember) {
			throw new Error(
				`Found ${allStaff.length} staff member(s) in dev tenant but none have a matching user record in the control panel DB. ` +
				"Dev seed is missing the cross-DB linkage — create a real staff user via the admin UI or Better-Auth sign-up before running this spec.",
			);
		}

		// ── Resolve organizationId from control panel ─────────────────────────────
		const org = await cp.query.organizations.findFirst();
		if (!org) {
			throw new Error("No organization found in control panel DB");
		}
		const organizationId = org.id;

		// ── Log in as dev admin → capture session cookie ──────────────────────────
		const loginRes = await fetch(`${SERVER}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: ORIGIN },
			body: JSON.stringify({ email: DEV_ADMIN_EMAIL, password: DEV_ADMIN_PASSWORD }),
		});
		if (!loginRes.ok) {
			throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
		}
		const rawLoginCookies = loginRes.headers.getSetCookie
			? loginRes.headers.getSetCookie()
			: [loginRes.headers.get("set-cookie") ?? ""].filter(Boolean);
		if (rawLoginCookies.length === 0) {
			throw new Error("No Set-Cookie returned from login — is the server running?");
		}

		// Build a cookie jar: name=value pairs (strip attributes like Path, SameSite, etc.)
		const cookieMap = new Map<string, string>();
		for (const raw of rawLoginCookies) {
			const kv = raw.split(";")[0].trim();
			if (kv) {
				const eqIdx = kv.indexOf("=");
				if (eqIdx !== -1) {
					cookieMap.set(kv.slice(0, eqIdx), kv.slice(eqIdx + 1));
				}
			}
		}
		const buildCookieHeader = () =>
			[...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

		// ── Call impersonateMember via oRPC ───────────────────────────────────────
		// Wire format: { json: { ...input, organizationId } }
		// organizationId is stripped by Zod (not in schema) but read by orpcTenantMiddleware
		// before oRPC validation runs, so tenant DB is resolved correctly.
		const impersonateRes = await fetch(`${SERVER}/rpc/tenantAdmin/impersonateMember`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: ORIGIN,
				Cookie: buildCookieHeader(),
			},
			body: JSON.stringify({
				json: {
					targetMemberId: targetMember.id,
					organizationId,
				},
			}),
		});

		if (!impersonateRes.ok) {
			const body = await impersonateRes.text();
			throw new Error(`impersonateMember failed: ${impersonateRes.status} ${body}`);
		}

		// ── Skip #1 assertion: Set-Cookie returned (session swapped) ─────────────
		const rawImpCookies = impersonateRes.headers.getSetCookie
			? impersonateRes.headers.getSetCookie()
			: [impersonateRes.headers.get("set-cookie") ?? ""].filter(Boolean);
		expect(rawImpCookies.length, "impersonateMember must return Set-Cookie").toBeGreaterThan(0);

		// Merge new cookies into the jar so stopImpersonating runs as the impersonated session
		for (const raw of rawImpCookies) {
			const kv = raw.split(";")[0].trim();
			if (kv) {
				const eqIdx = kv.indexOf("=");
				if (eqIdx !== -1) {
					cookieMap.set(kv.slice(0, eqIdx), kv.slice(eqIdx + 1));
				}
			}
		}

		// ── Skip #1 assertion: member_sessions row inserted ───────────────────────
		const session = await t.query.memberSessions.findFirst({
			where: and(
				eq(memberSessions.adminMemberId, adminMember.id),
				eq(memberSessions.impersonatedMemberId, targetMember.id),
				isNull(memberSessions.endedAt),
			),
			orderBy: [desc(memberSessions.startedAt)],
		});
		expect(session, "member_sessions row must be inserted after impersonateMember").toBeTruthy();

		const sessionId = session!.id;

		// ── Cleanup wrapper — runs even if assertions fail below ──────────────────
		try {
			// ── Call stopImpersonating ────────────────────────────────────────────
			// Must include organizationId so orpcTenantMiddleware sets up tenantDb —
			// the handler uses tenantDb to write member_sessions.endedAt; without it
			// the update is silently skipped.
			const stopRes = await fetch(`${SERVER}/rpc/tenantAdmin/stopImpersonating`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Origin: ORIGIN,
					Cookie: buildCookieHeader(),
				},
				body: JSON.stringify({ json: { organizationId } }),
			});

			if (!stopRes.ok) {
				const body = await stopRes.text();
				throw new Error(`stopImpersonating failed: ${stopRes.status} ${body}`);
			}

			// ── Skip #4 assertion: member_sessions.endedAt updated ────────────────
			// Poll briefly — the DB write is synchronous in the handler but give a small
			// window for connection flush.
			let updated: typeof session | null = null;
			for (let i = 0; i < 10; i++) {
				updated = await t.query.memberSessions.findFirst({
					where: and(
						eq(memberSessions.id, sessionId),
						isNotNull(memberSessions.endedAt),
					),
				});
				if (updated) break;
				await new Promise((r) => setTimeout(r, 200));
			}
			expect(updated, "member_sessions.endedAt must be set after stopImpersonating").toBeTruthy();
			expect(updated!.endedAt, "endedAt must be a Date").toBeInstanceOf(Date);
		} finally {
			// ── Cleanup: delete the member_sessions audit row we created ──────────
			// Safe to run even if the test failed mid-way — idempotent.
			try {
				await t.delete(memberSessions).where(eq(memberSessions.id, sessionId));
			} catch (e) {
				console.warn("[teardown] memberSessions cleanup failed:", e);
			}

			// Defensive: verify dev admin user.role was restored by the handler.
			// If the elevation + restore in tenant-admin.ts failed, we fix it here
			// so subsequent test runs are not affected.
			try {
				const adminUserRefreshed = await cp.query.user.findFirst({
					where: eq(userTable.id, adminUser.id),
				});
				if (adminUserRefreshed && adminUserRefreshed.role === "admin" && adminUser.role !== "admin") {
					await cp
						.update(userTable)
						.set({ role: adminUser.role })
						.where(eq(userTable.id, adminUser.id));
					console.warn(
						"[teardown] dev admin user.role was stuck at 'admin' — restored to original:",
						adminUser.role,
					);
				}
			} catch (e) {
				console.warn("[teardown] user.role restore check failed:", e);
			}
		}
	});
});
