/**
 * Customer Profiles Router
 *
 * API endpoints for customer profile (get, upsert). Scoped to session user for own profile.
 */

import { getCustomerProfile, upsertCustomerProfile } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

export const customerProfilesRouter = {
  get: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
      })
    )
    .handler(async ({ context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const profile = await getCustomerProfile(context.tenantDb, userId);
      return profile;
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        organizationId: z.string().uuid(),
        phone: z.string().nullable().optional(),
        dateOfBirth: z.string().datetime().nullable().optional(),
        gender: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        emergencyContactName: z.string().nullable().optional(),
        emergencyContactPhone: z.string().nullable().optional(),
        medicalNotes: z.string().nullable().optional(),
        fitnessGoals: z.array(z.string()).nullable().optional(),
        creditPoints: z.number().int().min(0).optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .handler(async ({ input, context }) => {
      if (!context.tenantDb) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message:
            "Tenant database not available. Ensure organization context is set.",
        });
      }

      const userId = context.session?.user?.id;
      if (!userId) {
        throw new ORPCError("UNAUTHORIZED", {
          message: "User session required",
        });
      }

      const updated = await upsertCustomerProfile(context.tenantDb, {
        userId,
        phone: input.phone ?? null,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        gender: input.gender ?? null,
        address: input.address ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        medicalNotes: input.medicalNotes ?? null,
        fitnessGoals: input.fitnessGoals ?? null,
        creditPoints: input.creditPoints,
        notes: input.notes ?? null,
      });
      return updated;
    }),
};
