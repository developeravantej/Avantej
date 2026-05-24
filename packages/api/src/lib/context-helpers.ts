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

export type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

/**
 * Extract the control panel database from the oRPC context, or null if unavailable.
 *
 * Use for optional sync paths (GHL, organization_branches) where missing CP DB
 * should skip silently rather than fail the request.
 */
export function tryGetControlPanelDb(context: Context): ControlPanelDb | null {
	const db = context.honoContext?.get("controlPanelDb") as
		| ControlPanelDb
		| undefined
		| null;
	return db ?? null;
}

/**
 * Extract the control panel database value from the oRPC context.
 *
 * The control panel DB is not a top-level context property — it lives on the
 * Hono context set up by dbMiddleware. Always call this helper instead of
 * accessing `context.controlPanelDb` (which does not exist).
 *
 * @throws ORPCError("INTERNAL_SERVER_ERROR") if the DB is unavailable.
 */
export function getControlPanelDb(
	context: Context,
): ControlPanelDb {
	const db = tryGetControlPanelDb(context);
	if (!db) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	}
	return db;
}
