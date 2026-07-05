#!/usr/bin/env node
/**
 * Build _e2e/review-uat.html — a UAT-aligned review page.
 * Top: Section-14 Go/No-Go module rollup (Ready / Partial / Not Ready / Blocker),
 * computed from the Playwright report. Below: one card per UAT section with its
 * check items (testability badges), mapped spec results, and recorded videos.
 *
 *   node _e2e/build-uat-review.mjs
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = dirname(fileURLToPath(import.meta.url));
const ledger = JSON.parse(readFileSync(join(E2E, "uat-ledger.json"), "utf8"));
const report = existsSync(join(E2E, "results/report.json"))
	? JSON.parse(readFileSync(join(E2E, "results/report.json"), "utf8"))
	: { suites: [] };
const uatData = existsSync(join(E2E, "uat-data.json"))
	? JSON.parse(readFileSync(join(E2E, "uat-data.json"), "utf8"))
	: { sections: {} };

// Flatten report → tests keyed by normalized file path (after web/).
const tests = [];
function walk(s, file) {
	const f = s.file || file;
	for (const sp of s.specs ?? []) {
		const t = sp.tests?.[0];
		const res = t?.results?.[t.results.length - 1];
		const vid = res?.attachments?.find((a) => a.name === "video");
		let videoBytes = 0;
		if (vid) {
			try {
				videoBytes = statSync(vid.path).size;
			} catch {
				videoBytes = 0;
			}
		}
		const norm = String(f)
			.replace(/\\/g, "/")
			.replace(/^.*?\/web\//, "");
		tests.push({
			file: norm,
			title: sp.title,
			ok: sp.ok,
			status: res?.status ?? "unknown",
			video: vid ? relative(E2E, vid.path).replace(/\\/g, "/") : null,
			videoBytes,
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
	if (
		hasGap ||
		items.some(
			(i) => i.testability === "partial" || i.testability === "deferred",
		)
	)
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
// Render the DB schema + live data sample for a UAT section (from uat-data.json).
function dbBlock(sectionN) {
	const sd = uatData.sections?.[String(sectionN)];
	if (!sd || !sd.tables?.length) return "";
	const blocks = sd.tables
		.map((t) => {
			if (t.missing)
				return `<div class="tbl"><h4><code>${esc(t.table)}</code> — not present</h4></div>`;
			const schema = `<div class="schema">${t.schema.map((s) => `<span class="col"><b>${esc(s.column)}</b> <i>${esc(s.type)}</i></span>`).join("")}</div>`;
			let data = `<p class="muted">no rows</p>`;
			if (t.rows.length) {
				const cols = Object.keys(t.rows[0]);
				const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
				const body = t.rows
					.map(
						(r) =>
							`<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`,
					)
					.join("");
				data = `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
			}
			return `<div class="tbl"><h4><code>${esc(t.table)}</code> · ${t.total} rows · ${t.schema.length} cols</h4>${data}<details><summary>schema</summary>${schema}</details></div>`;
		})
		.join("");
	return `<h3>Database — schema + live values</h3>${blocks}`;
}

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
	// Only embed videos with real UI content. API-boundary specs (rule/lifecycle/
	// rbac via page.request) never navigate the browser, so their recording is a
	// near-empty webm (a blank player) — list those as text instead of black boxes.
	const VIDEO_MIN_BYTES = 10000;
	const withVideo = mapped.filter(
		(t) => t.video && t.videoBytes >= VIDEO_MIN_BYTES,
	);
	const apiOnly = mapped.filter(
		(t) =>
			t.status !== "unknown" && !(t.video && t.videoBytes >= VIDEO_MIN_BYTES),
	);
	// Reference .mp4 (faststart, transcoded by build.sh): Cloudflare's asset server
	// doesn't honour Range, and webm's seek index sits at the END of the file, so
	// the browser can't load webm without Range (endless spinner). faststart MP4
	// puts metadata at the front and plays progressively over a plain GET.
	const vids = withVideo
		.map(
			(t) =>
				`<figure><figcaption>${t.ok ? "✅" : "❌"} ${esc(t.title)}</figcaption><video controls playsinline preload="metadata" poster="${t.video.replace(/\.webm$/, ".jpg")}" src="${t.video.replace(/\.webm$/, ".mp4")}"></video></figure>`,
		)
		.join("");
	const apiList = apiOnly.length
		? `<details class="apiverified"><summary>✓ ${apiOnly.length} spec${apiOnly.length === 1 ? "" : "s"} verified at the API boundary (no UI to record)</summary><ul>${apiOnly
				.map((t) => `<li>${t.ok ? "✅" : "❌"} ${esc(t.title)}</li>`)
				.join("")}</ul></details>`
		: "";
	cards.push(`
<section class="card ${st.cls}">
  <h2><span class="pill ${st.cls}">${st.label}</span> §${sec.n} ${esc(sec.title)}</h2>
  <ul class="items">${itemHtml}</ul>
  ${vids ? `<h3>Recorded journeys (${withVideo.length})</h3><div class="vids">${vids}</div>` : ""}
  ${apiList || (withVideo.length ? "" : `<p class="muted">${mapped.length ? "Specs verified at the API boundary (no UI navigation)." : "No spec mapped yet."}</p>`)}
  ${dbBlock(sec.n)}
</section>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>UAT Go/No-Go Review</title>
<meta name="color-scheme" content="light">
<style>
 :root{color-scheme:light}
 html,body{color-scheme:light}
 body{font:14px/1.55 system-ui,sans-serif;margin:0;background:#f8fafc;color:#1e293b}
 header{padding:20px 28px;background:#fff;border-bottom:1px solid #e2e8f0}
 h1{margin:0 0 4px;font-size:20px;color:#0f172a}.sub{color:#64748b;font-size:13px}
 main{padding:24px;max-width:1400px;margin:0 auto}
 table.roll{border-collapse:collapse;width:100%;margin:0 0 26px;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.06)}
 table.roll th,table.roll td{border:1px solid #e2e8f0;padding:7px 10px;text-align:left;font-size:13px}
 table.roll th{background:#f1f5f9}
 .pill{font-size:11px;padding:2px 9px;border-radius:999px;font-weight:600}
 .ready{background:#16a34a;color:#fff}.partial{background:#d97706;color:#fff}
 .notready{background:#ea580c;color:#fff}.blocker{background:#dc2626;color:#fff}.deferred{background:#64748b;color:#fff}
 .card{background:#fff;border:1px solid #e2e8f0;border-left-width:4px;border-radius:12px;padding:16px 20px;margin:0 0 20px;box-shadow:0 1px 3px rgba(15,23,42,.05)}
 .card.ready{border-left-color:#16a34a}.card.partial{border-left-color:#d97706}.card.notready{border-left-color:#ea580c}
 .card.blocker{border-left-color:#dc2626}.card.deferred{border-left-color:#94a3b8}
 h2{font-size:16px;margin:0 0 10px;display:flex;gap:10px;align-items:center;color:#0f172a}
 h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:12px 0 6px}
 h4{font-size:12px;margin:10px 0 4px;color:#334155;font-weight:600}
 .tbl{margin:0 0 10px}
 table.data{border-collapse:collapse;width:100%;font-size:11px;display:block;overflow:auto;max-height:240px}
 table.data th,table.data td{border:1px solid #e2e8f0;padding:3px 6px;text-align:left;white-space:nowrap}
 table.data th{background:#f1f5f9;position:sticky;top:0}
 .schema{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
 .schema .col{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:1px 6px;font-size:10.5px}
 .schema i{color:#94a3b8;font-style:normal}
 details summary{cursor:pointer;color:#64748b;font-size:11px;margin-top:4px}
 ul.items{margin:0;padding-left:18px}ul.items li{margin:3px 0}
 .b{font-size:11px;padding:1px 6px;border-radius:5px;background:#f8fafc;border:1px solid #e2e8f0}
 .b.covered{color:#15803d}.b.partial{color:#b45309}.b.gap{color:#b91c1c}.b.deferred{color:#475569}
 .vids{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
 figure{margin:0}figcaption{font-size:12px;margin:0 0 4px;color:#475569}
 video{width:100%;border-radius:8px;background:#000;border:1px solid #e2e8f0}
 code{background:#f1f5f9;color:#0f172a;padding:1px 5px;border-radius:4px;font-size:11px}.muted{color:#94a3b8}
 ul.items li{color:#1e293b}
 table.data th,table.data td{color:#334155}
 .apiverified{margin:8px 0;font-size:12px;color:#475569}
 .apiverified summary{cursor:pointer;color:#15803d;font-weight:600}
 .apiverified ul{margin:6px 0 0;padding-left:18px;color:#475569}
 .apiverified li{margin:2px 0}
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
