import { protectedProcedure, publicProcedure } from "../index";
import type { RouterClient } from "@orpc/server";
import { hierarchyRouter } from "./hierarchy";
import { invitationRouter } from "./invitations";
import { memberRouter } from "./members";

export const appRouter = {
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
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
