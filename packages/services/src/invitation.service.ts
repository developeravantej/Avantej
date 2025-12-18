/**
 * Invitation Service
 *
 * Handles invitation creation, validation, and management for tenant organizations.
 * Invitations are stored in tenant databases and link users to organizations with specific roles and hierarchy scopes.
 *
 * Usage:
 * ```typescript
 * import { createInvitation, getInvitationByToken, listInvitations } from "@avantej-core/services";
 *
 * const invitation = await createInvitation({
 *   email: "user@example.com",
 *   role: "trainer",
 *   hierarchyScopeId: "branch-uuid",
 *   invitedBy: "admin-user-id",
 *   tenantDb: tenantDb,
 * });
 * ```
 */

import { eq, and, or, lt } from "drizzle-orm";
import { invitations } from "@avantej-core/db/schema/tenant/invitations";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { randomBytes } from "crypto";

/**
 * Create a new invitation
 *
 * Generates a secure token and creates an invitation record in the tenant database.
 * The invitation link should be constructed by the caller with organizationId included.
 *
 * @param params - Invitation creation parameters
 * @param params.email - Email address of the invitee
 * @param params.role - Role to assign (admin, trainer, staff, client)
 * @param params.hierarchyScopeId - Hierarchy node ID for access scope
 * @param params.invitedBy - User ID of the person sending the invitation
 * @param params.tenantDb - Tenant database client
 * @returns Created invitation record
 * @throws Error if invitation already exists or validation fails
 */
export async function createInvitation(params: {
  email: string;
  role: string;
  hierarchyScopeId: string;
  invitedBy: string;
  tenantDb: NeonDatabase<typeof tenantSchema>;
}): Promise<typeof invitations.$inferSelect> {
  const { email, role, hierarchyScopeId, invitedBy, tenantDb } = params;

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error("Invalid email address");
  }

  // Validate role
  const validRoles = ["admin", "trainer", "staff", "client"];
  if (!validRoles.includes(role)) {
    throw new Error(`Invalid role. Must be one of: ${validRoles.join(", ")}`);
  }

  // Check for existing pending invitation
  const existing = await tenantDb.query.invitations.findFirst({
    where: and(
      eq(invitations.email, email.toLowerCase()),
      eq(invitations.status, "pending")
    ),
  });

  if (existing) {
    throw new Error("A pending invitation already exists for this email address");
  }

  // Generate secure token (32 bytes = 64 hex characters)
  const token = randomBytes(32).toString("hex");

  // Set expiration to 7 days from now
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Create invitation
  const [invitation] = await tenantDb
    .insert(invitations)
    .values({
      email: email.toLowerCase(),
      role,
      hierarchyScopeId,
      invitedBy,
      token,
      status: "pending",
      expiresAt,
    })
    .returning();

  return invitation;
}

/**
 * Get invitation by token
 *
 * Retrieves an invitation from the tenant database using its token.
 *
 * @param token - Invitation token
 * @param tenantDb - Tenant database client
 * @returns Invitation record or null if not found
 */
export async function getInvitationByToken(
  token: string,
  tenantDb: NeonDatabase<typeof tenantSchema>
): Promise<typeof invitations.$inferSelect | null> {
  const invitation = await tenantDb.query.invitations.findFirst({
    where: eq(invitations.token, token),
  });

  return invitation || null;
}

/**
 * Validate invitation
 *
 * Checks if an invitation is valid and can be accepted.
 *
 * @param invitation - Invitation record
 * @returns Object with isValid flag and error message if invalid
 */
export function validateInvitation(invitation: typeof invitations.$inferSelect | null): {
  isValid: boolean;
  error?: string;
} {
  if (!invitation) {
    return { isValid: false, error: "Invitation not found" };
  }

  if (invitation.status !== "pending") {
    return {
      isValid: false,
      error: `Invitation has already been ${invitation.status}`,
    };
  }

  if (new Date() > invitation.expiresAt) {
    return { isValid: false, error: "Invitation has expired" };
  }

  return { isValid: true };
}

/**
 * List invitations
 *
 * Retrieves invitations from the tenant database with optional filtering.
 *
 * @param params - Query parameters
 * @param params.tenantDb - Tenant database client
 * @param params.status - Filter by status (optional)
 * @param params.email - Filter by email (optional)
 * @param params.invitedBy - Filter by inviter (optional)
 * @returns Array of invitation records
 */
export async function listInvitations(params: {
  tenantDb: NeonDatabase<typeof tenantSchema>;
  status?: string;
  email?: string;
  invitedBy?: string;
}): Promise<Array<typeof invitations.$inferSelect>> {
  const { tenantDb, status, email, invitedBy } = params;

  const conditions = [];

  if (status) {
    conditions.push(eq(invitations.status, status));
  }

  if (email) {
    conditions.push(eq(invitations.email, email.toLowerCase()));
  }

  if (invitedBy) {
    conditions.push(eq(invitations.invitedBy, invitedBy));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const allInvitations = await tenantDb.query.invitations.findMany({
    where: whereClause,
    orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
  });

  return allInvitations;
}

/**
 * Revoke invitation
 *
 * Marks an invitation as revoked (changes status to "declined").
 *
 * @param invitationId - Invitation ID
 * @param tenantDb - Tenant database client
 * @returns Updated invitation record
 */
export async function revokeInvitation(
  invitationId: string,
  tenantDb: NeonDatabase<typeof tenantSchema>
): Promise<typeof invitations.$inferSelect> {
  const [updated] = await tenantDb
    .update(invitations)
    .set({ status: "declined" })
    .where(eq(invitations.id, invitationId))
    .returning();

  if (!updated) {
    throw new Error("Invitation not found");
  }

  return updated;
}

/**
 * Resend invitation
 *
 * Updates expiration date and returns the invitation for resending.
 * Note: The caller should send the email with the updated expiration.
 *
 * @param invitationId - Invitation ID
 * @param tenantDb - Tenant database client
 * @returns Updated invitation record
 */
export async function resendInvitation(
  invitationId: string,
  tenantDb: NeonDatabase<typeof tenantSchema>
): Promise<typeof invitations.$inferSelect> {
  // Extend expiration by 7 days from now
  const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [updated] = await tenantDb
    .update(invitations)
    .set({
      expiresAt: newExpiresAt,
      // Reset status to pending if it was expired
      status: "pending",
    })
    .where(eq(invitations.id, invitationId))
    .returning();

  if (!updated) {
    throw new Error("Invitation not found");
  }

  return updated;
}

/**
 * Mark expired invitations
 *
 * Marks invitations that have passed their expiration date as expired.
 * This is typically called by a cron job or scheduled task.
 *
 * @param tenantDb - Tenant database client
 * @returns Number of invitations marked as expired
 */
export async function markExpiredInvitations(
  tenantDb: NeonDatabase<typeof tenantSchema>
): Promise<number> {
  const now = new Date();

  const result = await tenantDb
    .update(invitations)
    .set({ status: "expired" })
    .where(
      and(
        eq(invitations.status, "pending"),
        lt(invitations.expiresAt, now)
      )
    )
    .returning();

  return result.length;
}




