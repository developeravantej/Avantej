/**
 * Shared polling helper for E2E DB assertions.
 * Polls a Drizzle query until it returns a truthy result or times out.
 */

export async function waitForDb<T>(
	fn: () => Promise<T | undefined | null>,
	opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
	const { timeoutMs = 6000, intervalMs = 300 } = opts;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = await fn();
		if (result) return result;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	const last = await fn();
	if (last) return last;
	throw new Error("waitForDb timed out — row not found within expected window");
}
