import { protectedProcedure } from "@avantej-core/api";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { requirePermission } from "@avantej-core/services";
import { user } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";
import {
	isFullOnboardingProfile,
	onboardingUserColumns,
} from "./onboarding-fields";

const UNCLAIMED_EMAIL_DOMAIN = "avantej.placeholder";

export const createUnclaimedProcedures = {
	/**
	 * Quick Add — staff creates a customer profile without the customer having an
	 * account yet. Creates a placeholder control-panel user so the profile appears
	 * in the directory immediately with an "Unclaimed" badge. Staff can later call
	 * sendClaimLink to let the customer take ownership.
	 *
	 * "Full details" mode: when the whole onboarding profile is supplied, the
	 * customer is created registration-complete (user.role "user"); otherwise they
	 * stay incomplete and can self-complete later via a sign-in link + the
	 * /register wizard.
	 */
	createUnclaimed: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				firstName: z.string().min(1),
				lastName: z.string().min(1),
				phone: z.string().min(1),
				hierarchyScopeId: z.string().uuid(),
				dateOfBirth: z.string().optional(),
				notes: z.string().optional(),
				// CU-007: optional real email from Quick Add form; if omitted a placeholder is generated
				email: z.string().email().optional(),
				// Optional full onboarding profile ("Full details" mode).
				idPassportNo: z.string().optional(),
				addressType: z.enum(["home", "work"]).optional(),
				streetAddress: z.string().optional(),
				city: z.string().optional(),
				state: z.string().optional(),
				country: z.string().optional(),
				postalCode: z.string().optional(),
				emergencyContactName: z.string().optional(),
				emergencyContactRelationship: z.string().optional(),
				emergencyContactPhone: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb || !context.honoContext) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database or Hono context not available.",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"user_management",
					"create",
				);
			} catch (err) {
				throw new ORPCError("FORBIDDEN", {
					message: err instanceof Error ? err.message : "Permission denied",
				});
			}

			// Validate hierarchy scope access (admins bypass)
			if (context.member.role !== "admin") {
				const accessibleNodeIds = context.accessibleNodeIds ?? [];
				if (!accessibleNodeIds.includes(input.hierarchyScopeId)) {
					throw new ORPCError("FORBIDDEN", {
						message: "Hierarchy scope is outside your accessible nodes",
					});
				}
			}

			const cpDb = getControlPanelDb(context);

			// CU-006: Phone dedup — if an active profile already uses this phone,
			// return it instead of creating a duplicate (idempotent double-submit
			// guard for Quick Add).
			const existingByPhone =
				await context.tenantDb.query.customerProfiles.findFirst({
					where: and(
						eq(customerProfiles.phone, input.phone.trim()),
						eq(customerProfiles.isDeleted, false),
					),
				});
			if (existingByPhone) {
				// In "Full details" mode the staff captured a whole onboarding profile.
				// If the matched customer is still registration-incomplete, APPLY that
				// profile to them (complete their registration) rather than silently
				// dropping it — the dedup guard must not discard captured data.
				if (isFullOnboardingProfile(input) && existingByPhone.userId) {
					const existingUser = await cpDb.query.user.findFirst({
						where: eq(user.id, existingByPhone.userId),
					});
					if (existingUser && !existingUser.role) {
						await cpDb
							.update(user)
							.set({ ...onboardingUserColumns(input), updatedAt: new Date() })
							.where(eq(user.id, existingByPhone.userId));
					}
				}
				const existingMember = existingByPhone.userId
					? await context.tenantDb.query.members.findFirst({
							where: eq(members.userId, existingByPhone.userId),
						})
					: undefined;
				return {
					memberId: existingMember?.id ?? "",
					profileId: existingByPhone.id,
					userId: existingByPhone.userId ?? "",
				};
			}

			// CU-007: Email dedup — if a real email is supplied, ensure it is not
			// already taken by another control-panel user before we proceed.
			if (input.email) {
				const emailConflict = await cpDb.query.user.findFirst({
					where: eq(user.email, input.email),
				});
				if (emailConflict) {
					throw new ORPCError("CONFLICT", {
						message: "A user with this email address already exists",
					});
				}
			}

			const resolvedEmail = input.email
				? input.email
				: `unclaimed-${crypto.randomUUID()}@${UNCLAIMED_EMAIL_DOMAIN}`;
			const userId = crypto.randomUUID();
			const now = new Date();

			// Step 1 — Insert placeholder/real user into control panel (no password /
			// account row). onboardingUserColumns writes the onboarding profile fields
			// (and role "user" when the full profile is present).
			await cpDb.insert(user).values({
				id: userId,
				name: `${input.firstName} ${input.lastName}`.trim(),
				firstName: input.firstName,
				lastName: input.lastName,
				email: resolvedEmail,
				emailVerified: false,
				phone: input.phone ?? null,
				...onboardingUserColumns(input),
				createdAt: now,
				updatedAt: now,
			});

			// Step 2 — Dual-write: organizationMembers (CP) + members (tenant)
			// CU-005: If this or step 3 fails, roll back the CP user to avoid orphans.
			const membershipService = new MembershipService(cpDb);
			let tenantMemberId: string | undefined;
			try {
				await membershipService.createMember({
					userId,
					organizationId: input.organizationId,
					role: "client",
					hierarchyScopeId: input.hierarchyScopeId,
					tenantDb: context.tenantDb,
				});
				const createdMember = await context.tenantDb.query.members.findFirst({
					where: eq(members.userId, userId),
				});
				tenantMemberId = createdMember?.id;
			} catch (memberErr) {
				try {
					await cpDb.delete(user).where(eq(user.id, userId));
				} catch {
					console.error(
						"[createUnclaimed] CP user cleanup failed after membershipService error",
						userId,
					);
				}
				throw memberErr;
			}

			// Step 3 — Create customer profile flagged as unclaimed
			let profile: { id: string } | undefined;
			try {
				const [inserted] = await context.tenantDb
					.insert(customerProfiles)
					.values({
						userId,
						phone: input.phone,
						isUnclaimed: true,
						dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
						notes: input.notes ?? null,
					})
					.returning({ id: customerProfiles.id });
				profile = inserted;
			} catch (profileErr) {
				if (tenantMemberId) {
					try {
						await context.tenantDb
							.delete(members)
							.where(eq(members.id, tenantMemberId));
					} catch {
						console.error(
							"[createUnclaimed] tenant member cleanup failed after profile insert error",
							tenantMemberId,
						);
					}
				}
				try {
					await cpDb.delete(user).where(eq(user.id, userId));
				} catch {
					console.error(
						"[createUnclaimed] CP user cleanup failed after profile insert error",
						userId,
					);
				}
				throw profileErr;
			}

			if (!profile) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create customer profile",
				});
			}

			const newMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.userId, userId),
			});

			// Best-effort outbound GHL contact sync. fireCustomerSync never throws
			// (GHL failures are swallowed + recorded on ghl_contact_links).
			await fireCustomerSync({
				honoContext: context.honoContext,
				tenantDb: context.tenantDb,
				organizationId: input.organizationId,
				userId,
				customerProfile: {
					id: profile.id,
					userId,
					phone: input.phone ?? null,
					dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
					gender: null,
					address: null,
					emergencyContactName: null,
					emergencyContactPhone: null,
					medicalNotes: null,
					fitnessGoals: null,
					creditPoints: 0,
					notes: input.notes ?? null,
					isDeleted: false,
					deletedAt: null,
					deletedSource: null,
				},
				operation: "create",
			});

			return {
				memberId: newMember?.id ?? "",
				profileId: profile.id,
				userId,
			};
		}),
};
