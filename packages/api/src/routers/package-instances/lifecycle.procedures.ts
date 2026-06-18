import {
	cancelPackageInstance,
	freezePackageInstance,
	unfreezePackageInstance,
	extendPackageInstance,
} from "@avantej-core/services";
import { packageInstances } from "@avantej-core/db/schema/tenant/package-instances";
import { services } from "@avantej-core/db/schema/tenant/services";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

export const packageInstancesLifecycleProcedures = {
	/**
	 * Cancel a package instance (admin only).
	 *
	 * Idempotency: already-cancelled → CONFLICT (not silent).
	 * Branch-scope: caller's accessibleNodeIds must include the instance's service branch.
	 */
	cancel: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reason: z.string().min(1).max(500),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

			// Load instance to resolve branch for scope check
			const instance = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.id),
			});
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}

			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			if (svc?.branchId) {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You do not have access to this branch",
					});
				}
			}

			// 7.5: Guard before writing to audit columns
			const cancellerUserId = context.session?.user?.id;
			if (!cancellerUserId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required for this operation",
				});
			}

			try {
				return await cancelPackageInstance(context.tenantDb, {
					id: input.id,
					actorUserId: cancellerUserId,
					actorMemberId: context.member.id,
					actorRole: context.member.role,
					reason: input.reason,
				});
			} catch (err) {
				if (err && typeof err === "object" && "code" in err) {
					const e = err as { code: string; message: string };
					if (e.code === "NOT_FOUND")
						throw new ORPCError("NOT_FOUND", { message: e.message });
					if (e.code === "CONFLICT")
						throw new ORPCError("CONFLICT", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Freeze an active package instance (admin only).
	 *
	 * `until` is optional — null means indefinitely frozen.
	 * Only `active` packages may be frozen.
	 */
	freeze: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				until: z.string().datetime().optional(),
				reason: z.string().min(1).max(500),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

			const instance = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.id),
			});
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}

			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			if (svc?.branchId) {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You do not have access to this branch",
					});
				}
			}

			// 7.5: Guard before writing to audit columns
			const freezerUserId = context.session?.user?.id;
			if (!freezerUserId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required for this operation",
				});
			}

			try {
				return await freezePackageInstance(context.tenantDb, {
					id: input.id,
					actorUserId: freezerUserId,
					actorMemberId: context.member.id,
					actorRole: context.member.role,
					until: input.until ? new Date(input.until) : undefined,
					reason: input.reason,
				});
			} catch (err) {
				if (err && typeof err === "object" && "code" in err) {
					const e = err as { code: string; message: string };
					if (e.code === "NOT_FOUND")
						throw new ORPCError("NOT_FOUND", { message: e.message });
					if (e.code === "BAD_REQUEST")
						throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Unfreeze a frozen package instance, returning it to `active` (admin only).
	 */
	unfreeze: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

			const instance = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.id),
			});
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}

			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			if (svc?.branchId) {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You do not have access to this branch",
					});
				}
			}

			// 7.5: Guard before writing to audit columns
			const unfreezerId = context.session?.user?.id;
			if (!unfreezerId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required for this operation",
				});
			}

			try {
				return await unfreezePackageInstance(context.tenantDb, {
					id: input.id,
					actorUserId: unfreezerId,
					actorMemberId: context.member.id,
					actorRole: context.member.role,
				});
			} catch (err) {
				if (err && typeof err === "object" && "code" in err) {
					const e = err as { code: string; message: string };
					if (e.code === "NOT_FOUND")
						throw new ORPCError("NOT_FOUND", { message: e.message });
					if (e.code === "BAD_REQUEST")
						throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Extend a package instance's expiry date (admin only).
	 *
	 * `addDays` must be 1–365. Terminal packages (cancelled/expired/completed)
	 * and non-expirable packages (null expiresAt) are rejected.
	 */
	extend: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				addDays: z.number().int().min(1).max(365),
				reason: z.string().min(1).max(500),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

			const instance = await context.tenantDb.query.packageInstances.findFirst({
				where: eq(packageInstances.id, input.id),
			});
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}

			const svc = await context.tenantDb.query.services.findFirst({
				where: eq(services.id, instance.serviceId),
			});
			if (svc?.branchId) {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "You do not have access to this branch",
					});
				}
			}

			// 7.5: Guard before writing to audit columns
			const extenderId = context.session?.user?.id;
			if (!extenderId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Session user ID is required for this operation",
				});
			}

			try {
				return await extendPackageInstance(context.tenantDb, {
					id: input.id,
					actorUserId: extenderId,
					actorMemberId: context.member.id,
					actorRole: context.member.role,
					addDays: input.addDays,
					reason: input.reason,
				});
			} catch (err) {
				if (err && typeof err === "object" && "code" in err) {
					const e = err as { code: string; message: string };
					if (e.code === "NOT_FOUND")
						throw new ORPCError("NOT_FOUND", { message: e.message });
					if (e.code === "BAD_REQUEST")
						throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				throw err;
			}
		}),
};
