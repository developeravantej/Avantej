/**
 * Bun test preload — runs once before any test file in `apps/server`.
 *
 * Registers a global afterAll that drains every Neon pool opened via the
 * integration-setup helpers. Without this, the WebSocket-backed pools keep the
 * event loop alive and the test process hangs after the last test completes
 * (the "long no-output stretch → killed" symptom on full-suite runs).
 *
 * Wired via apps/server/bunfig.toml: [test] preload = ["./src/tests/preload.ts"].
 */
import { afterAll } from "bun:test";
import { closeAllTestPools } from "./helpers/integration-setup";

afterAll(async () => {
	await closeAllTestPools();
});
