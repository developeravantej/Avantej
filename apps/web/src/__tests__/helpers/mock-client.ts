import { vi } from "vitest";
import type { AppRouterClient } from "@/utils/orpc";

// Proxy-based mock: auto-handles any router/procedure path.
// - Uses vi.fn() as target so vi.mocked() works
// - Caches child namespaces by key (same ref on repeated access)
// - Handles .key(), .queryOptions(), .mutationOptions() at every leaf
function makeMockNamespace(path: string[] = []): unknown {
	const cache = new Map<string | symbol, unknown>();
	const fn = vi.fn().mockResolvedValue(undefined);
	return new Proxy(fn, {
		get(target, prop) {
			if (prop in target) return (target as Record<string | symbol, unknown>)[prop];
			if (prop === "key") return () => [...path, String(prop)];
			if (prop === "queryOptions") {
				return (opts?: unknown) => ({
					queryKey: [...path, "queryOptions"],
					queryFn: vi.fn().mockResolvedValue(undefined),
					...((opts && typeof opts === "object") ? opts : {}),
				});
			}
			if (prop === "mutationOptions") {
				return (opts?: unknown) => ({
					mutationFn: vi.fn().mockResolvedValue(undefined),
					...((opts && typeof opts === "object") ? opts : {}),
				});
			}
			if (!cache.has(prop)) {
				cache.set(prop, makeMockNamespace([...path, String(prop)]));
			}
			return cache.get(prop);
		},
	});
}

export const mockClient = makeMockNamespace() as AppRouterClient;
export const mockOrpc = makeMockNamespace();
