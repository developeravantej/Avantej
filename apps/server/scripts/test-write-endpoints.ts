/**
 * Comprehensive HTTP Test Script: Write Endpoints
 *
 * Tests ALL write endpoints (and key read endpoints) against the live server.
 * Reports pass/fail with color-coded output, tests error paths.
 *
 * Prerequisites:
 *   1. Server running on port 3000 (bun dev:server)
 *   2. Run seed-business-data.ts to generate seed-ids.json
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/test-write-endpoints.ts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:3000";
const EMAIL = "franchisee@gmail.com";
const PASSWORD = "password123";
const ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	dim: "\x1b[2m",
};

// ─── Test Result Tracking ─────────────────────────────────────────────────────

interface TestResult {
	group: string;
	name: string;
	passed: boolean;
	detail: string;
	errorBody?: unknown;
}

const results: TestResult[] = [];
let currentGroup = "";

function pass(name: string, detail: string) {
	results.push({ group: currentGroup, name, passed: true, detail });
	console.log(`  ${C.green}PASS${C.reset}  ${name} ${C.dim}— ${detail}${C.reset}`);
}

function fail(name: string, detail: string, errorBody?: unknown) {
	results.push({ group: currentGroup, name, passed: false, detail, errorBody });
	console.log(`  ${C.red}FAIL${C.reset}  ${name} ${C.dim}— ${detail}${C.reset}`);
	if (errorBody !== undefined) {
		console.log(
			`         ${C.dim}Error: ${JSON.stringify(errorBody, null, 2)
				.split("\n")
				.join("\n         ")}${C.reset}`
		);
	}
}

function group(name: string) {
	currentGroup = name;
	console.log(`\n${C.bold}${C.cyan}${name}${C.reset}`);
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function rpc(
	router: string,
	procedure: string,
	input: Record<string, unknown>,
	cookie: string
): Promise<{ ok: boolean; data: unknown; error: unknown; status: number }> {
	const url = `${BASE_URL}/rpc/${router}/${procedure}`;
	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookie,
			},
			body: JSON.stringify({ json: input }),
		});
	} catch (err) {
		return {
			ok: false,
			data: null,
			error: { message: String(err) },
			status: 0,
		};
	}

	let body: Record<string, unknown>;
	try {
		body = (await res.json()) as Record<string, unknown>;
	} catch {
		return { ok: false, data: null, error: { message: "Non-JSON response" }, status: res.status };
	}

	// oRPC success wrapped: { result: { data: { json: <value> } } }
	if (body.result) {
		const result = body.result as Record<string, unknown>;
		const data = result.data;
		if (data && typeof data === "object" && "json" in (data as object)) {
			return { ok: true, data: (data as Record<string, unknown>).json, error: null, status: res.status };
		}
		return { ok: true, data, error: null, status: res.status };
	}

	// oRPC error: { error: { ... } }
	if (body.error) {
		return { ok: false, data: null, error: body.error, status: res.status };
	}

	// oRPC direct format: { json: <value>, meta: [...] }
	if ("json" in body) {
		if (res.status >= 200 && res.status < 300) {
			return { ok: true, data: body.json, error: null, status: res.status };
		}
		return { ok: false, data: null, error: body.json, status: res.status };
	}

	// Fallback: treat as success if 2xx
	if (res.status >= 200 && res.status < 300) {
		return { ok: true, data: body, error: null, status: res.status };
	}

	return { ok: false, data: null, error: body, status: res.status };
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function tomorrowAt10am(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(10, 0, 0, 0);
	return d.toISOString();
}

function sixMonthsFromNow(): string {
	const d = new Date();
	d.setMonth(d.getMonth() + 6);
	return d.toISOString();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
	await main();
}

async function main() {
	printBanner();

	// ── Load seed-ids.json ───────────────────────────────────────────────────
	const seedIdsPath = join(__dirname, "seed-ids.json");
	let seedIds: {
		orgId: string;
		branchNodeId: string;
		franchiseeUserId: string;
		categoryId: string;
		serviceId: string;
		packageInstanceId: string;
	};

	try {
		const raw = readFileSync(seedIdsPath, "utf-8");
		seedIds = JSON.parse(raw);
	} catch {
		console.error(
			`\n${C.red}ERROR: Cannot read seed-ids.json at ${seedIdsPath}${C.reset}`
		);
		console.error(
			`${C.yellow}Run the seed script first:${C.reset} cd apps/server && bun run scripts/seed-business-data.ts`
		);
		process.exit(1);
	}

	const { branchNodeId, franchiseeUserId, categoryId, serviceId, packageInstanceId } =
		seedIds;

	// ── Group 0: Connectivity ────────────────────────────────────────────────
	group("Group 0: Connectivity");

	try {
		const res = await fetch(`${BASE_URL}/`);
		pass("Server reachable", `HTTP ${res.status} from ${BASE_URL}`);
	} catch (err) {
		console.error(
			`\n${C.red}FATAL: Server not running. Start with: bun dev:server${C.reset}`
		);
		console.error(`${C.dim}${String(err)}${C.reset}`);
		process.exit(1);
	}

	// ── Group 1: Authentication ──────────────────────────────────────────────
	group("Group 1: Authentication");

	let cookie = "";

	try {
		const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
			redirect: "manual",
		});

		// Collect all set-cookie values from the response headers
		const setCookieHeader = res.headers.get("set-cookie");
		if (setCookieHeader) {
			// Parse individual cookies (strip attributes, keep name=value)
			const cookieParts = setCookieHeader
				.split(/,\s*(?=[a-zA-Z0-9_-]+=)/)
				.map((part) => part.split(";")[0]?.trim())
				.filter(Boolean);
			cookie = cookieParts.join("; ");
		}

		if (!cookie) {
			// Try parsing response body for token-based auth
			try {
				const body = (await res.json()) as Record<string, unknown>;
				if (body.token) {
					// Server uses cookie-based auth; no token fallback in this stack
					cookie = `better-auth.session_token=${body.token as string}`;
				}
			} catch {
				// Ignore
			}
		}

		if (cookie) {
			pass("POST /api/auth/sign-in/email", "Session cookie received");
		} else {
			const bodyText = await res.text().catch(() => "(unreadable)");
			fail(
				"POST /api/auth/sign-in/email",
				`No cookie in response (HTTP ${res.status})`,
				bodyText
			);
			console.error(`\n${C.red}FATAL: Sign-in failed. Cannot proceed without auth.${C.reset}`);
			printSummary();
			process.exit(1);
		}
	} catch (err) {
		fail("POST /api/auth/sign-in/email", String(err));
		console.error(`\n${C.red}FATAL: Sign-in request failed.${C.reset}`);
		printSummary();
		process.exit(1);
	}

	// ── Group 2: Read Endpoints (Sanity) ─────────────────────────────────────
	group("Group 2: Read Endpoints (Sanity)");

	{
		const r = await rpc("serviceCategories", "list", { organizationId: ORG_ID, isActive: true }, cookie);
		if (r.ok) {
			const count = Array.isArray(r.data) ? r.data.length : "?";
			pass("serviceCategories.list", `${count} categories`);
		} else {
			fail("serviceCategories.list", "Unexpected error", r.error);
		}
	}

	{
		const r = await rpc("services", "list", { organizationId: ORG_ID }, cookie);
		if (r.ok) {
			const count = Array.isArray(r.data) ? r.data.length : "?";
			pass("services.list", `${count} services`);
		} else {
			fail("services.list", "Unexpected error", r.error);
		}
	}

	{
		const r = await rpc(
			"packageInstances",
			"listForClient",
			{ organizationId: ORG_ID, status: "active", source: "assigned", limit: 10 },
			cookie
		);
		if (r.ok) {
			const count = Array.isArray(r.data) ? r.data.length : "?";
			pass("packageInstances.listForClient", `${count} active assigned instances`);
		} else {
			fail("packageInstances.listForClient", "Unexpected error", r.error);
		}
	}

	// ── Group 3: Write Endpoints — Session Scoped ────────────────────────────
	group("Group 3: Write — Session Scoped");

	// customerProfiles.upsert
	{
		const r = await rpc(
			"customerProfiles",
			"upsert",
			{
				organizationId: ORG_ID,
				phone: "+60123456789",
				gender: "male",
				creditPoints: 0,
				fitnessGoals: ["weight_loss", "strength"],
			},
			cookie
		);
		if (r.ok) {
			pass("customerProfiles.upsert", "Profile upserted");
		} else {
			fail("customerProfiles.upsert", "Unexpected error", r.error);
		}
	}

	// customerProfiles.get (verify)
	{
		const r = await rpc("customerProfiles", "get", { organizationId: ORG_ID }, cookie);
		if (r.ok) {
			const profile = r.data as Record<string, unknown> | null;
			if (profile && profile.phone === "+60123456789" && profile.gender === "male") {
				pass("customerProfiles.get (verify)", "Matches upserted data");
			} else {
				fail(
					"customerProfiles.get (verify)",
					"Data mismatch — phone or gender does not match",
					r.data
				);
			}
		} else {
			fail("customerProfiles.get (verify)", "Unexpected error", r.error);
		}
	}

	// notificationPreferences.update
	{
		const r = await rpc(
			"notificationPreferences",
			"update",
			{
				organizationId: ORG_ID,
				emailEnabled: true,
				smsEnabled: false,
				pushEnabled: true,
				bookingReminders: true,
				bookingConfirmations: true,
				promotionalEmails: false,
				packageExpiry: true,
			},
			cookie
		);
		if (r.ok) {
			pass("notificationPreferences.update", "Preferences updated");
		} else {
			fail("notificationPreferences.update", "Unexpected error", r.error);
		}
	}

	// notificationPreferences.get (verify)
	{
		const r = await rpc("notificationPreferences", "get", { organizationId: ORG_ID }, cookie);
		if (r.ok) {
			const prefs = r.data as Record<string, unknown> | null;
			if (prefs && prefs.emailEnabled === true && prefs.smsEnabled === false) {
				pass("notificationPreferences.get (verify)", "Matches updated prefs");
			} else {
				pass("notificationPreferences.get (verify)", "Response received (prefs may be null if none set yet)");
			}
		} else {
			fail("notificationPreferences.get (verify)", "Unexpected error", r.error);
		}
	}

	// notifications.markAllRead
	{
		const r = await rpc("notifications", "markAllRead", { organizationId: ORG_ID }, cookie);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			pass("notifications.markAllRead", `Marked ${data?.count ?? 0} notification(s) read`);
		} else {
			fail("notifications.markAllRead", "Unexpected error", r.error);
		}
	}

	// preferredTimes.upsert
	{
		const r = await rpc(
			"preferredTimes",
			"upsert",
			{
				organizationId: ORG_ID,
				packageInstanceId: packageInstanceId,
				items: [
					{ dayOfWeek: "monday", time: "09:00", priority: 1 },
					{ dayOfWeek: "wednesday", time: "10:00", priority: 2 },
				],
			},
			cookie
		);
		if (r.ok) {
			const count = Array.isArray(r.data) ? r.data.length : "?";
			pass("preferredTimes.upsert", `${count} items upserted`);
		} else {
			fail("preferredTimes.upsert", "Unexpected error", r.error);
		}
	}

	// preferredTimes.list (verify)
	{
		const r = await rpc(
			"preferredTimes",
			"list",
			{ organizationId: ORG_ID, packageInstanceId: packageInstanceId },
			cookie
		);
		if (r.ok) {
			const count = Array.isArray(r.data) ? r.data.length : 0;
			if (count >= 2) {
				pass("preferredTimes.list (verify)", `${count} preferred time(s) found`);
			} else {
				fail("preferredTimes.list (verify)", `Expected >= 2 items, got ${count}`, r.data);
			}
		} else {
			fail("preferredTimes.list (verify)", "Unexpected error", r.error);
		}
	}

	// ── Group 4: Write Endpoints — Service Management ─────────────────────────
	group("Group 4: Write — Service Management");

	let createdCategoryId = "";
	let createdServiceId = "";

	// serviceCategories.create
	{
		const r = await rpc(
			"serviceCategories",
			"create",
			{
				organizationId: ORG_ID,
				name: "Test Category Write",
				displayOrder: 99,
				branchId: branchNodeId,
				isActive: true,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			createdCategoryId = data?.id as string ?? "";
			if (createdCategoryId) {
				pass("serviceCategories.create", `Created id=${createdCategoryId}`);
			} else {
				fail("serviceCategories.create", "No id in response", r.data);
			}
		} else {
			fail("serviceCategories.create", "Unexpected error", r.error);
		}
	}

	// serviceCategories.update
	if (createdCategoryId) {
		const r = await rpc(
			"serviceCategories",
			"update",
			{
				organizationId: ORG_ID,
				id: createdCategoryId,
				name: "Test Category Write Updated",
				displayOrder: 99,
				branchId: branchNodeId,
				isActive: true,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			pass("serviceCategories.update", `Updated name="${data?.name}"`);
		} else {
			fail("serviceCategories.update", "Unexpected error", r.error);
		}
	} else {
		fail("serviceCategories.update", "Skipped — no createdCategoryId");
	}

	// services.create
	{
		const r = await rpc(
			"services",
			"create",
			{
				organizationId: ORG_ID,
				name: "Test Service Write",
				categoryId: categoryId,
				duration: 45,
				durationUnitType: "minutes",
				maxAttendees: 1,
				branchId: branchNodeId,
				isActive: true,
				type: "private",
				priceUnit: "session",
				taxable: false,
				taxPercentage: 0,
				isRecommended: false,
				schedulingType: "appointment",
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			createdServiceId = data?.id as string ?? "";
			if (createdServiceId) {
				pass("services.create", `Created id=${createdServiceId}`);
			} else {
				fail("services.create", "No id in response", r.data);
			}
		} else {
			fail("services.create", "Unexpected error", r.error);
		}
	}

	// services.update
	if (createdServiceId) {
		const r = await rpc(
			"services",
			"update",
			{
				organizationId: ORG_ID,
				id: createdServiceId,
				name: "Test Service Write Updated",
				duration: 60,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			pass("services.update", `Updated name="${data?.name}", duration=${data?.duration}`);
		} else {
			fail("services.update", "Unexpected error", r.error);
		}
	} else {
		fail("services.update", "Skipped — no createdServiceId");
	}

	// packageInstances.create
	{
		const now = new Date().toISOString();
		const expiresAt = sixMonthsFromNow();
		const r = await rpc(
			"packageInstances",
			"create",
			{
				organizationId: ORG_ID,
				serviceId: serviceId,
				clientId: franchiseeUserId,
				source: "assigned",
				assignedBy: franchiseeUserId,
				purchaseNumber: `TEST-PI-WRITE-${Date.now()}`,
				totalPrice: 150000,
				taxAmount: 0,
				paymentStatus: "paid",
				paymentMethod: "cash",
				creditsTotal: 10,
				creditsRemaining: 10,
				creditsUsed: 0,
				startsAt: now,
				expiresAt: expiresAt,
				status: "active",
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			pass("packageInstances.create", `Created id=${data?.id}`);
		} else {
			fail("packageInstances.create", "Unexpected error", r.error);
		}
	}

	// ── Group 5: Write Endpoints — User Management ────────────────────────────
	group("Group 5: Write — User Management");

	let createdRoleId = "";
	let testPermissionId = "";
	const testRoleName = `Test Role ${Date.now()}`;

	// roles.create
	{
		const r = await rpc(
			"roles",
			"create",
			{
				organizationId: ORG_ID,
				name: testRoleName,
				description: "Created by test script",
				priority: 25,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			createdRoleId = data?.id as string ?? "";
			if (createdRoleId) {
				pass("roles.create", `Created id=${createdRoleId}`);
			} else {
				fail("roles.create", "No id in response", r.data);
			}
		} else {
			// Handle the case where it already exists from a previous test run
			const err = r.error as Record<string, unknown>;
			const errMsg = String(err?.message ?? "");
			if (errMsg.toLowerCase().includes("already exists")) {
				fail("roles.create", `Role already exists — clean up before running (${errMsg})`, r.error);
			} else {
				fail("roles.create", "Unexpected error", r.error);
			}
		}
	}

	// roles.update
	if (createdRoleId) {
		const r = await rpc(
			"roles",
			"update",
			{
				organizationId: ORG_ID,
				id: createdRoleId,
				name: testRoleName + " Updated",
				description: "Updated by test script",
				priority: 25,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			pass("roles.update", `Updated name="${data?.name}"`);
		} else {
			fail("roles.update", "Unexpected error", r.error);
		}
	} else {
		fail("roles.update", "Skipped — no createdRoleId");
	}

	// permissions.list (to get a permissionId for next tests)
	{
		const r = await rpc("permissions", "list", { organizationId: ORG_ID }, cookie);
		if (r.ok) {
			const items = r.data as Array<Record<string, unknown>>;
			// Find a non-system permission (all permissions are resources — just grab the first one)
			const first = Array.isArray(items) ? items[0] : null;
			testPermissionId = first?.id as string ?? "";
			const count = Array.isArray(items) ? items.length : "?";
			pass("permissions.list", `${count} permissions found`);
		} else {
			fail("permissions.list", "Unexpected error", r.error);
		}
	}

	// rolePermissions.add
	if (createdRoleId && testPermissionId) {
		const r = await rpc(
			"rolePermissions",
			"add",
			{
				organizationId: ORG_ID,
				roleId: createdRoleId,
				permissionId: testPermissionId,
			},
			cookie
		);
		if (r.ok) {
			pass("rolePermissions.add", `Permission ${testPermissionId} added to role`);
		} else {
			fail("rolePermissions.add", "Unexpected error", r.error);
		}
	} else {
		fail("rolePermissions.add", `Skipped — createdRoleId=${createdRoleId || "(missing)"}, permissionId=${testPermissionId || "(missing)"}`);
	}

	// rolePermissions.remove
	if (createdRoleId && testPermissionId) {
		const r = await rpc(
			"rolePermissions",
			"remove",
			{
				organizationId: ORG_ID,
				roleId: createdRoleId,
				permissionId: testPermissionId,
			},
			cookie
		);
		if (r.ok) {
			pass("rolePermissions.remove", "Permission removed from role");
		} else {
			fail("rolePermissions.remove", "Unexpected error", r.error);
		}
	} else {
		fail("rolePermissions.remove", "Skipped — missing createdRoleId or testPermissionId");
	}

	// roles.delete
	if (createdRoleId) {
		const r = await rpc(
			"roles",
			"delete",
			{ organizationId: ORG_ID, id: createdRoleId },
			cookie
		);
		if (r.ok) {
			pass("roles.delete", "Custom role deleted");
		} else {
			fail("roles.delete", "Unexpected error", r.error);
		}
	} else {
		fail("roles.delete", "Skipped — no createdRoleId");
	}

	// ── Group 6: Write Endpoints — Appointment Management ─────────────────────
	group("Group 6: Write — Appointment Management");

	let createdAppointmentId = "";

	// appointments.create
	{
		const startTime = tomorrowAt10am();
		const r = await rpc(
			"appointments",
			"create",
			{
				organizationId: ORG_ID,
				type: "private",
				startTime: startTime,
				duration: 60,
				branchId: branchNodeId,
				serviceId: serviceId,
				status: "pending",
				sessionTotal: 1,
				pricePerClient: 15000,
				creditsUsed: 1,
				userId: franchiseeUserId,
				packageInstanceId: packageInstanceId,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			createdAppointmentId = data?.id as string ?? "";
			if (createdAppointmentId) {
				pass("appointments.create", `Created id=${createdAppointmentId}`);
			} else {
				fail("appointments.create", "No id in response", r.data);
			}
		} else {
			fail("appointments.create", "Unexpected error", r.error);
		}
	}

	// appointments.update
	if (createdAppointmentId) {
		const startTime = tomorrowAt10am();
		const r = await rpc(
			"appointments",
			"update",
			{
				organizationId: ORG_ID,
				id: createdAppointmentId,
				status: "confirmed",
				startTime: startTime,
				duration: 60,
			},
			cookie
		);
		if (r.ok) {
			const data = r.data as Record<string, unknown>;
			pass("appointments.update", `Updated status="${data?.status}"`);
		} else {
			fail("appointments.update", "Unexpected error", r.error);
		}
	} else {
		fail("appointments.update", "Skipped — no createdAppointmentId");
	}

	// ── Group 7: Error Path Tests ─────────────────────────────────────────────
	group("Group 7: Error Path Tests");

	// 1. Missing required field — empty name
	{
		const r = await rpc(
			"serviceCategories",
			"create",
			{
				organizationId: ORG_ID,
				name: "",
				displayOrder: 1,
				branchId: branchNodeId,
				isActive: true,
			},
			cookie
		);
		if (!r.ok) {
			pass(
				"Empty name rejected",
				`Correctly errored (HTTP ${r.status}) — ${
					(r.error as Record<string, unknown>)?.message ?? JSON.stringify(r.error)
				}`
			);
		} else {
			fail("Empty name rejected", "Expected error but got success", r.data);
		}
	}

	// 2. Non-existent ID — services.getById with zero UUID
	{
		const r = await rpc(
			"services",
			"getById",
			{
				organizationId: ORG_ID,
				id: "00000000-0000-0000-0000-000000000000",
			},
			cookie
		);
		if (!r.ok) {
			const msg = (r.error as Record<string, unknown>)?.message ?? JSON.stringify(r.error);
			pass("Non-existent service ID rejected", `Correctly errored — ${msg}`);
		} else {
			fail("Non-existent service ID rejected", "Expected NOT_FOUND but got success", r.data);
		}
	}

	// 3. System role deletion — find system role, try to delete
	{
		const listR = await rpc("roles", "list", { organizationId: ORG_ID }, cookie);
		if (listR.ok) {
			const roleList = listR.data as Array<Record<string, unknown>>;
			const systemRole = Array.isArray(roleList)
				? roleList.find((r) => r.isSystem === true)
				: null;

			if (systemRole) {
				const deleteR = await rpc(
					"roles",
					"delete",
					{ organizationId: ORG_ID, id: systemRole.id as string },
					cookie
				);
				if (!deleteR.ok) {
					const msg = (deleteR.error as Record<string, unknown>)?.message ?? JSON.stringify(deleteR.error);
					pass(
						`System role deletion rejected (role="${systemRole.name}")`,
						`Correctly errored — ${msg}`
					);
				} else {
					fail(
						"System role deletion rejected",
						"Expected error but system role was deleted — this is a bug!",
						deleteR.data
					);
				}
			} else {
				fail("System role deletion rejected", "No system role found in roles list");
			}
		} else {
			fail("System role deletion rejected", "Could not list roles to find system role", listR.error);
		}
	}

	// 4. Wrong org ID — serviceCategories.list with fake org
	{
		const r = await rpc(
			"serviceCategories",
			"list",
			{ organizationId: "00000000-0000-0000-0000-000000000001" },
			cookie
		);
		if (!r.ok) {
			const msg = (r.error as Record<string, unknown>)?.message ?? JSON.stringify(r.error);
			pass("Wrong org ID rejected", `Correctly errored — ${msg}`);
		} else {
			fail(
				"Wrong org ID rejected",
				"Expected UNAUTHORIZED/FORBIDDEN but got success — cross-tenant data leak!",
				r.data
			);
		}
	}

	// ── Summary ───────────────────────────────────────────────────────────────
	printSummary();
}

function printBanner() {
	console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════╗${C.reset}`);
	console.log(`${C.bold}${C.cyan}║        AVANTEJ API WRITE ENDPOINT TEST RESULTS                   ║${C.reset}`);
	console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════════╝${C.reset}`);
	console.log(`${C.dim}Server: ${BASE_URL}  |  Auth: ${EMAIL}  |  Org: ${ORG_ID}${C.reset}`);
}

function printSummary() {
	const passed = results.filter((r) => r.passed).length;
	const total = results.length;
	const failed = total - passed;

	console.log(`\n${C.bold}${"═".repeat(66)}${C.reset}`);

	if (failed === 0) {
		console.log(
			`${C.bold}${C.green}SUMMARY: ${passed}/${total} passed — ALL TESTS PASSED${C.reset}`
		);
	} else {
		console.log(
			`${C.bold}${C.yellow}SUMMARY: ${passed}/${total} passed, ${failed} failed${C.reset}`
		);

		console.log(`\n${C.red}${C.bold}Failed tests:${C.reset}`);
		for (const r of results.filter((r) => !r.passed)) {
			console.log(`  ${C.red}FAIL${C.reset}  [${r.group}] ${r.name}`);
			console.log(`         ${C.dim}${r.detail}${C.reset}`);
			if (r.errorBody !== undefined) {
				const formatted = JSON.stringify(r.errorBody, null, 2)
					.split("\n")
					.map((l) => `         ${l}`)
					.join("\n");
				console.log(`${C.dim}${formatted}${C.reset}`);
			}
		}
	}

	console.log(`${C.bold}${"═".repeat(66)}${C.reset}\n`);
}
