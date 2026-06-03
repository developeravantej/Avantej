import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { vi, type Mock } from "vitest";
import type { AppRouterClient } from "@/utils/orpc";

type AnyFn = (...args: any[]) => any;
type DeepMock<T> = T extends AnyFn
	? Mock & T
	: T extends object
		? { [K in keyof T]: DeepMock<T[K]> }
		: T;

// Proxy-based mock: auto-handles any router/procedure path.
// - Uses vi.fn() as target so vi.mocked() works
// - Caches child namespaces by key (same ref on repeated access)
// - Handles .key(), .queryOptions(), .mutationOptions() at every leaf
function makeMockNamespace(path: string[] = []): unknown {
	const cache = new Map<string | symbol, unknown>();
	const fn = vi.fn().mockResolvedValue(undefined);
	return new Proxy(fn, {
		get(target, prop) {
			if (prop in target)
				return (target as unknown as Record<string | symbol, unknown>)[prop];
			if (prop === "key") return () => [...path, String(prop)];
			if (prop === "queryOptions") {
				return (opts?: unknown) => ({
					queryKey: [...path, "queryOptions"],
					queryFn: vi.fn().mockResolvedValue(undefined),
					...(opts && typeof opts === "object" ? opts : {}),
				});
			}
			if (prop === "mutationOptions") {
				return (opts?: unknown) => ({
					mutationFn: vi.fn().mockResolvedValue(undefined),
					...(opts && typeof opts === "object" ? opts : {}),
				});
			}
			if (!cache.has(prop)) {
				cache.set(prop, makeMockNamespace([...path, String(prop)]));
			}
			return cache.get(prop);
		},
	});
}

export const mockClient =
	makeMockNamespace() as unknown as DeepMock<AppRouterClient>;

// Build the tanstack-query utils from the SAME mockClient so that a component's
// `orpc.x.y.queryOptions()` path resolves its queryFn back to `mockClient.x.y`.
// This keeps `client.*` stubs (mockResolvedValue) and `orpc.*.queryOptions()`
// consumers in sync — otherwise queries would resolve to undefined and TanStack
// Query would throw "Query data cannot be undefined".
export const mockOrpc = createTanstackQueryUtils(mockClient as never);
