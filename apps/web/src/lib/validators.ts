import { z } from "zod";
import { parseMoneyInput } from "./money";

export const zEmail = z
	.string()
	.trim()
	.toLowerCase()
	.email("Enter a valid email address");

export const zPhoneMY = z
	.string()
	.trim()
	.regex(
		/^(\+?60|0)[0-9]{8,10}$/,
		"Enter a valid Malaysian phone number",
	);

export const zMoneyCents = z
	.number()
	.int("Amount must be an integer (cents)")
	.nonnegative("Amount must be ≥ 0");

export const zMoneyInput = z
	.string()
	.min(1, "Required")
	.transform((raw, ctx) => {
		const result = parseMoneyInput(raw);
		if (!result.ok) {
			ctx.addIssue({ code: "custom", message: result.error });
			return z.NEVER;
		}
		return result.cents;
	});

export const zPercentageBp = z
	.number()
	.int()
	.min(0, "Must be ≥ 0%")
	.max(10_000, "Must be ≤ 100%");

export const zPercentageInput = z
	.string()
	.min(1, "Required")
	.transform((raw, ctx) => {
		const trimmed = raw.trim().replace(/%\s*$/, "");
		const value = Number.parseFloat(trimmed);
		if (Number.isNaN(value)) {
			ctx.addIssue({ code: "custom", message: "Enter a valid percentage" });
			return z.NEVER;
		}
		if (value < 0 || value > 100) {
			ctx.addIssue({
				code: "custom",
				message: "Percentage must be between 0 and 100",
			});
			return z.NEVER;
		}
		return Math.round(value * 100);
	});

export const zNonEmpty = (label: string) =>
	z.string().trim().min(1, `${label} is required`);

export const zUuid = z.string().uuid("Must be a valid ID");
