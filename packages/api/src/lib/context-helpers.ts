/**
 * Context Helpers
 *
 * Utility functions for extracting resources from the oRPC context.
 * Use these instead of accessing context properties directly.
 */

import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { Context } from "../context";

/**
 * Extract the control panel database from the oRPC context.
 *
 * The control panel DB is not a top-level context property — it lives on the
 * Hono context set up by dbMiddleware. Always call this helper instead of
 * accessing `context.controlPanelDb` (which does not exist).
 *
 * @throws ORPCError("INTERNAL_SERVER_ERROR") if the DB is unavailable.
 */
export function getControlPanelDb(
	context: Context,
): NeonDatabase<typeof controlPanelSchema> {
	const db = context.honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined
		| null;
	if (!db) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	}
	return db;
}
