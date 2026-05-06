/**
 * Members Router
 *
 * API endpoints for managing organization members.
 * Members are stored in tenant databases and linked to users in the control panel.
 */

import { createMember } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { user } from "@avantej-core/db/schema/auth";
import { desc, eq, and, inArray, asc, type SQL } from "drizzle-orm";
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

      // GHL sync enrichment: fetch the most recent ghl_user_links row per
      // member (a member may have one link per branch; we surface the latest
      // updated entry as a representative status for the row).
      const memberIds = memberRows.map((m: any) => m.id);
      const ghlLinkRows = memberIds.length
        ? await context.tenantDb
            .select({
              memberId: ghlUserLinks.memberId,
              syncStatus: ghlUserLinks.syncStatus,
              lastError: ghlUserLinks.lastError,
              lastSyncedAt: ghlUserLinks.lastSyncedAt,
              ghlUserId: ghlUserLinks.ghlUserId,
              updatedAt: ghlUserLinks.updatedAt,
            })
            .from(ghlUserLinks)
            .where(inArray(ghlUserLinks.memberId, memberIds))
            .orderBy(desc(ghlUserLinks.updatedAt))
        : [];

      // Keep only the first (most recent by updatedAt) row per memberId.
      type StaffSync = {
        kind: "staff";
        syncStatus: string;
        lastError: string | null;
        lastSyncedAt: Date | null;
        ghlUserId: string;
      };
      const ghlByMember = new Map<string, StaffSync>();
      for (const row of ghlLinkRows) {
        if (!ghlByMember.has(row.memberId)) {
          ghlByMember.set(row.memberId, {
            kind: "staff",
            syncStatus: row.syncStatus,
            lastError: row.lastError,
            lastSyncedAt: row.lastSyncedAt,
            ghlUserId: row.ghlUserId,
          });
        }
      }

      // Customer-side GHL enrichment: for client members, join through
      // customer_profiles (userId) to ghl_contact_links (customerProfileId).
      // A customer may have one Contact per branch — surface the most recent
      // by updatedAt as the representative status for the row.
      type CustomerSync = {
        kind: "customer";
        syncStatus: string;
        lastError: string | null;
        lastSyncedAt: Date | null;
        ghlContactId: string;
        customerProfileId: string;
      };
      const customerSyncByUserId = new Map<string, CustomerSync>();
      const clientUserIds = memberRows
        .filter((m: any) => m.role === "client")
        .map((m: any) => m.userId as string);

      if (clientUserIds.length > 0) {
        const profileRows = await context.tenantDb
          .select({
            id: customerProfiles.id,
            userId: customerProfiles.userId,
          })
          .from(customerProfiles)
          .where(inArray(customerProfiles.userId, clientUserIds));

        const profileIds = profileRows.map((p: { id: string; userId: string }) => p.id);
        const profileIdToUserId = new Map<string, string>(
          profileRows.map((p: { id: string; userId: string }) => [p.id, p.userId]),
        );

        if (profileIds.length > 0) {
          const contactLinkRows = await context.tenantDb
            .select({
              customerProfileId: ghlContactLinks.customerProfileId,
              syncStatus: ghlContactLinks.syncStatus,
              lastError: ghlContactLinks.lastError,
              lastSyncedAt: ghlContactLinks.lastSyncedAt,
              ghlContactId: ghlContactLinks.ghlContactId,
              updatedAt: ghlContactLinks.updatedAt,
            })
            .from(ghlContactLinks)
            .where(inArray(ghlContactLinks.customerProfileId, profileIds))
            .orderBy(desc(ghlContactLinks.updatedAt));

          for (const row of contactLinkRows) {
            if (!row.customerProfileId) continue;
            const uid = profileIdToUserId.get(row.customerProfileId);
            if (!uid) continue;
            if (!customerSyncByUserId.has(uid)) {
              customerSyncByUserId.set(uid, {
                kind: "customer",
                syncStatus: row.syncStatus,
                lastError: row.lastError,
                lastSyncedAt: row.lastSyncedAt,
                ghlContactId: row.ghlContactId,
                customerProfileId: row.customerProfileId,
              });
            }
          }
        }

        // Surface customerProfileId on rows even when no contact-link row
        // exists yet — needed so the UI can wire `retryGhlSync` for clients
        // whose first sync attempt has not yet created a link row.
        for (const p of profileRows as Array<{ id: string; userId: string }>) {
          if (!customerSyncByUserId.has(p.userId)) {
            customerSyncByUserId.set(p.userId, {
              kind: "customer",
              syncStatus: "inactive",
              lastError: null,
              lastSyncedAt: null,
              ghlContactId: "",
              customerProfileId: p.id,
            });
          }
        }
      }

      return memberRows.map((m: any) => {
        const userDetails = userMap.get(m.userId);
        const staff = ghlByMember.get(m.id);
        const customer =
          m.role === "client" ? customerSyncByUserId.get(m.userId) : undefined;
        const ghlSync = customer ?? staff ?? null;
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
          ghlSync,
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

  /**
   * Update member's hierarchy scope (branch reassignment)
   *
   * Moves a member to a different branch by updating `member.hierarchyScopeId`
   * in the tenant database. Wired to `dispatchStaffSync({ operation: "update" })`
   * — the dispatcher detects the branch change against the existing
   * `ghl_user_links.branchNodeId` and routes via the GHL PUT path with new
   * locationIds, updating the link row.
   * Requires user_management.update permission.
   */
  updateScope: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
        newHierarchyScopeId: z.string().uuid(),
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

      // Compute accessible nodes once for both checks below
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

      // Check if current user can access target member (admins bypass)
      if (currentMember.role !== "admin") {
        if (!accessibleNodeIds.includes(member.hierarchyScopeId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "User does not have access to update this member",
          });
        }

        // And actor must have access to the destination scope as well
        try {
          validateParentAccess(input.newHierarchyScopeId, accessibleNodeIds);
        } catch (error) {
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error
                ? error.message
                : "Hierarchy scope not accessible",
          });
        }
      }

      const previousScopeId = member.hierarchyScopeId;

      // Update hierarchyScopeId in tenant DB
      await context.tenantDb
        .update(members)
        .set({ hierarchyScopeId: input.newHierarchyScopeId })
        .where(eq(members.id, input.memberId));

      // Get updated member
      const updatedMember = await context.tenantDb.query.members.findFirst({
        where: eq(members.id, input.memberId),
      });

      // Audit log entry. Note: branchId reflects the NEW scope so the audit row
      // is filterable from the destination branch's perspective.
      await writeAudit(context.tenantDb, {
        actorUserId: context.session!.user.id,
        actorMemberId: context.member.id,
        actorRole: context.member.role,
        action: "member.scope_change",
        entityType: "member",
        entityId: input.memberId,
        branchId: input.newHierarchyScopeId,
        summary: `Moved member from branch "${previousScopeId}" to "${input.newHierarchyScopeId}"`,
        changes: { from: previousScopeId, to: input.newHierarchyScopeId },
      });

      // Best-effort GHL staff sync. The dispatcher detects the branch change
      // (existing ghl_user_links.branchNodeId vs the now-updated member scope)
      // and routes via the PUT path with new locationIds.
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
   * Manually retry GHL staff sync for a member (Phase 7.4 wiring).
   *
   * Useful when the original create/update/delete dispatched but the GHL side
   * errored, and an operator wants to retry without re-saving the member row.
   * Always dispatches with operation=update; the dispatcher resolves the
   * member's current state in tenant + control-panel and reconciles.
   */
  retryGhlSync: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        memberId: z.string().uuid(),
      })
    )
    .handler(async ({ context, input }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

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

      if (!controlPanelDb || !dispatchStaffSync) {
        return {
          ghlSync: {
            status: "error" as const,
            error: "GHL sync not configured",
          },
        };
      }

      const ghlSync = await dispatchStaffSync({
        controlPanelDb,
        tenantDb: context.tenantDb,
        organizationId: input.organizationId,
        memberId: input.memberId,
        operation: "update",
      }).catch((err: unknown) => ({
        status: "error" as const,
        error: err instanceof Error ? err.message : String(err),
      }));

      return { ghlSync };
    }),
};

