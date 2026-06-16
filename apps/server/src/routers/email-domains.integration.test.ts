/**
 * Email domains oRPC router — integration test.
 *
 * Mocks the Resend SDK wrapper (so we don't hit a real Resend account) but
 * hits the real control-panel DB for row reads/writes. Seeds a verified
 * org-admin membership row so requireOrgAdmin passes.
 *
 * Requires migrations 0033 + 0034 applied; auto-skips when
 * SKIP_INTEGRATION_TESTS=true or DATABASE_URL is missing.
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import { eq, and } from "drizzle-orm";

const mockCreateResendDomain = mock(
	async (..._args: unknown[]): Promise<unknown> => ({
		id: `dom_mock_${crypto.randomUUID()}`,
		name: "ignored",
		status: "pending",
		records: [
			{ type: "TXT", name: "_resend", value: "test", status: "pending" },
		],
	}),
);
const mockGetResendDomain = mock(async (..._args: unknown[]): Promise<unknown> => ({
	id: "dom_mock",
	name: "mail-orpc-test.example.com",
	status: "verified",
	records: [],
}));
const mockVerifyResendDomain = mock(async (..._args: unknown[]): Promise<unknown> => undefined);
const mockRemoveResendDomain = mock(async (..._args: unknown[]): Promise<unknown> => undefined);

mock.module("@/lib/resend-domains", () => ({
	createResendDomain: mockCreateResendDomain,
	getResendDomain: mockGetResendDomain,
	verifyResendDomain: mockVerifyResendDomain,
	removeResendDomain: mockRemoveResendDomain,
}));

import {
	loadDevVars,
	shouldSkipIntegration,
	createControlPanelDb,
	TEST_ORG_ID,
	TEST_USER_ID,
} from "@/tests/helpers/integration-setup";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { emailDomains } from "@avantej-core/db/schema/control-panel/email-domains";
import { emailDomainsRouter } from "./email-domains";

function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>).handler as (
		args: unknown,
	) => Promise<T>;
}

let cpDb: ReturnType<typeof createControlPanelDb> | null = null;
let createdRowId: string | null = null;
const TEST_DOMAIN_NAME = `mail-orpc-test-${Date.now()}.example.com`;

function fakeContext(userId = TEST_USER_ID) {
	return {
		session: { user: { id: userId, email: "admin@test.local" } },
		honoContext: {
			get: (k: string) => (k === "controlPanelDb" ? cpDb : undefined),
		},
	};
}

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	cpDb = createControlPanelDb();

	await cpDb
		.insert(userTable)
		.values({
			id: TEST_USER_ID,
			email: `${TEST_USER_ID}@test.local`,
			name: "Email Domains Test Admin",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof userTable.$inferInsert)
		.onConflictDoNothing();

	await cpDb
		.insert(organizations)
		.values({
			id: TEST_ORG_ID,
			name: "Email domains test org",
			slug: `email-domains-orpc-${Date.now()}`,
			neonProjectId: `email-domains-orpc-${Date.now()}`,
			connectionString: "postgres://noop",
			paymentStatus: "active",
		})
		.onConflictDoNothing();

	await cpDb
		.insert(organizationMembers)
		.values({
			userId: TEST_USER_ID,
			organizationId: TEST_ORG_ID,
			role: "admin",
			status: "active",
		})
		.onConflictDoNothing();
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	if (!cpDb) return;
	await cpDb
		.delete(emailDomains)
		.where(
			and(
				eq(emailDomains.organizationId, TEST_ORG_ID),
				eq(emailDomains.domain, TEST_DOMAIN_NAME),
			),
		);
});

describe("emailDomainsRouter — integration", () => {
	test("create persists a row with DNS records from Resend", async () => {
		if (shouldSkipIntegration()) return;

		const handler = getHandler<{
			id: string;
			domain: string;
			resendDomainId: string;
			dnsRecords: unknown;
			status: string;
		}>(emailDomainsRouter.create);
		const row = await handler({
			context: fakeContext(),
			input: {
				organizationId: TEST_ORG_ID,
				domain: TEST_DOMAIN_NAME,
				fromName: "Test Org",
				defaultLocalPart: "noreply",
			},
		});
		createdRowId = row.id;
		expect(row.domain).toBe(TEST_DOMAIN_NAME);
		expect(row.resendDomainId.startsWith("dom_mock_")).toBe(true);
		expect(row.status).toBe("pending");
		expect(Array.isArray(row.dnsRecords)).toBe(true);
		expect(mockCreateResendDomain).toHaveBeenCalled();
	});

	test("list returns rows for the org", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<Array<{ id: string }>>(emailDomainsRouter.list);
		const rows = await handler({
			context: fakeContext(),
			input: { organizationId: TEST_ORG_ID },
		});
		expect(rows.some((r) => r.id === createdRowId)).toBe(true);
	});

	test("update persists fromName + defaultLocalPart", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<{
			fromName: string;
			defaultLocalPart: string | null;
		}>(emailDomainsRouter.update);
		const row = await handler({
			context: fakeContext(),
			input: {
				id: createdRowId!,
				organizationId: TEST_ORG_ID,
				fromName: "Renamed Org",
				defaultLocalPart: "billing",
			},
		});
		expect(row.fromName).toBe("Renamed Org");
		expect(row.defaultLocalPart).toBe("billing");
	});

	test("verify flips status to verified", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<{ status: string }>(emailDomainsRouter.verify);
		const row = await handler({
			context: fakeContext(),
			input: { id: createdRowId!, organizationId: TEST_ORG_ID },
		});
		expect(row.status).toBe("verified");
		expect(mockVerifyResendDomain).toHaveBeenCalled();
	});

	test("delete removes the row and calls Resend remove", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler<{ deleted: true; id: string }>(
			emailDomainsRouter.delete,
		);
		const result = await handler({
			context: fakeContext(),
			input: { id: createdRowId!, organizationId: TEST_ORG_ID },
		});
		expect(result.deleted).toBe(true);
		expect(mockRemoveResendDomain).toHaveBeenCalled();

		const rows = await cpDb!
			.select()
			.from(emailDomains)
			.where(eq(emailDomains.id, createdRowId!));
		expect(rows).toHaveLength(0);
		createdRowId = null;
	});

	test("non-member caller is rejected with FORBIDDEN", async () => {
		if (shouldSkipIntegration()) return;
		const handler = getHandler(emailDomainsRouter.list);
		await expect(
			handler({
				context: fakeContext("00000000-0000-4000-8000-000000000099"),
				input: { organizationId: TEST_ORG_ID },
			}),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
