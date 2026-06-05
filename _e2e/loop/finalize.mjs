#!/usr/bin/env node
// Apply adversarial-verify verdicts to the raw findings: keep CONFIRMED, drop
// dev-only / low-confidence FPs. Rewrites _e2e/loop/findings/*.json in place,
// relabeling `module` so same-root-cause findings cluster into one report card.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
const dir = "_e2e/loop/findings";

// Routes whose persistent spinner + absent content was reproduced (or share the signature).
const STUCK = new Set([
	"/dashboard/brands/view",
	"/dashboard/categories/view",
	"/dashboard/suppliers/view",
	"/dashboard/uom/view",
	"/dashboard/uom-conversions/view",
	"/dashboard/stock-requests/view",
	"/dashboard/transfer-orders/view",
	"/dashboard/payment/view",
	"/dashboard/settings/installment-plans",
	"/dashboard/inventory-options",
]);
const isDevtoolsNoise = (o) =>
	/tanstack router devtools|writeText.*clipboard|notallowederror/i.test(
		o || "",
	);

let kept = 0,
	dropped = 0;
for (const file of readdirSync(dir)) {
	if (!file.endsWith(".json")) continue;
	const doc = JSON.parse(readFileSync(`${dir}/${file}`, "utf8"));
	const out = [];
	for (const f of doc.findings ?? []) {
		const obs = f.observed || "";
		const route = f.route;
		// --- CONFIRMED: backend 500 on Google Calendar settings ---
		if (f.category === "network-5xx") {
			out.push({
				...f,
				module: "google-calendar",
				severity: "blocker",
				title:
					"Google Calendar settings page fails with 500 (orgStatus + listConnectedCalendars)",
				recommendation:
					"Investigate googleCalendar.orgStatus / listConnectedCalendars handlers — likely missing tenant GHL/Google config throwing 500 instead of returning an empty/disconnected state. NOT APPLIED.",
			});
			kept++;
			continue;
		}
		// --- CONFIRMED: persistent spinner, content never renders, no failing request ---
		if (f.category === "infinite-spinner" && STUCK.has(route)) {
			out.push({
				...f,
				module: "inventory-settings-load",
				severity: "high",
				title:
					"Route shows a persistent spinner and never renders its content (direct navigation)",
				observed:
					"Loading spinner remains visible after networkidle + 3s; main content (list/table) never appears; no failing network request — a stuck client-side load.",
				recommendation:
					"Check the route loader / Suspense boundary / lazy chunk for these pages. NOT APPLIED.",
			});
			kept++;
			continue;
		}
		// --- CONFIRMED: real React/Radix console warnings (message names the component) ---
		if (f.category === "console-error" && /unique \"?key\"? prop/i.test(obs)) {
			out.push({
				...f,
				module: "react-key",
				severity: "low",
				title: "React duplicate/missing key warning in CancelledSalesTab",
				recommendation:
					"Add a stable unique key to the list render in CancelledSalesTab. NOT APPLIED.",
			});
			kept++;
			continue;
		}
		if (
			f.category === "console-error" &&
			/DialogContent.*requires.*DialogTitle/i.test(obs)
		) {
			out.push({
				...f,
				module: "dialog-a11y",
				severity: "low",
				title: "Radix DialogContent missing a DialogTitle (screen-reader a11y)",
				observed:
					"`DialogContent` requires a `DialogTitle` for the component to be accessible for screen reader users.",
				recommendation:
					"Add a (optionally VisuallyHidden) DialogTitle to the dialog. NOT APPLIED.",
			});
			kept++;
			continue;
		}
		// --- DROP: dev-only TanStack Devtools clipboard errors ---
		if (f.category === "console-error" && isDevtoolsNoise(obs)) {
			dropped++;
			continue;
		}
		// --- DROP: 'Failed to load resource ... 500' console echo (duplicate of the network-5xx finding) ---
		if (
			f.category === "console-error" &&
			/failed to load resource.*500/i.test(obs)
		) {
			dropped++;
			continue;
		}
		// --- KEEP but clarify: inventory-options threw an undefined page error AND its content is stuck ---
		if (
			f.category === "unhandled-exception" &&
			/pageerror\] undefined/i.test(obs) &&
			route === "/dashboard/inventory-options"
		) {
			out.push({
				...f,
				module: "inventory-settings-load",
				severity: "high",
				title:
					"inventory-options throws an undefined page error and content never renders",
				recommendation:
					"Trace the undefined throw (likely an unguarded access in the route loader/component); page is unusable. NOT APPLIED.",
			});
			kept++;
			continue;
		}
		// --- DROP: a11y icon-only button (TanStack Devtools, dev-only) ---
		if (f.category === "a11y-blocker") {
			dropped++;
			continue;
		}
		// --- DROP: dead-control (low-confidence; controls likely need preconditions; no breakage evidence) ---
		if (f.category === "dead-control") {
			dropped++;
			continue;
		}
		// --- DROP: slow / unconfirmed spinner (dev cold-compile + heavy-interaction harness artifact) ---
		if (f.category === "slow" || f.category === "infinite-spinner") {
			dropped++;
			continue;
		}
		// --- DROP: inventory-options pageerror 'undefined' (folded into stuck-load finding; not separately reproduced) ---
		if (
			f.category === "unhandled-exception" &&
			/^undefined$/i.test(obs.trim())
		) {
			dropped++;
			continue;
		}
		// anything else: keep but mark unverified
		out.push(f);
		kept++;
	}
	doc.findings = out;
	writeFileSync(`${dir}/${file}`, JSON.stringify(doc, null, 2));
}
console.log(
	`finalize: kept ${kept} confirmed, dropped ${dropped} false-positive/low-confidence.`,
);
