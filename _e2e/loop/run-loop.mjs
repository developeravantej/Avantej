#!/usr/bin/env node
// Orchestrator driver for the e2e-loop. Pops pending routes, runs the explorer
// per route as a child process (args array → no shell path mangling), handles
// auth-expiry / server-down requeue, heartbeats the deadline, checkpoints to
// disk. All state on disk; prints a compact progress line per route.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = "_e2e/loop";
const LS = "C:/Users/user/.claude/skills/e2e-loop/scripts/loop-state.mjs";
const cfg = JSON.parse(readFileSync(resolve(ROOT, "config.json"), "utf8"));
const PROGRESS = resolve(ROOT, "progress.log");
const log = (m) => {
	const line = `[${new Date().toISOString()}] ${m}`;
	console.log(line);
	appendFileSync(PROGRESS, line + "\n");
};

const ls = (...args) =>
	spawnSync("node", [LS, ...args], { encoding: "utf8" }).stdout?.trim() ?? "";
// Probe via plain localhost (Node DNS can't resolve the .localhost tenant subdomain;
// curl/chromium can). A 200 here means the dev server process is alive.
const PROBE = "http://localhost:3021/";
const serverUp = () =>
	spawnSync(
		"curl",
		["-s", "-o", "NUL", "-w", "%{http_code}", "--max-time", "5", PROBE],
		{ encoding: "utf8" },
	).stdout?.trim() === "200";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

log(`=== run-loop start (${cfg.dataMode}, base ${cfg.baseURL}) ===`);
let done = 0,
	withFindings = 0,
	totalFindings = 0,
	errors = 0;

while (true) {
	const beat = ls("heartbeat");
	if (beat === "EXPIRED") {
		log("DEADLINE reached — stopping loop.");
		break;
	}

	const nextRaw = ls("next");
	if (!nextRaw) {
		log("queue drained.");
		break;
	}
	const item = JSON.parse(nextRaw);

	// server health gate
	let waits = 0;
	while (!serverUp() && waits < 24) {
		log(`server not responding on ${PROBE} — waiting…`);
		await sleep(5000);
		waits++;
	}

	const res = spawnSync("node", [resolve(ROOT, "explorer.mjs"), item.path], {
		encoding: "utf8",
		timeout: (cfg.caps.perPageTimeoutSec + 20) * 1000,
	});
	let out = {};
	try {
		out = JSON.parse((res.stdout || "").trim().split("\n").pop());
	} catch {
		out = {};
	}

	if (out.authExpired) {
		log(`AUTH EXPIRED at ${item.path} — requeue + STOP (re-seed auth needed).`);
		ls("requeue", item.id);
		break;
	}
	if (out.serverDown) {
		log(`SERVER DOWN at ${item.path} — requeue, wait for warden restart.`);
		ls("requeue", item.id);
		await sleep(10000);
		continue;
	}

	if (res.status !== 0 || res.error) {
		errors++;
		log(
			`ERROR ${item.path}: ${res.error?.message || "exit " + res.status} ${(res.stderr || "").slice(0, 200)}`,
		);
		ls("mark", item.id, "done");
		ls("ledger", item.path, "error", 0);
		done++;
		continue;
	}

	const f = out.findings ?? 0;
	if (f > 0) {
		withFindings++;
		totalFindings += f;
	}
	ls("mark", item.id, "done");
	ls("ledger", item.path, f > 0 ? "findings" : "clean", f);
	done++;
	log(
		`✓ ${item.path} — ${f} finding(s), ${out.actions ?? 0} actions  [${done} done]`,
	);
}

log(
	`=== run-loop END: ${done} routes, ${withFindings} with findings, ${totalFindings} total findings, ${errors} errors ===`,
);
writeFileSync(
	resolve(ROOT, "loop-done.marker"),
	JSON.stringify(
		{ done, withFindings, totalFindings, errors, at: new Date().toISOString() },
		null,
		2,
	),
);
