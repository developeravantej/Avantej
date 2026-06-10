import { z } from "zod";

export const dayOfWeekSchema = z.enum([
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
]);

export const kindSchema = z
	.enum(["available", "blocked", "timeoff"])
	.default("available");
