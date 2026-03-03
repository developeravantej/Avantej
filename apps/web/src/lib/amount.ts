export function rmToCents(rm: string | number): number {
	const value = typeof rm === "string" ? parseFloat(rm) : rm;
	if (isNaN(value) || value < 0) throw new Error("Invalid amount");
	return Math.round(value * 100);
}

export function centsToRm(cents: number): string {
	return (cents / 100).toFixed(2);
}
