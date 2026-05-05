/**
 * Members Router
 *
 * API endpoints for managing organization members.
 * Members are stored in tenant databases and linked to users in the control panel.
 */

import { createMember } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq, and, inArray, asc, type SQL } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { getDescendantNodeIds, requirePermission, validateParentAccess } from "@avantej-core/services";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { deactivateMember } from "@avantej-core/services/member.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";

// Shared GHL staff sync dispatcher result type (Phase 7.4 wiring). The
// dispatcher itself is env-bound by `dbMiddleware` in apps/server and looked
// up via `context.honoContext.get("dispatchStaffSync")`. The function type is
// declared locally per handler since it references `typeof context.tenantDb`.
type GhlSyncResult = {
  status: "synced" | "skipped" | "error";
  reason?: string;
  ghlUserId?: string;
  error?: string;
};

export const memberRouter = {
  /**
   * List members in the organization
   *
   * Returns members with user details (name, email) from the control panel database.
   * RBAC: admins see all members; non-admins see only members within their hierarchy scope.
   * Requires user_management.read permission.
   */
  list: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        role: z.enum(["admin", "trainer", "staff", "client"]).optional(),
        status: z.enum(["active", "suspended"]).optional(),
        hierarchyScopeId: z.string().uuid().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Build filter conditions
      const conditions: SQL[] = [];

      if (input.role) {
        conditions.push(eq(members.role, input.role));
      }
      if (input.status) {
        conditions.push(eq(members.status, input.status));
      }
      if (input.hierarchyScopeId) {
        conditions.push(eq(members.hierarchyScopeId, input.hierarchyScopeId));
      }

      // RBAC: non-admins only see members within their accessible hierarchy
      if (context.member.role !== "admin") {
        const accessibleNodeIds =
          context.accessibleNodeIds ||
          (await getDescendantNodeIds(
            context.tenantDb,
            context.member.hierarchyScopeId
          ));

        if (accessibleNodeIds.length > 0) {
          conditions.push(inArray(members.hierarchyScopeId, accessibleNodeIds));
        } else {
          // No accessible nodes means no members visible
          return [];
        }
      }

      // Query members from tenant DB
      const memberRows = await context.tenantDb
        .select()
        .from(members)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(members.joinedAt));

      if (memberRows.length === 0) {
        return [];
      }

      // Cross-DB enrichment: batch-fetch user details from control panel
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      let userMap = new Map<string, { name: string; email: string }>();

      if (controlPanelDb) {
        const userIds = memberRows.map((m: any) => m.userId);
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, userIds));

        for (const u of userRows) {
          userMap.set(u.id, { name: u.name, email: u.email });
        }
      }

      return memberRows.map((m: any) => {
        const userDetails = userMap.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          role: m.role,
          hierarchyScopeId: m.hierarchyScopeId,
          status: m.status,
          joinedAt: m.joinedAt,
          trainerTierId: m.trainerTierId,
          name: userDetails?.name ?? "Unknown",
          email: userDetails?.email ?? "Unknown",
        };
      });
    }),

  /**
   * Create a new member in the organization
   *
   * Creates a member record in both control panel and tenant databases.
   * Requires user_management.create permission.
   */
  create: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["admin", "trainer", "staff", "client"]),
        hierarchyScopeId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission to create members
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "create"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Get control panel database from context
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Validate hierarchy scope access
      const {
        tenantDb,
        member,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;

      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (member
          ? await getDescendantNodeIds(tenantDb, member.hierarchyScopeId)
          : []);

      // Skip validation for admins (they have access to all nodes)
      if (member.role !== "admin") {
        try {
          validateParentAccess(input.hierarchyScopeId, accessibleNodeIds);
        } catch (error) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error ? error.message : "Hierarchy scope not accessible",
          });
        }
      }

      // Find user by email in control panel database
      const targetUser = await controlPanelDb.query.user.findFirst({
        where: eq(user.email, input.email.toLowerCase()),
      });

      if (!targetUser) {
        throw new ORPCError("NOT_FOUND", {
          message: `User with email ${input.email} not found. User must be registered first.`,
        });
      }

      // Check if user is already a member
      const existingMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.userId, targetUser.id),
      });

      if (existingMember) {
        throw new ORPCError("CONFLICT", {
          message: "User is already a member of this organization",
        });
      }

      // Create member (dual-write to control panel + tenant)
      await createMember(
        controlPanelDb,
        context.tenantDb,
        {
          userId: targetUser.id,
          organizationId: input.organizationId,
          role: input.role,
          hierarchyScopeId: input.hierarchyScopeId,
        }
      );

      // Return the created member record
      const createdMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.userId, targetUser.id),
      });

      if (!createdMember) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Member created but could not be retrieved",
        });
      }

      // Best-effort GHL staff sync (Phase 7.4 wiring). The dispatcher is
      // env-bound by `dbMiddleware` in apps/server. It's optional — older
      // clients / environments without GHL configured simply skip.
      // The dispatcher itself is soft-fail; the .catch is defense-in-depth.
      type DispatchStaffSyncFn = (args: {
        controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
        tenantDb: typeof context.tenantDb;
        organizationId: string;
        memberId: string;
        operation: "create" | "update" | "delete";
      }) => Promise<GhlSyncResult>;

      const dispatchStaffSync = context.honoContext?.get(
        "dispatchStaffSync"
      ) as DispatchStaffSyncFn | undefined;

      let ghlSync: GhlSyncResult | undefined;
      if (dispatchStaffSync) {
        ghlSync = await dispatchStaffSync({
          controlPanelDb,
          tenantDb: context.tenantDb,
          organizationId: input.organizationId,
          memberId: createdMember.id,
          operation: "create",
        }).catch((err: unknown) => ({
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      return {
        success: true,
        member: {
          id: createdMember.id,
          userId: createdMember.userId,
          role: createdMember.role,
          hierarchyScopeId: createdMember.hierarchyScopeId,
          status: createdMember.status,
          joinedAt: createdMember.joinedAt,
        },
        ghlSync,
      };
    }),

  /**
   * Get member by ID
   *
   * Returns member details including accessible node IDs.
   * Requires user_management.read permission.
   */
  getById: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "read"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Get the member
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Check if current user can access this member's hierarchy scope
      const {
        tenantDb,
        member: currentMember,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (currentMember
          ? await getDescendantNodeIds(tenantDb, currentMember.hierarchyScopeId)
          : []);

      // Admins can access all members, others can only access members in their scope
      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to this member",
          });
        }
      }

      // Get accessible node IDs for this member
      const memberAccessibleNodeIds = await getDescendantNodeIds(
        context.tenantDb,
        member.hierarchyScopeId
      );

      // Get user details from control panel
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      let userDetails = null;
      if (controlPanelDb) {
        const userRecord = await controlPanelDb.query.user.findFirst({
          where: eq(user.id, member.userId),
        });
        if (userRecord) {
          userDetails = {
            id: userRecord.id,
            name: userRecord.name,
            email: userRecord.email,
            emailVerified: userRecord.emailVerified,
          };
        }
      }

      return {
        member: {
          id: member.id,
          userId: member.userId,
          role: member.role,
          hierarchyScopeId: member.hierarchyScopeId,
          status: member.status,
          joinedAt: member.joinedAt,
        },
        accessibleNodeIds: memberAccessibleNodeIds,
        user: userDetails,
      };
    }),

  /**
   * Update member role
   *
   * Updates a member's role in both control panel and tenant databases.
   * Requires user_management.update permission.
   */
  updateRole: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newRole: z.enum(["admin", "trainer", "staff", "client"]),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Get the member to update
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Check if current user can access this member
      const {
        tenantDb,
        member: currentMember,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (currentMember
          ? await getDescendantNodeIds(tenantDb, currentMember.hierarchyScopeId)
          : []);

      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to update this member",
          });
        }
      }

      // Get control panel database
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      const previousRole = member.role;

      // Update role using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.updateMemberRole({
        userId: member.userId,
        organizationId: input.organizationId,
        newRole: input.newRole,
        tenantDb: context.tenantDb,
      });

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      // DEVIATION from §4.8: MembershipService does a dual-write (controlPanel + tenant)
      // and does not expose a tx hook. Audit is written after the fact on a separate query.
      // Rare orphan window: if process dies between role update and this write, the audit
      // row is missing but the role change succeeded.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.role_change",
        entityType: "member",
        entityId: input.memberId,
        branchId: member.hierarchyScopeId,
        summary: `Changed member role from "${previousRole}" to "${input.newRole}"`,
        changes: { from: previousRole, to: input.newRole },
      });

      // Best-effort GHL staff sync (Phase 7.4 wiring). See members.create for
      // the rationale; same defensive pattern applies here.
      type DispatchStaffSyncFn = (args: {
        controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
        tenantDb: typeof context.tenantDb;
        organizationId: string;
        memberId: string;
        operation: "create" | "update" | "delete";
      }) => Promise<GhlSyncResult>;

      const dispatchStaffSync = context.honoContext?.get(
        "dispatchStaffSync"
      ) as DispatchStaffSyncFn | undefined;

      let ghlSync: GhlSyncResult | undefined;
      if (dispatchStaffSync) {
        ghlSync = await dispatchStaffSync({
          controlPanelDb,
          tenantDb: context.tenantDb,
          organizationId: input.organizationId,
          memberId: input.memberId,
          operation: "update",
        }).catch((err: unknown) => ({
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      return {
        success: true,
        member: {
          id: updatedMember!.id,
          userId: updatedMember!.userId,
          role: updatedMember!.role,
          hierarchyScopeId: updatedMember!.hierarchyScopeId,
          status: updatedMember!.status,
          joinedAt: updatedMember!.joinedAt,
        },
        ghlSync,
      };
    }),

  /**
   * Suspend member
   *
   * Suspends a member in both control panel and tenant databases.
   * Requires user_management.update permission.
   */
  suspend: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Get the member to suspend
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Check if current user can access this member
      const {
        tenantDb,
        member: currentMember,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (currentMember
          ? await getDescendantNodeIds(tenantDb, currentMember.hierarchyScopeId)
          : []);

      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to suspend this member",
          });
        }
      }

      // Get control panel database
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Suspend member using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.suspendMember({
        userId: member.userId,
        organizationId: input.organizationId,
        tenantDb: context.tenantDb,
      });

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      // DEVIATION from §4.8: MembershipService does a dual-write and does not expose a tx hook.
      // Audit is written after the fact. Rare orphan window if process dies between writes.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.suspend",
        entityType: "member",
        entityId: input.memberId,
        branchId: member.hierarchyScopeId,
        summary: `Suspended member ${input.memberId}`,
        changes: { statusBefore: member.status, statusAfter: "suspended" },
      });

      return {
        success: true,
        member: {
          id: updatedMember!.id,
          userId: updatedMember!.userId,
          role: updatedMember!.role,
          hierarchyScopeId: updatedMember!.hierarchyScopeId,
          status: updatedMember!.status,
          joinedAt: updatedMember!.joinedAt,
        },
      };
    }),

  /**
   * Reactivate member
   *
   * Reactivates a suspended member in both control panel and tenant databases.
   * Requires user_management.update permission.
   */
  reactivate: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Get the member to reactivate
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Check if current user can access this member
      const {
        tenantDb,
        member: currentMember,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (currentMember
          ? await getDescendantNodeIds(tenantDb, currentMember.hierarchyScopeId)
          : []);

      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to reactivate this member",
          });
        }
      }

      // Get control panel database
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Reactivate member using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.reactivateMember({
        userId: member.userId,
        organizationId: input.organizationId,
        tenantDb: context.tenantDb,
      });

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      // DEVIATION from §4.8: MembershipService does a dual-write and does not expose a tx hook.
      // Audit is written after the fact. Rare orphan window if process dies between writes.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.reactivate",
        entityType: "member",
        entityId: input.memberId,
        branchId: member.hierarchyScopeId,
        summary: `Reactivated member ${input.memberId}`,
        changes: { statusBefore: member.status, statusAfter: "active" },
      });

      return {
        success: true,
        member: {
          id: updatedMember!.id,
          userId: updatedMember!.userId,
          role: updatedMember!.role,
          hierarchyScopeId: updatedMember!.hierarchyScopeId,
          status: updatedMember!.status,
          joinedAt: updatedMember!.joinedAt,
        },
      };
    }),

  /**
   * Remove member
   *
   * Removes a member from both control panel and tenant databases.
   * Validates that the last admin cannot be removed.
   * Requires user_management.delete permission.
   */
  remove: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "delete"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      // Get the member to remove
      const member = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!member) {
        throw new ORPCError("NOT_FOUND", {
          message: `Member not found: ${input.memberId}`,
        });
      }

      // Check if current user can access this member
      const {
        tenantDb,
        member: currentMember,
        accessibleNodeIds: contextAccessibleNodeIds,
      } = context;
      const accessibleNodeIds =
        contextAccessibleNodeIds ||
        (currentMember
          ? await getDescendantNodeIds(tenantDb, currentMember.hierarchyScopeId)
          : []);

      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to remove this member",
          });
        }
      }

      // Get control panel database
      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;

      if (!controlPanelDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Control panel database not available in context",
        });
      }

      // Remove member using MembershipService (validates last admin check)
      const membershipService = new MembershipService(controlPanelDb);
      try {
        await membershipService.removeMember({
          userId: member.userId,
          organizationId: input.organizationId,
          tenantDb: context.tenantDb,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Cannot remove last admin")
        ) {
          throw new ORPCError("BAD_REQUEST", {
            message: error.message,
          });
        }
        throw error;
      }

      return {
        success: true,
        message: "Member removed successfully",
      };
    }),

  /**
   * Deactivate member
   *
   * Sets a member's status to "inactive" directly in the tenant database.
   * Unlike suspend (which dual-writes to control panel via MembershipService),
   * this is a simpler tenant-only status change.
   * Requires user_management.update permission.
   */
  deactivate: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      if (!context.member) {
        throw new ORPCError("FORBIDDEN", {
          message: "User is not a member of this organization",
        });
      }

      // Check permission
      try {
        await requirePermission(
          context.tenantDb,
          context.member,
          "user_management",
          "update"
        );
      } catch (error) {
        throw new ORPCError("FORBIDDEN", {
          message: error instanceof Error ? error.message : "Permission denied",
        });
      }

      const actor = {
        userId: context.session!.user.id,
        memberId: context.member.id,
        role: context.member.role,
      };

      let result: Awaited<ReturnType<typeof deactivateMember>>;
      try {
        result = await deactivateMember(context.tenantDb, input.memberId, actor);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw new ORPCError("NOT_FOUND", { message: error.message });
        }
        throw error;
      }

      // Best-effort GHL staff sync (Phase 7.4 wiring). Operation=delete; the
      // dispatcher itself enforces the deactivate-skip rule (e.g. when GHL
      // policy is to keep the user but revoke access). Soft-fail like create.
      type DispatchStaffSyncFn = (args: {
        controlPanelDb: NeonDatabase<typeof controlPanelSchema>;
        tenantDb: typeof context.tenantDb;
        organizationId: string;
        memberId: string;
        operation: "create" | "update" | "delete";
      }) => Promise<GhlSyncResult>;

      const controlPanelDb = context.honoContext?.get(
        "controlPanelDb"
      ) as NeonDatabase<typeof controlPanelSchema> | undefined;
      const dispatchStaffSync = context.honoContext?.get(
        "dispatchStaffSync"
      ) as DispatchStaffSyncFn | undefined;

      let ghlSync: GhlSyncResult | undefined;
      if (dispatchStaffSync && controlPanelDb) {
        ghlSync = await dispatchStaffSync({
          controlPanelDb,
          tenantDb: context.tenantDb,
          organizationId: input.organizationId,
          memberId: input.memberId,
          operation: "delete",
        }).catch((err: unknown) => ({
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        }));
      }

      return { ...result, ghlSync };
    }),

  // TODO(GHL): Branch reassignment (changing a member's hierarchyScopeId) is
  // not yet exposed as its own oRPC procedure. When it lands, wire it to
  // `dispatchStaffSync({ ..., operation: "update" })` after the reassignment
  // commits — the dispatcher routes branch changes via the GHL PUT path.
};

