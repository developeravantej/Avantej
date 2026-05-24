/**
 * tenantProcedure perimeter — member required + org context match (Plan C.4/C.2).
 */

import { describe, expect, it, mock } from "bun:test";
import { call } from "@orpc/server";
import { brandsRouter } from "./brands";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeAdminDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

describe("tenantProcedure perimeter", () => {
	it("brands.list rejects when member is null", async () => {
		await expect(
			call(
				brandsRouter.list,
				{ organizationId: ORG_ID },
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeAdminDb(),
						member: null,
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("brands.list rejects organizationId mismatch", async () => {
		await expect(
			call(
				brandsRouter.list,
				{ organizationId: OTHER_ORG },
				{
					context: createMockContext({
						organizationId: ORG_ID,
						tenantDb: makeAdminDb(),
					}),
				},
			),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});
