import { z } from "zod";

// Zod schema for a single line item
export const posLineItemSchema = z.object({
	type: z.enum(["service", "package", "product", "custom"]),
	refId: z.string().uuid().optional(),
	description: z.string().min(1),
	quantity: z.number().int().min(1),
	unitPriceCents: z.number().int().min(0),
});
