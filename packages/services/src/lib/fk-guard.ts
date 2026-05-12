import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

/**
 * Asserts that a record with the given id exists in the table.
 * Throws ORPCError NOT_FOUND if not found.
 */
export async function assertExists(
	tenantDb: any,
	table: any,
	id: string,
	errorCode: string,
): Promise<void> {
	const rows = await tenantDb
		.select({ id: table.id })
		.from(table)
		.where(eq(table.id, id))
		.limit(1);
	if (!rows.length) {
		throw new ORPCError("NOT_FOUND", {
			message: `${errorCode} not found: ${id}`,
		});
	}
}
