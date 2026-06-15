import { ORPCError } from "@orpc/server";
import { protectedProcedure } from "@avantej-core/api";
import { requirePlatformAdmin } from "@/lib/admin-procedure";

export const superAdminProcedure = protectedProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

export function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id) {
		throw new ORPCError("UNAUTHORIZED", {
			message: "No admin user in session",
		});
	}
	return id;
}
