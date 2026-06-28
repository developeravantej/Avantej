import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { listCustomerDirectory } from "@avantej-core/services/customer-directory.service";
import { eq } from "drizzle-orm";
import { getControlPanelDb, getTenantDb } from "@/lib/db";

/**
 * Regression coverage for the directory search fix
 * ("fix(customers): directory search by name/email/phone (any phone format)").
 *
 * The bug: listCustomerDirectory applied `AND cp.phone ILIKE %search%` in SQL, so
 * search filtered by PHONE only — name/email search returned nothing, and phone
 * only matched the exact stored format. The unit test mocks tenantDb.execute and
 * therefore CANNOT exercise the SQL WHERE; this is the correct seam — a real DB.
 *
 * Seeds a unique throwaway customer in the test tenant, asserts every search mode
 * finds it, then deletes the seeded rows. Gated on DATABASE_URL.
 */
const HAS_DB = !!process.env.DATABASE_URL;
const suite = HAS_DB ? describe : describe.skip;

suite("customer directory search (real DB)", () => {
	const tag = randomUUID().slice(0, 8);
	const uid = randomUUID();
	const name = `Zsearchtest ${tag}`;
	const email = `srchtest-${tag}@directory-test.local`;
	// Stored with formatting; search must match it from any format.
	const phone = "012-345 6789";

	// biome-ignore lint/suspicious/noExplicitAny: standalone DB clients in a test
	let cpDb: any;
	// biome-ignore lint/suspicious/noExplicitAny: standalone DB clients in a test
	let tDb: any;
	let orgId = "";
	let nodeId = "";
	let memberId = "";
	let profileId = "";

	beforeAll(async () => {
		cpDb = getControlPanelDb();
		const org = await cpDb.query.organizations.findFirst({
			where: eq(organizations.name, "Test Fitness Franchise"),
		});
		orgId = org.id;
		tDb = await getTenantDb(orgId);
		const [node] = await tDb
			.select({ id: hierarchyNodes.id })
			.from(hierarchyNodes)
			.where(eq(hierarchyNodes.type, "branch"))
			.limit(1);
		nodeId = node.id;

		const now = new Date();
		await cpDb.insert(userTable).values({
			id: uid,
			name,
			firstName: "Zsearchtest",
			lastName: tag,
			email,
			emailVerified: false,
			createdAt: now,
			updatedAt: now,
		});
		const [m] = await tDb
			.insert(members)
			.values({
				userId: uid,
				role: "client",
				status: "active",
				hierarchyScopeId: nodeId,
			})
			.returning({ id: members.id });
		memberId = m.id;
		const [cp] = await tDb
			.insert(customerProfiles)
			.values({ userId: uid, phone })
			.returning({ id: customerProfiles.id });
		profileId = cp.id;
	});

	afterAll(async () => {
		if (!HAS_DB) return;
		try {
			if (profileId)
				await tDb
					.delete(customerProfiles)
					.where(eq(customerProfiles.id, profileId));
		} catch {}
		try {
			if (memberId) await tDb.delete(members).where(eq(members.id, memberId));
		} catch {}
		try {
			await cpDb.delete(userTable).where(eq(userTable.id, uid));
		} catch {}
	});

	const finds = async (search: string): Promise<boolean> => {
		const r = await listCustomerDirectory(cpDb, tDb, orgId, {
			search,
			accessibleNodeIds: [nodeId],
			limit: 50,
			offset: 0,
		});
		// biome-ignore lint/suspicious/noExplicitAny: row shape from service
		return r.rows.some((x: any) => x.userId === uid);
	};

	test("matches by name fragment", async () => {
		expect(await finds(tag)).toBe(true);
	});

	test("matches by email fragment", async () => {
		expect(await finds(`srchtest-${tag}`)).toBe(true);
	});

	test("matches by phone digits only (different format)", async () => {
		expect(await finds("0123456789")).toBe(true);
	});

	test("matches by phone with country code (+60)", async () => {
		expect(await finds("+60123456789")).toBe(true);
	});

	test("does not match an unrelated term", async () => {
		expect(await finds("zzz-no-such-customer-xyzzy")).toBe(false);
	});
});
