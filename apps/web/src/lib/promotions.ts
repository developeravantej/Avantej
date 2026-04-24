import { centsToRm, rmToCents } from "@/lib/money";

export function encodePromotionValue(
	type: "percentage" | "fixed_amount",
	userInput: string,
): number {
	const value = parseFloat(userInput);
	if (isNaN(value) || value <= 0) throw new Error("Invalid value");
	if (type === "fixed_amount") return rmToCents(value);
	return Math.round(value * 100);
}

export function displayPromotionValue(
	type: "percentage" | "fixed_amount",
	storedValue: number,
): string {
	if (type === "percentage") {
		return `${(storedValue / 100).toFixed(2)}%`;
	}
	return `RM ${centsToRm(storedValue)}`;
}
