#!/usr/bin/env node
/**
 * Build _e2e/review-uat.html — a UAT-aligned review page.
 * Top: Section-14 Go/No-Go module rollup (Ready / Partial / Not Ready / Blocker),
 * computed from the Playwright report. Below: one card per UAT section with its
 * check items (testability badges), mapped spec results, and recorded videos.
 *
 *   node _e2e/build-uat-review.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = dirname(fileURLToPath(import.meta.url));
const ledger = JSON.parse(readFileSync(join(E2E, "uat-ledger.json"), "utf8"));
const report = existsSync(join(E2E, "results/report.json"))
	? JSON.parse(readFileSync(join(E2E, "results/report.json"), "utf8"))
	: { suites: [] };

// Flatten report → tests keyed by normalized file path (after web/).
const tests = [];
function walk(s, file) {
	const f = s.file || file;
	for (const sp of s.specs ?? []) {
		const t = sp.tests?.[0];
		const res = t?.results?.[t.results.length - 1];
		const vid = res?.attachments?.find((a) => a.name === "video");
		const norm = String(f)
			.replace(/\\/g, "/")
			.replace(/^.*?\/web\//, "");
		tests.push({
			file: norm,
			title: sp.title,
			ok: sp.ok,
			status: res?.status ?? "unknown",
			video: vid ? relative(E2E, vid.path).replace(/\\/g, "/") : null,
		});
	}
	for (const c of s.suites ?? []) walk(c, f);
}
for (const s of report.suites ?? []) walk(s);

const esc = (v) =>
	String(v ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

function specsFor(globs) {
	const prefixes = (globs ?? []).map((g) =>
		g
			.replace(/^web\//, "")
			.replace(/\*\*$/, "")
			.replace(/\/$/, ""),
	);
	return tests.filter((t) => prefixes.some((p) => t.file.startsWith(p)));
}

// Module status from results + testability.
function statusFor(section, mapped) {
	const items = section.items ?? [];
	const allDeferred =
		items.length > 0 && items.every((i) => i.testability === "deferred");
	if (allDeferred) return { label: "Deferred", cls: "deferred" };
	const ran = mapped.filter((t) => t.status !== "unknown");
	const failed = ran.filter((t) => !t.ok);
	const hasGap = items.some((i) => i.testability === "gap");
	// A failing RBAC/reporting permission test is a Blocker per the UAT.
	const blockerSection = section.n === 9 || section.n === 13;
	if (failed.length && blockerSection)
		return { label: "Blocker", cls: "blocker" };
	if (failed.length) return { label: "Not Ready", cls: "notready" };
	if (hasGap || items.some((i) => i.testability === "partial"))
		return { label: "Partial", cls: "partial" };
	if (ran.length) return { label: "Ready", cls: "ready" };
	return { label: "Partial", cls: "partial" };
}

const badge = {
	covered: "✅ covered",
	partial: "🟡 partial",
	gap: "🔴 gap",
	deferred: "🌐 deferred",
};

const rows = [];
const cards = [];
for (const sec of ledger.sections) {
	const mapped = specsFor(sec.specGlobs);
	const st = statusFor(sec, mapped);
	rows.push(
		`<tr><td>§${sec.n}</td><td>${esc(sec.module)}</td><td><span class="pill ${st.cls}">${st.label}</span></td><td>${mapped.filter((t) => t.ok).length}/${mapped.length} specs</td><td>${esc(sec.owner)}</td></tr>`,
	);
	const itemHtml = sec.items
		.map(
			(i) =>
				`<li><span class="b ${i.testability}">${badge[i.testability] ?? i.testability}</span> ${esc(i.item)}${i.why ? ` <i class="muted">— ${esc(i.why)}</i>` : ""}${i.via ? ` <code>${esc(i.via)}</code>` : ""}</li>`,
		)
		.join("");
	const vids = mapped
		.filter((t) => t.video)
		.map(
			(t) =>
				`<figure><figcaption>${t.ok ? "✅" : "❌"} ${esc(t.title)}</figcaption><video controls preload="metadata" src="${t.video}"></video></figure>`,
		)
		.join("");
	cards.push(`
<section class="card ${st.cls}">
  <h2><span class="pill ${st.cls}">${st.label}</span> §${sec.n} ${esc(sec.title)}</h2>
  <ul class="items">${itemHtml}</ul>
  ${vids ? `<h3>Recorded journeys (${mapped.filter((t) => t.video).length})</h3><div class="vids">${vids}</div>` : `<p class="muted">No video — ${mapped.length ? "specs ran without video" : "no spec mapped yet"}.</p>`}
</section>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>UAT Go/No-Go Review</title>
<style>
 body{font:14px/1.55 system-ui,sans-serif;margin:0;background:#0f172a;color:#e2e8f0}
 header{padding:20px 28px;background:#1e293b;border-bottom:1px solid #334155}
 h1{margin:0 0 4px;font-size:20px}.sub{color:#94a3b8;font-size:13px}
 main{padding:24px;max-width:1400px;margin:0 auto}
 table.roll{border-collapse:collapse;width:100%;margin:0 0 26px;background:#1e293b;border-radius:10px;overflow:hidden}
 table.roll th,table.roll td{border:1px solid #334155;padding:7px 10px;text-align:left;font-size:13px}
 table.roll th{background:#0f172a}
 .pill{font-size:11px;padding:2px 9px;border-radius:999px;font-weight:600}
 .ready{background:#22c55e;color:#06240f}.partial{background:#eab308;color:#2a1d03}
 .notready{background:#f97316;color:#2a1303}.blocker{background:#ef4444;color:#2a0606}.deferred{background:#64748b;color:#0b0f17}
 .card{background:#1e293b;border:1px solid #334155;border-left-width:4px;border-radius:12px;padding:16px 20px;margin:0 0 20px}
 .card.ready{border-left-color:#22c55e}.card.partial{border-left-color:#eab308}.card.notready{border-left-color:#f97316}
 .card.blocker{border-left-color:#ef4444}.card.deferred{border-left-color:#64748b}
 h2{font-size:16px;margin:0 0 10px;display:flex;gap:10px;align-items:center}
 h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:12px 0 6px}
 ul.items{margin:0;padding-left:18px}ul.items li{margin:3px 0}
 .b{font-size:11px;padding:1px 6px;border-radius:5px;background:#0f172a;border:1px solid #334155}
 .b.covered{color:#86efac}.b.partial{color:#fde68a}.b.gap{color:#fca5a5}.b.deferred{color:#cbd5e1}
 .vids{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
 figure{margin:0}figcaption{font-size:12px;margin:0 0 4px;color:#cbd5e1}
 video{width:100%;border-radius:8px;background:#000}
 code{background:#0f172a;padding:1px 5px;border-radius:4px;font-size:11px}.muted{color:#64748b}
</style></head><body>
<header><h1>Avantage Core — MVP Readiness / UAT Go-No-Go</h1>
<div class="sub">Based on Avantage_Core_MVP_Readiness_UAT_SignOff.docx · ${ledger.sections.length} sections · status computed from the e2e run</div></header>
<main>
<h3>Section 14 — Go / No-Go module rollup</h3>
<table class="roll"><thead><tr><th>§</th><th>Module</th><th>Status</th><th>Specs</th><th>Owner</th></tr></thead><tbody>${rows.join("")}</tbody></table>
${cards.join("\n")}
</main></body></html>`;

writeFileSync(join(E2E, "review-uat.html"), html);
console.log(
	`Wrote ${join(E2E, "review-uat.html")} — ${ledger.sections.length} sections, ${tests.length} specs in report`,
);
