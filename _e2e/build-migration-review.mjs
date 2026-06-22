#!/usr/bin/env node
/**
 * Build _e2e/review-migration.html — pairs each migration verification journey
 * (title + recorded video) with the tenant-DB schema + the actual migrated rows
 * for that module (from migration-data.json). One self-contained HTML page.
 *
 *   node _e2e/build-migration-review.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = dirname(fileURLToPath(import.meta.url));
const report = JSON.parse(
	readFileSync(join(E2E, "results/report.json"), "utf8"),
);
const data = JSON.parse(readFileSync(join(E2E, "migration-data.json"), "utf8"));
const journeys = existsSync(join(E2E, "journey-steps.json"))
	? JSON.parse(readFileSync(join(E2E, "journey-steps.json"), "utf8"))
	: {};

// Flatten playwright report → [{title, status, video}]
const tests = [];
function walk(suite, file) {
	const f = suite.file || file;
	for (const sp of suite.specs ?? []) {
		const t = sp.tests?.[0];
		const res = t?.results?.[t.results.length - 1];
		const vid = res?.attachments?.find((a) => a.name === "video");
		tests.push({
			title: sp.title,
			file: f,
			status: res?.status ?? "unknown",
			ok: sp.ok,
			video: vid ? relative(E2E, vid.path).replace(/\\/g, "/") : null,
		});
	}
	for (const s of suite.suites ?? []) walk(s, f);
}
for (const s of report.suites ?? []) walk(s);
// This review is migration-specific — keep only the migration journeys.
const allTests = tests.splice(0, tests.length);
tests.push(...allTests.filter((t) => /migration/i.test(t.file || "")));

// Map a test title → a migration-data module by keyword.
const KEY = [
	[/branch/i, "Branches (hierarchy)"],
	[/service/i, "Services (PT packages)"],
	[/customer/i, "Customers (profiles)"],
	[/staff/i, "Staff (members)"],
	[/appointment/i, "Appointments"],
];
const moduleFor = (title) => KEY.find(([re]) => re.test(title))?.[1] ?? null;
const dataByModule = Object.fromEntries(data.modules.map((m) => [m.module, m]));

const esc = (v) =>
	String(v ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

function dataTable(mod) {
	if (!mod || !mod.rows.length) return "<p class='muted'>No migrated rows.</p>";
	const cols = Object.keys(mod.rows[0]);
	const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
	const body = mod.rows
		.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`)
		.join("");
	return `<table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function schemaList(mod) {
	if (!mod) return "";
	return `<div class="schema">${mod.schema
		.map(
			(s) =>
				`<span class="col"><b>${esc(s.column)}</b> <i>${esc(s.type)}</i></span>`,
		)
		.join("")}</div>`;
}

const cards = tests
	.map((t) => {
		const modName = moduleFor(t.title);
		const mod = modName ? dataByModule[modName] : null;
		const steps =
			journeys[`${t.file?.split(/[\\/]/).slice(-2).join("/")}::${t.title}`] ||
			[];
		const stepHtml = steps.length
			? `<ol class="journey">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
			: "";
		const vid = t.video
			? `<video controls preload="metadata" src="${t.video}"></video>`
			: `<p class="muted">no video</p>`;
		return `
<section class="card ${t.ok ? "pass" : "fail"}">
  <h2><span class="badge">${t.ok ? "PASS" : "FAIL"}</span> ${esc(t.title)}</h2>
  ${stepHtml}
  <div class="grid">
    <div class="vidwrap"><h3>Recorded journey</h3>${vid}</div>
    <div class="datawrap">
      <h3>Migrated rows in DB${mod ? ` — ${mod.migratedCount} rows · table <code>${esc(mod.table)}</code>` : ""}</h3>
      ${dataTable(mod)}
      <h3>Schema (${mod ? mod.schema.length : 0} columns)</h3>
      ${schemaList(mod)}
    </div>
  </div>
</section>`;
	})
	.join("\n");

const passCount = tests.filter((t) => t.ok).length;
const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Migration Review — schema · data · video</title>
<style>
  body{font:14px/1.5 system-ui,sans-serif;margin:0;background:#f8fafc;color:#1e293b}
  header{padding:20px 28px;background:#fff;border-bottom:1px solid #e2e8f0}
  h1{margin:0 0 4px;font-size:20px;color:#0f172a} .sub{color:#64748b;font-size:13px}
  main{padding:24px;max-width:1500px;margin:0 auto}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin:0 0 22px;box-shadow:0 1px 3px rgba(15,23,42,.05)}
  .card.pass{border-left:4px solid #16a34a} .card.fail{border-left:4px solid #dc2626}
  h2{font-size:16px;margin:0 0 10px;display:flex;gap:10px;align-items:center;color:#0f172a}
  .badge{font-size:11px;padding:2px 8px;border-radius:999px;background:#16a34a;color:#fff}
  .fail .badge{background:#dc2626;color:#fff}
  .grid{display:grid;grid-template-columns:minmax(360px,1fr) 1.4fr;gap:20px;align-items:start}
  video{width:100%;border-radius:8px;background:#000;max-height:420px;border:1px solid #e2e8f0}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin:14px 0 6px}
  .journey{margin:0 0 10px;padding-left:20px;color:#334155;font-size:13px}
  table.data{border-collapse:collapse;width:100%;font-size:11.5px;display:block;overflow:auto;max-height:300px}
  table.data th,table.data td{border:1px solid #e2e8f0;padding:3px 6px;text-align:left;white-space:nowrap}
  table.data th{background:#f1f5f9;position:sticky;top:0}
  .schema{display:flex;flex-wrap:wrap;gap:6px}
  .schema .col{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:2px 7px;font-size:11px}
  .schema i{color:#94a3b8;font-style:normal}
  code{background:#f1f5f9;padding:1px 5px;border-radius:4px} .muted{color:#94a3b8}
</style></head><body>
<header>
  <h1>Legacy → Avantej Migration — Review</h1>
  <div class="sub">${passCount}/${tests.length} journeys passed · org <code>${esc(data.org)}</code> · each card: recorded video + migrated DB rows + schema</div>
</header>
<main>${cards || "<p class='muted'>No tests in report.</p>"}</main>
</body></html>`;

const out = join(E2E, "review-migration.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${tests.length} journeys, ${passCount} passed)`);
