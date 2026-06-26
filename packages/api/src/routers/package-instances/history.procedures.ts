import { getPackageInstanceStatusHistory } from "@avantej-core/services";
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { inArray, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { parseCursor, encodeCursor } from "../../lib/cursor";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	requirePermissionOrpc,
	guardStoredBranchForContext,
} from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";

export const packageInstancesHistoryProcedures = {
	statusHistory: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				cursor: z.string().optional(),
				limit: z.number().int().min(1).max(100).default(50),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"read",
			);

			// Branch-scope: load instance → service, guard against accessibleNodeIds.
			// A foreign instanceId must surface as NOT_FOUND, not an empty page
			// (closes the enumeration oracle). Matches the lifecycle procedures.
			const instance = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.packageInstanceId),
			});
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}
			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			await guardStoredBranchForContext(context, svc?.branchId ?? null);

			const limit = input.limit;
			const parsedCursor = input.cursor ? parseCursor(input.cursor) : null;

			const rawRows = await getPackageInstanceStatusHistory(
				context.tenantDb,
				input.packageInstanceId,
				{ parsedCursor, limit },
			);

			const hasMore = rawRows.length > limit;
			const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
			const lastRow = pageRows.at(-1);
			const nextCursor =
				hasMore && lastRow ? encodeCursor(lastRow.changedAt, lastRow.id) : null;

			const userIds = [
				...new Set(
					pageRows.map((r) => r.changedBy).filter((id) => id !== "system"),
				),
			];
			const cpDb = getControlPanelDb(context);
			const userRecords =
				userIds.length > 0
					? await cpDb
							.select({
								id: cpUsers.id,
								name: cpUsers.name,
								email: cpUsers.email,
							})
							.from(cpUsers)
							.where(inArray(cpUsers.id, userIds))
					: [];
			const nameMap = new Map(
				userRecords.map((u) => [u.id, u.name ?? u.email ?? "Unknown User"]),
			);

			const rows = pageRows.map(({ changedBy, ...rest }) => ({
				...rest,
				changedByName:
					changedBy === "system"
						? "System"
						: (nameMap.get(changedBy) ?? "Unknown User"),
			}));

			return { rows, nextCursor };
		}),
};
