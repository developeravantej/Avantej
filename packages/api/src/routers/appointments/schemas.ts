import { z } from "zod";

export const appointmentTypeSchema = z.enum(["private", "semi-private"]);

/** Status of a proposed (not-yet-created) schedule slot. See schedule-proposal.service.ts. */
export const proposedSlotStatusSchema = z.enum([
	"ok",
	"conflict",
	"outside_availability",
	"after_expiry",
]);
export const statusSchema = z.enum([
	"pending",
	"confirmed",
	"completed",
	"cancelled",
	"no-show",
	"rescheduled",
	"disputed",
]);
