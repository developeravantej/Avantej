import { z } from "zod";

export const appointmentTypeSchema = z.enum(["private", "semi-private"]);
export const statusSchema = z.enum([
	"pending",
	"confirmed",
	"completed",
	"cancelled",
	"no-show",
]);
