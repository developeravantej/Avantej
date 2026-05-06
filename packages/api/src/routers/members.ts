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
        const userIds = memberRows.map((m) => m.userId);
        const userRows = await controlPanelDb
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(inArray(user.id, userIds));

        for (const u of userRows) {
          userMap.set(u.id, { name: u.name, email: u.email });
        }
      }

      return memberRows.map((m) => {
        const userDetails = userMap.get(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          role: m.role,
          // Wave 3a Agent 2.1 (Journey J1): expose nullable custom-role FK so the UI
          // can pre-select it in the edit dialog.
          roleId: m.roleId,
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
        // Wave 3a Agent 2.1 (Journey J1): optional FK to custom/system role row.
        // When provided, written to members.role_id alongside the legacy text role.
        // Pass null to explicitly clear the FK (revert to text-role only).
        roleId: z.string().uuid().nullable().optional(),
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
      const previousRoleId = member.roleId;

      // Update role using MembershipService (dual-writes controlPanel + tenant)
      const membershipService = new MembershipService(controlPanelDb);
      await membershipService.updateMemberRole({
        userId: member.userId,
        organizationId: input.organizationId,
        newRole: input.newRole,
        tenantDb: context.tenantDb,
      });

      // Wave 3a Agent 2.1 (Journey J1): MembershipService only writes the legacy
      // text `role` column. Write the new nullable `roleId` FK separately when the
      // caller supplies it (or explicit null to clear). Skipped when undefined so
      // legacy callers are unaffected.
      if (input.roleId !== undefined) {
        await context.tenantDb
          .update(members)
          .set({ roleId: input.roleId })
          .where(eq(members.id, input.memberId));
      }

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      if (!updatedMember) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found after role update",
        });
      }

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
        changes: {
          from: previousRole,
          to: input.newRole,
          ...(input.roleId !== undefined
            ? { roleIdFrom: previousRoleId, roleIdTo: input.roleId }
            : {}),
        },
      });

      return {
        success: true,
        member: {
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          roleId: updatedMember.roleId,
          hierarchyScopeId: updatedMember.hierarchyScopeId,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
        },
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

      if (!updatedMember) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found after status update",
        });
      }

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
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          hierarchyScopeId: updatedMember.hierarchyScopeId,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
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

      if (!updatedMember) {
        throw new ORPCError("NOT_FOUND", {
          message: "Member not found after status update",
        });
      }

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
          id: updatedMember.id,
          userId: updatedMember.userId,
          role: updatedMember.role,
          hierarchyScopeId: updatedMember.hierarchyScopeId,
          status: updatedMember.status,
          joinedAt: updatedMember.joinedAt,
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

      try {
        return await deactivateMember(context.tenantDb, input.memberId, actor);
      } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) {
          throw new ORPCError("NOT_FOUND", { message: error.message });
        }
        throw error;
      }
    }),
};

