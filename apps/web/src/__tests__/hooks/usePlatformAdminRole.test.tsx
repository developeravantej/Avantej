import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mockClient, mockOrpc } from "../helpers/mock-client";

vi.mock("@/utils/orpc", () => ({
	client: mockClient,
	orpc: mockOrpc,
	queryClient: {
		invalidateQueries: () => Promise.resolve(),
		setQueryData: () => {},
		getQueryData: () => undefined,
		clear: () => {},
	},
}));

import { usePlatformAdminRole } from "@/hooks/usePlatformAdminRole";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
}

function makeWrapper(qc: QueryClient) {
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={qc}>{children}</QueryClientProvider>
	);
}

describe("usePlatformAdminRole", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts with safe defaults while loading (not admin, null role)", () => {
		mockClient.admin.me.mockReturnValue(new Promise(() => {})); // never resolves
		const { result } = renderHook(() => usePlatformAdminRole(), {
			wrapper: makeWrapper(makeQueryClient()),
		});
		expect(result.current.isLoading).toBe(true);
		expect(result.current.isPlatformAdmin).toBe(false);
		expect(result.current.role).toBeNull();
	});

	it("resolves an admin shape from orpc.admin.me", async () => {
		mockClient.admin.me.mockResolvedValue({
			isPlatformAdmin: true,
			role: "super_admin",
		});
		const { result } = renderHook(() => usePlatformAdminRole(), {
			wrapper: makeWrapper(makeQueryClient()),
		});
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.isPlatformAdmin).toBe(true);
		expect(result.current.role).toBe("super_admin");
	});

	it("handles the non-admin shape (isPlatformAdmin false, role null)", async () => {
		mockClient.admin.me.mockResolvedValue({
			isPlatformAdmin: false,
			role: null,
		});
		const { result } = renderHook(() => usePlatformAdminRole(), {
			wrapper: makeWrapper(makeQueryClient()),
		});
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.isPlatformAdmin).toBe(false);
		expect(result.current.role).toBeNull();
	});

	it("caches with a 5-minute stale time: remounts within the window do NOT refetch, after it they do", async () => {
		vi.useFakeTimers();
		mockClient.admin.me.mockResolvedValue({
			isPlatformAdmin: true,
			role: "support",
		});
		const qc = makeQueryClient();
		const wrapper = makeWrapper(qc);

		// Mount 1 — fetches once
		const first = renderHook(() => usePlatformAdminRole(), { wrapper });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(first.result.current.isPlatformAdmin).toBe(true);
		expect(mockClient.admin.me).toHaveBeenCalledTimes(1);
		first.unmount();

		// Mount 2 within the 5-min window — served from cache, no refetch
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000); // 1 minute later
		});
		const second = renderHook(() => usePlatformAdminRole(), { wrapper });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(second.result.current.isPlatformAdmin).toBe(true);
		expect(second.result.current.role).toBe("support");
		expect(mockClient.admin.me).toHaveBeenCalledTimes(1);
		second.unmount();

		// Mount 3 after the stale window (>5 min since fetch) — refetches
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5 * 60_000); // total > 5 min
		});
		const third = renderHook(() => usePlatformAdminRole(), { wrapper });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(mockClient.admin.me).toHaveBeenCalledTimes(2);
		third.unmount();
	});
});
