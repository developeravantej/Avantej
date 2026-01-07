import { protectedProcedure, publicProcedure } from "../index";
import type { RouterClient } from "@orpc/server";
import { z } from "zod";
import { hierarchyRouter } from "./hierarchy";
import { invitationRouter } from "./invitations";
import { memberRouter } from "./members";

// Base router without auth (auth router is added by server with server-specific dependencies)
export const baseRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	hierarchy: hierarchyRouter,
	invitations: invitationRouter,
	members: memberRouter,
};

// Auth router type definition for client type inference
// The actual implementation is in apps/server/src/routers/auth.ts
// This dummy implementation is only for type generation
const authRouterType = {
	login: publicProcedure
		.input(z.object({ email: z.string(), password: z.string() }))
		.handler((): {
			accessToken: string;
			refreshToken: string;
			user: { id: string; email: string; name: string; emailVerified: boolean; createdAt: Date };
			organizations: Array<{ id: string; name: string; slug: string; role: string }>;
		} => {
			throw new Error("Not implemented - this is only for type inference");
		}),
	userContext: protectedProcedure.handler((): {
		user: { id: string; email: string; name: string; emailVerified: boolean };
		organizations: Array<{
			id: string;
			name: string;
			slug: string;
			role: string;
			hierarchy: {
				nodes: Array<{
					id: string;
					name: string;
					type: string;
					depth: number;
					parentId: string | null;
					createdAt: Date | null;
					updatedAt: Date | null;
				}>;
				member: {
					role: string;
					hierarchyScopeId: string;
					hierarchyScopeName: string;
					accessibleNodeIds: string[];
				} | null;
			};
		}>;
		currentOrganizationId: string | null;
	} => {
		throw new Error("Not implemented - this is only for type inference");
	}),
	verifyEmail: publicProcedure
		.input(z.object({ token: z.string() }))
		.handler((): { message: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Server-specific invitation procedures type definition for client type inference
// The actual implementation is in apps/server/src/routers/invitations.ts
const serverInvitationRouterType = {
	sendEmail: protectedProcedure
		.input(
			z.object({
				invitation: z.object({
					token: z.string(),
					email: z.string().email(),
					role: z.string(),
				}),
				organizationId: z.string().uuid(),
				organizationName: z.string().optional(),
				inviterName: z.string().optional(),
			})
		)
		.handler((): { success: boolean; message: string } => {
			throw new Error("Not implemented - this is only for type inference");
		}),
};

// Full appRouter with auth and server-specific procedures for type inference on the client
export const appRouter = {
	...baseRouter,
	auth: authRouterType,
	// Extend invitations router with server-specific sendEmail procedure type
	invitations: {
		...invitationRouter,
		...serverInvitationRouterType,
	},
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
