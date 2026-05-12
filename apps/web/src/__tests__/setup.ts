import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, afterAll } from "vitest";

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
