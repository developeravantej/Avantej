export function encodePromotionValue(
	type: "percentage" | "fixed_amount",
	userInput: string,
): number {
	const value = parseFloat(userInput);
	if (isNaN(value) || value <= 0) throw new Error("Invalid value");
	return Math.round(value * 100);
}

export function displayPromotionValue(
	type: "percentage" | "fixed_amount",
	storedValue: number,
): string {
	if (type === "percentage") {
		return `${(storedValue / 100).toFixed(2)}%`;
	}
	return `RM ${(storedValue / 100).toFixed(2)}`;
}
