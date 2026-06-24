import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the audit-log service so we observe writeAudit calls without a real DB.
const mockWriteAudit = mock(async (..._args: unknown[]): Promise<void> => {});
mock.module("@avantej-core/services/audit-log.service", () => ({
	writeAudit: mockWriteAudit,
}));

import { auditEmailDomainChange } from "./email-domains";

const fakeTenantDb = { __brand: "tenantDb" } as unknown;

function ctx(over: Record<string, unknown> = {}) {
	return {
		tenantDb: fakeTenantDb,
		member: { id: "mem_1", role: "admin" },
		session: { user: { id: "user_1" } },
		...over,
	};
}

beforeEach(() => {
	mockWriteAudit.mockClear();
});

describe("auditEmailDomainChange", () => {
	test("writes a registered audit row with the correct shape", async () => {
		await auditEmailDomainChange(ctx(), {
			action: "email_domain.registered",
			entityId: "dom_1",
			summary: 'Registered sending domain "mail.example.com"',
			changes: { domain: "mail.example.com", resendDomainId: "re_1" },
		});

		expect(mockWriteAudit).toHaveBeenCalledTimes(1);
		const [db, params] = mockWriteAudit.mock.calls[0]! as [unknown, Record<string, unknown>];
		expect(db).toBe(fakeTenantDb);
		expect(params.action).toBe("email_domain.registered");
		expect(params.entityType).toBe("email_domain");
		expect(params.entityId).toBe("dom_1");
		expect(params.actorUserId).toBe("user_1");
		expect(params.actorMemberId).toBe("mem_1");
		expect(params.actorRole).toBe("admin");
	});

	test("writes a deleted audit row", async () => {
		await auditEmailDomainChange(ctx(), {
			action: "email_domain.deleted",
			entityId: "dom_2",
			summary: 'Deleted sending domain "mail.example.com"',
			changes: { domain: "mail.example.com", resendDomainId: "re_2" },
		});
		const [, params] = mockWriteAudit.mock.calls[0]! as [unknown, Record<string, unknown>];
		expect(params.action).toBe("email_domain.deleted");
		expect(params.entityId).toBe("dom_2");
	});

	test("skips (no throw, no write) when tenantDb is missing", async () => {
		await expect(
			auditEmailDomainChange(ctx({ tenantDb: undefined }), {
				action: "email_domain.registered",
				entityId: "dom_3",
				summary: "x",
				changes: {},
			}),
		).resolves.toBeUndefined();
		expect(mockWriteAudit).not.toHaveBeenCalled();
	});

	test("skips when member is missing", async () => {
		await auditEmailDomainChange(ctx({ member: null }), {
			action: "email_domain.registered",
			entityId: "dom_4",
			summary: "x",
			changes: {},
		});
		expect(mockWriteAudit).not.toHaveBeenCalled();
	});

	test("never throws when writeAudit itself fails", async () => {
		mockWriteAudit.mockImplementationOnce(async () => {
			throw new Error("db down");
		});
		await expect(
			auditEmailDomainChange(ctx(), {
				action: "email_domain.deleted",
				entityId: "dom_5",
				summary: "x",
				changes: {},
			}),
		).resolves.toBeUndefined();
	});
});
