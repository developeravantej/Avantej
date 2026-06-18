#!/usr/bin/env node
// Generic per-route explorer for the e2e-loop. Deterministic DOM-driven crawl of
// ONE route under a pre-seeded auth state. Captures evidence and emits a finding
// JSON. REPORT ONLY — never submits forms, never clicks destructive controls.
//
//   node _e2e/loop/explorer.mjs "/dashboard/expenses/view"
//
// Reads _e2e/loop/config.json for baseURL, authStatePath, caps, destructiveLabels.
import { chromium } from "@playwright/test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	rmSync,
} from "node:fs";
import { resolve } from "node:path";

const ROOT = "_e2e/loop";
const cfg = JSON.parse(readFileSync(resolve(ROOT, "config.json"), "utf8"));
const path = process.argv[2];
if (!path) {
	console.error("usage: explorer.mjs <path>");
	process.exit(1);
}

const slug = (p) =>
	p
		.replace(/^\/+|\/+$/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.toLowerCase() || "root";
const id = slug(path);
const module = path.split("/").filter(Boolean)[1] || "dashboard";
const evDir = resolve(ROOT, "evidence", id);
mkdirSync(evDir, { recursive: true });

const DESTRUCTIVE = (cfg.destructiveLabels || []).map((s) => s.toLowerCase());
const isDestructive = (label) => {
	const t = (label || "").trim().toLowerCase();
	if (!t) return false;
	return DESTRUCTIVE.some((d) => t.includes(d));
};
const MAX_ACTIONS = cfg.caps?.maxActionsPerPage ?? 30;
const SPINNER_MS = cfg.spinnerTimeoutMs ?? 15000;
const PAGE_TIMEOUT = (cfg.caps?.perPageTimeoutSec ?? 120) * 1000;
const BASE = cfg.baseURL;
const AUTH = resolve(cfg.authStatePath);

const findings = [];
const consoleLines = [];
const networkLines = [];
const addFinding = (f) =>
	findings.push({
		id: `${id}__${f.category}`,
		route: path,
		module,
		...f,
		evidence: {
			screenshot: `_e2e/loop/evidence/${id}/shot.png`,
			console: `_e2e/loop/evidence/${id}/console.txt`,
			network: `_e2e/loop/evidence/${id}/network.txt`,
			trace: `_e2e/loop/evidence/${id}/trace.zip`,
		},
	});

const hardDeadline = setTimeout(() => {
	writeFileSync(
		resolve(ROOT, "findings", `${id}.json`),
		JSON.stringify(
			{
				route: path,
				module,
				timedOut: true,
				findings: [
					{
						id: `${id}__slow`,
						route: path,
						module,
						category: "slow",
						severity: "med",
						title: `Route exceeded per-page budget (${PAGE_TIMEOUT / 1000}s)`,
						observed: "Explorer abandoned the page after the hard timeout.",
						evidence: {},
					},
				],
			},
			null,
			2,
		),
	);
	process.exit(0);
}, PAGE_TIMEOUT + 5000);

if (!existsSync(AUTH)) {
	console.error(`auth state missing: ${AUTH}`);
	process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({
	baseURL: BASE,
	storageState: AUTH,
	viewport: { width: 1440, height: 900 },
});
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();

page.on("console", (m) => {
	if (["error", "warning"].includes(m.type()))
		consoleLines.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => consoleLines.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
	const s = r.status();
	if (s >= 400) networkLines.push(`${s} ${r.request().method()} ${r.url()}`);
});
page.on("requestfailed", (r) =>
	networkLines.push(
		`FAILED ${r.method()} ${r.url()} (${r.failure()?.errorText})`,
	),
);

const result = {
	route: path,
	module,
	interactablesFound: {},
	actionsTaken: 0,
	findings,
	newLinks: [],
	authExpired: false,
	serverDown: false,
};

try {
	const resp = await page.goto(path, {
		waitUntil: "domcontentloaded",
		timeout: PAGE_TIMEOUT,
	});
	// auth check
	if (page.url().includes("/login")) {
		result.authExpired = true;
		throw new Error("__bail_auth");
	}
	if (resp && resp.status() >= 500) {
		result.serverDown = true;
		throw new Error("__bail_server");
	}

	await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
	// Re-check auth AFTER client-side redirect settles (SPA auth gate redirects post-hydration,
	// so the URL is still the target at domcontentloaded). A login form = expired session.
	if (
		page.url().includes("/login") ||
		(await page
			.locator('input[type="password"]')
			.count()
			.catch(() => 0)) > 0
	) {
		result.authExpired = true;
		throw new Error("__bail_auth");
	}

	// infinite spinner detection
	const spinnerSel =
		'[role="progressbar"], .animate-spin, [data-loading="true"], .loading-spinner';
	const spinnerStart = Date.now();
	let spinnerStuck = false;
	while (
		await page
			.locator(spinnerSel)
			.first()
			.isVisible()
			.catch(() => false)
	) {
		if (Date.now() - spinnerStart > SPINNER_MS) {
			spinnerStuck = true;
			break;
		}
		await page.waitForTimeout(500);
	}
	if (spinnerStuck)
		addFinding({
			category: "infinite-spinner",
			severity: "high",
			title: "Loading spinner never resolves",
			observed: `Spinner still visible after ${SPINNER_MS}ms`,
		});

	// 404 / error boundary
	const bodyText =
		(await page
			.locator("body")
			.innerText()
			.catch(() => "")) || "";
	if (
		/not found|404|something went wrong|application error|error boundary/i.test(
			bodyText.slice(0, 2000),
		) &&
		bodyText.length < 1500
	) {
		addFinding({
			category: "404-or-error-boundary",
			severity: "high",
			title: "Route renders an error/not-found state",
			observed: bodyText.slice(0, 300),
		});
	}

	// broken render tokens
	const badTokens = await page.evaluate(() => {
		const out = [];
		const walker = document.createTreeWalker(
			document.body,
			NodeFilter.SHOW_TEXT,
		);
		let n;
		while ((n = walker.nextNode())) {
			const t = n.textContent?.trim() || "";
			if (
				/\bNaN\b|\bundefined\b|\[object Object\]|\$NaN|RM\s*NaN/.test(t) &&
				t.length < 120
			)
				out.push(t);
		}
		return [...new Set(out)].slice(0, 10);
	});
	if (badTokens.length)
		addFinding({
			category: "broken-render",
			severity: "high",
			title: "Placeholder/garbage values rendered to the user",
			observed: badTokens.join(" | "),
		});

	// broken images
	const brokenImgs = await page.evaluate(() =>
		[...document.images]
			.filter((i) => i.complete && i.naturalWidth === 0)
			.map((i) => i.src)
			.slice(0, 10),
	);
	if (brokenImgs.length)
		addFinding({
			category: "broken-image",
			severity: "low",
			title: `${brokenImgs.length} broken image(s)`,
			observed: brokenImgs.join(" | "),
		});

	// inventory
	const inv = {};
	for (const [k, role] of [
		["buttons", "button"],
		["links", "link"],
		["textboxes", "textbox"],
		["comboboxes", "combobox"],
		["checkboxes", "checkbox"],
		["tabs", "tab"],
	]) {
		inv[k] = await page
			.getByRole(role)
			.count()
			.catch(() => 0);
	}
	result.interactablesFound = inv;

	// discover in-scope links
	const links = await page.evaluate(() =>
		[...document.querySelectorAll("a[href]")]
			.map((a) => a.getAttribute("href"))
			.filter(Boolean),
	);
	const allow = cfg.allowPrefixes || [];
	const deny = cfg.denyPatterns || [];
	result.newLinks = [...new Set(links)]
		.filter((h) => h.startsWith("/"))
		.filter((h) => allow.some((p) => h.startsWith(p)))
		.filter(
			(h) =>
				!deny.some((d) =>
					h.toLowerCase().includes(d.replace(/^\//, "").toLowerCase()),
				),
		)
		.slice(0, 20);

	// drive safe controls: tabs first, then non-destructive buttons that open/close UI
	let actions = 0;
	const deadControls = [];
	// tabs
	const tabs = await page
		.getByRole("tab")
		.all()
		.catch(() => []);
	for (const tab of tabs) {
		if (actions >= MAX_ACTIONS) break;
		const label = (await tab.innerText().catch(() => "")) || "";
		if (isDestructive(label)) continue;
		const before = await page
			.locator("main, [role='main'], body")
			.innerText()
			.catch(() => "");
		await tab.click({ timeout: 3000 }).catch(() => {});
		await page.waitForTimeout(400);
		actions++;
		const after = await page
			.locator("main, [role='main'], body")
			.innerText()
			.catch(() => "");
		if (before === after) deadControls.push(`tab:"${label.slice(0, 30)}"`);
	}
	// buttons that likely open menus/dialogs (skip destructive + submit)
	const buttons = await page
		.getByRole("button")
		.all()
		.catch(() => []);
	for (const btn of buttons) {
		if (actions >= MAX_ACTIONS) break;
		const label =
			(await btn.innerText().catch(() => "")) ||
			(await btn.getAttribute("aria-label").catch(() => "")) ||
			"";
		const type = await btn.getAttribute("type").catch(() => null);
		const disabled = await btn.isDisabled().catch(() => false);
		if (disabled || isDestructive(label) || type === "submit") continue;
		const consoleBefore = consoleLines.length;
		const dialogsBefore = await page
			.locator('[role="dialog"], [role="menu"]')
			.count()
			.catch(() => 0);
		await btn.click({ timeout: 2500 }).catch(() => {});
		await page.waitForTimeout(350);
		actions++;
		const dialogsAfter = await page
			.locator('[role="dialog"], [role="menu"]')
			.count()
			.catch(() => 0);
		const newConsole = consoleLines.length > consoleBefore;
		// close anything that opened (Escape) — never persist
		if (dialogsAfter > dialogsBefore) {
			await page.keyboard.press("Escape").catch(() => {});
			await page.waitForTimeout(150);
		}
		if (
			!newConsole &&
			dialogsAfter === dialogsBefore &&
			label &&
			!isDestructive(label)
		) {
			// potential dead control — only flag icon/labelled buttons, not layout noise
			if (label.trim().length > 1 && label.trim().length < 30)
				deadControls.push(`button:"${label.trim().slice(0, 30)}"`);
		}
	}
	result.actionsTaken = actions;
	if (deadControls.length >= 3)
		addFinding({
			category: "dead-control",
			severity: "low",
			title: `${deadControls.length} control(s) produced no visible effect`,
			observed: deadControls.slice(0, 12).join(", "),
			recommendation:
				"Verify each is genuinely wired (some may need preconditions). NOT APPLIED.",
		});

	// a11y: icon-only buttons without label
	const unlabeled = await page.evaluate(
		() =>
			[...document.querySelectorAll("button")].filter(
				(b) =>
					!b.textContent?.trim() &&
					!b.getAttribute("aria-label") &&
					!b.getAttribute("title"),
			).length,
	);
	if (unlabeled > 0)
		addFinding({
			category: "a11y-blocker",
			severity: "low",
			title: `${unlabeled} icon-only button(s) without accessible label`,
			observed: `${unlabeled} <button> elements have no text, aria-label, or title`,
		});

	// collect console/network findings
	const errs = consoleLines.filter(
		(l) => l.startsWith("[error]") || l.startsWith("[pageerror]"),
	);
	if (errs.length)
		addFinding({
			category: errs.some((e) => e.includes("pageerror"))
				? "unhandled-exception"
				: "console-error",
			severity: "high",
			title: `${errs.length} console error(s)/exception(s)`,
			observed: errs.slice(0, 5).join(" || "),
		});
	const fivexx = networkLines.filter((l) => /^5\d\d /.test(l));
	const fourxx = networkLines.filter(
		(l) => /^4\d\d /.test(l) && !/ 401 | 403 /.test(` ${l} `),
	);
	if (fivexx.length)
		addFinding({
			category: "network-5xx",
			severity: "blocker",
			title: `${fivexx.length} server error response(s)`,
			observed: fivexx.slice(0, 5).join(" || "),
		});
	if (fourxx.length)
		addFinding({
			category: "network-4xx",
			severity: "med",
			title: `${fourxx.length} client-error response(s)`,
			observed: fourxx.slice(0, 5).join(" || "),
		});

	await page
		.screenshot({ path: resolve(evDir, "shot.png"), fullPage: true })
		.catch(() => {});
} catch (e) {
	if (!String(e.message).startsWith("__bail")) {
		addFinding({
			category: "unhandled-exception",
			severity: "high",
			title: "Explorer crashed on this route",
			observed: String(e.message).slice(0, 300),
		});
	}
	await page
		.screenshot({ path: resolve(evDir, "shot.png"), fullPage: true })
		.catch(() => {});
} finally {
	writeFileSync(
		resolve(evDir, "console.txt"),
		consoleLines.join("\n") || "(no console errors/warnings)",
	);
	writeFileSync(
		resolve(evDir, "network.txt"),
		networkLines.join("\n") || "(no failed requests)",
	);
	await context.tracing
		.stop({ path: resolve(evDir, "trace.zip") })
		.catch(() => {});
	await browser.close().catch(() => {});
	// drop evidence dir if route was clean (keep disk small) — but keep console/network refs valid
	if (findings.length === 0 && !result.authExpired && !result.serverDown) {
		try {
			rmSync(evDir, { recursive: true, force: true });
		} catch {}
	}
	writeFileSync(
		resolve(ROOT, "findings", `${id}.json`),
		JSON.stringify(result, null, 2),
	);
	clearTimeout(hardDeadline);
	console.log(
		JSON.stringify({
			route: path,
			findings: findings.length,
			actions: result.actionsTaken,
			authExpired: result.authExpired,
			serverDown: result.serverDown,
		}),
	);
	process.exit(0);
}
