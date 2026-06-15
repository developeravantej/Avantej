import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";

// jsdom does not implement ResizeObserver; shim for components using it (e.g. boneyard-js)
if (typeof global.ResizeObserver === "undefined") {
	global.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

// jsdom does not implement window.matchMedia; shim for components that call it (e.g. boneyard-js)
Object.defineProperty(window, "matchMedia", {
	writable: true,
	configurable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	}),
});

afterEach(() => {
	cleanup();
});

// Suppress console.error for expected React warnings in tests
const originalError = console.error.bind(console.error);
beforeAll(() => {
	console.error = (...args: unknown[]) => {
		if (typeof args[0] === "string" && args[0].includes("Warning:")) return;
		originalError(...args);
	};
});

afterAll(() => {
	console.error = originalError;
});
