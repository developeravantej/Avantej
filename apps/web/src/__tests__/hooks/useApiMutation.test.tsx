import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invalidateQueriesSpy, toastSuccess, toastError } = vi.hoisted(() => ({
	invalidateQueriesSpy: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@/utils/orpc", () => ({
	queryClient: { invalidateQueries: invalidateQueriesSpy },
}));

vi.mock("sonner", () => ({
	toast: { success: toastSuccess, error: toastError },
}));

import { useApiMutation } from "@/hooks/useApiMutation";

function wrapper({ children }: { children: React.ReactNode }) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useApiMutation", () => {
	beforeEach(() => {
		invalidateQueriesSpy.mockReset();
		toastSuccess.mockReset();
		toastError.mockReset();
	});

	it("shows success toast when successMessage provided", async () => {
		const { result } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async (n: number) => n * 2,
					successMessage: "Done",
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(5);
		});

		expect(toastSuccess).toHaveBeenCalledWith("Done");
	});

	it("suppresses success toast when successMessage is false", async () => {
		const { result } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => 1,
					successMessage: false,
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(undefined as never);
		});

		expect(toastSuccess).not.toHaveBeenCalled();
	});

	it("shows error toast with err.message when errorMessage is undefined", async () => {
		const { result } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => {
						throw new Error("Boom");
					},
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(undefined as never).catch(() => {});
		});

		await waitFor(() => expect(toastError).toHaveBeenCalledWith("Boom"));
	});

	it("suppresses error toast when errorMessage is false", async () => {
		const { result } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => {
						throw new Error("Boom");
					},
					errorMessage: false,
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(undefined as never).catch(() => {});
		});

		expect(toastError).not.toHaveBeenCalled();
	});

	it("invalidates every QueryKey when invalidate is provided", async () => {
		const { result } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => "ok",
					successMessage: false,
					invalidate: [["sales", "list"], ["payments"]],
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(undefined as never);
		});

		expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2);
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({
			queryKey: ["sales", "list"],
		});
		expect(invalidateQueriesSpy).toHaveBeenCalledWith({
			queryKey: ["payments"],
		});
	});

	it("does NOT call invalidateQueries when invalidate is undefined", async () => {
		const { result } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => "ok",
					successMessage: false,
				}),
			{ wrapper },
		);

		await act(async () => {
			await result.current.mutateAsync(undefined as never);
		});

		expect(invalidateQueriesSpy).not.toHaveBeenCalled();
	});

	it("still fires user-provided onSuccess and onError", async () => {
		const onSuccess = vi.fn();
		const onError = vi.fn();

		const { result: successResult } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => 42,
					successMessage: false,
					onSuccess,
				}),
			{ wrapper },
		);
		await act(async () => {
			await successResult.current.mutateAsync(undefined as never);
		});
		expect(onSuccess).toHaveBeenCalled();

		const { result: errResult } = renderHook(
			() =>
				useApiMutation({
					mutationFn: async () => {
						throw new Error("x");
					},
					errorMessage: false,
					onError,
				}),
			{ wrapper },
		);
		await act(async () => {
			await errResult.current.mutateAsync(undefined as never).catch(() => {});
		});
		await waitFor(() => expect(onError).toHaveBeenCalled());
	});
});
