import { getDescendantNodeIds } from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { ghlUserLinks } from "@avantej-core/db/schema/tenant/ghl-user-links";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { user } from "@avantej-core/db/schema/auth";
import { desc, eq, and, inArray, asc, isNull, type SQL } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";

export const membersListProcedures = {
	/**
   * List members in the organization
   *
   * Returns members with user details (name, email) from the control panel database.
   * RBAC: admins see all members; non-admins see only members within their hierarchy scope.
   * Requires user_management.read permission.
   */
  list: tenantProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        role: z.enum(["admin", "trainer", "staff", "client"]).optional(),
        status: z.enum(["active", "suspended"]).optional(),
        hierarchyScopeId: z.string().uuid().optional(),
        // Mirror customerDirectory.list: when omitted/false, soft-deleted
        // members are filtered out via `isNull(members.deletedAt)`. Set to
        // true to surface deleted rows for the "view deleted" toggle.
        includeDeleted: z.boolean().optional(),
        /**
         * scope='self'  — return only the calling member's own record.
         * scope='all'   — return all accessible members (default).
         */
        scope: z.enum(["self", "all"]).optional(),
      })
    )
    .handler(async ({ input, context }) => {
      

      

		assertOrgContextMatch(context, input);
      // Check permission
      await requirePermissionOrpc(context.tenantDb, context.member, "user_management", "read")

      // scope='self': short-circuit — return only the caller's own member record
      if (input.scope === "self") {
        const selfRow = await context.tenantDb.query.members.findFirst({
          where: eq(members.id, context.member.id),
        });
        if (!selfRow) return [];
        return [
          {
            id: selfRow.id,
            userId: selfRow.userId,
            role: selfRow.role,
            roleId: selfRow.roleId,
            hierarchyScopeId: selfRow.hierarchyScopeId,
            status: selfRow.status,
            joinedAt: selfRow.joinedAt,
            trainerTierId: selfRow.trainerTierId,
            name: "Unknown",
            email: "Unknown",
          },
        ];
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
      // Hide soft-deleted members from default list (mirrors customerDirectory).
      if (!input.includeDeleted) {
        conditions.push(isNull(members.deletedAt));
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

        // Phase 4 — customer_profiles.user_id is now nullable for dependents
        // in an account_group. Members are always primaries (the linked user
        // is the caller), so filter out any incidental null rows.
        const primaryProfileRows = profileRows.filter(
          (p: { id: string; userId: string | null }): p is { id: string; userId: string } =>
            p.userId !== null,
        );
        const profileIds = primaryProfileRows.map(
          (p: { id: string; userId: string }) => p.id,
        );
        const profileIdToUserId = new Map<string, string>(
          primaryProfileRows.map(
            (p: { id: string; userId: string }): [string, string] => [p.id, p.userId],
          ),
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
          // Wave 3a Agent 2.1 (Journey J1): expose nullable custom-role FK so the UI
          // can pre-select it in the edit dialog.
          roleId: m.roleId,
          hierarchyScopeId: m.hierarchyScopeId,
          status: m.status,
          joinedAt: m.joinedAt,
          trainerTierId: m.trainerTierId,
          // Surface soft-delete timestamp so the UI can render the "deleted"
          // badge + "Restore" action. Null when the member is live.
          deletedAt: (m.deletedAt as Date | null) ?? null,
          name: userDetails?.name ?? "Unknown",
          email: userDetails?.email ?? "Unknown",
          ghlSync,
        };
      });
    })
};
