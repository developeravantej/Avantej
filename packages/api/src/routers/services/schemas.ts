import { z } from "zod";

export const serviceTypeSchema = z.enum(["private", "semi_private", "both"]);
export const schedulingTypeSchema = z.enum(["appointment", "class_slot"]);
export const priceUnitSchema = z.enum(["session", "class", "package"]);
export const durationUnitSchema = z.enum(["seconds", "minutes", "hours"]);

export const timePresetConfigSchema = z
	.object({
		recurringDays: z.array(z.string()).min(1),
		timeSlotsPerDay: z.record(z.string(), z.array(z.string()).min(1)),
	})
	.nullable();
