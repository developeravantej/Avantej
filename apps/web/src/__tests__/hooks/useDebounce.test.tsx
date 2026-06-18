import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "@/hooks/useDebounce";

describe("useDebounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns the initial value immediately", () => {
		const { result } = renderHook(() => useDebounce("a", 300));
		expect(result.current).toBe("a");
	});

	it("only updates after the delay elapses", () => {
		const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
			initialProps: { v: "a" },
		});
		rerender({ v: "b" });
		expect(result.current).toBe("a");

		act(() => {
			vi.advanceTimersByTime(299);
		});
		expect(result.current).toBe("a");

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(result.current).toBe("b");
	});

	it("resets the timer on rapid changes so only the last value wins", () => {
		const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), {
			initialProps: { v: "a" },
		});
		rerender({ v: "b" });
		act(() => {
			vi.advanceTimersByTime(200);
		});
		rerender({ v: "c" });
		act(() => {
			vi.advanceTimersByTime(200);
		});
		// 200ms since the last change (< 300) — still the original value
		expect(result.current).toBe("a");

		act(() => {
			vi.advanceTimersByTime(100);
		});
		expect(result.current).toBe("c");
	});
});
