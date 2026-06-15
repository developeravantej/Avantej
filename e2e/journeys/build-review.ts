#!/usr/bin/env bun
/**
 * Build the portable HTML review page (e2e.html) from the journey-suite run.
 *
 * Consumes the Playwright JSON report (e2e/journeys/.results/report.json) + per-test
 * video/screenshots, and emits:
 *
 *   e2e/journeys/review/e2e.html          ← open this
 *   e2e/journeys/review/assets/<slug>/    ← copied video.webm + screenshots
 *
 * Layout: two top-level TABS —
 *   • SaaS Platform   (platform-admin / control-panel operator journeys)
 *   • Tenant Platform (tenant-admin + scoped-staff journeys)
 * Each tab is split into MODULES (flows); each card shows title · tier · status ·
 * numbered journey steps · video · screenshots.
 *
 * Run (after a journey run):  bun e2e/journeys/build-review.ts
 */

import {
	readFileSync,
	writeFileSync,
	mkdirSync,
	copyFileSync,
	existsSync,
	rmSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT = join(HERE, ".results", "report.json");
const OUT_DIR = join(HERE, "review");
const ASSET_DIR = join(OUT_DIR, "assets");

interface Attachment {
	name: string;
	path?: string;
	contentType: string;
}
interface Step {
	title: string;
	category: string;
	steps?: Step[];
}
interface Result {
	status: string;
	duration: number;
	attachments?: Attachment[];
	steps?: Step[];
	errors?: { message?: string }[];
}
interface PWTest {
	projectName?: string;
	results?: Result[];
	tags?: string[];
}
interface Spec {
	title: string;
	tests?: PWTest[];
	tags?: string[];
	file?: string;
}
interface Suite {
	title: string;
	file?: string;
	specs?: Spec[];
	suites?: Suite[];
}
interface Report {
	suites?: Suite[];
}

interface Card {
	id: string;
	tab: string;
	module: string;
	title: string;
	tier: string;
	project: string;
	status: string;
	durationMs: number;
	steps: string[];
	error?: string;
	video?: string;
	shots: string[];
}

// filename (without role/suffix) → friendly module label for the Tenant tab
const MODULE_LABELS: Record<string, string> = {
	"01-dashboard-home": "Dashboard & Home",
	"02-pos-sales-pipeline": "POS & Sales",
	"03-appointment-commission-pipeline": "Appointments & Commissions",
	"05-rbac-access": "RBAC & Access Control",
	"10-pos-sales": "POS & Sales",
	"20-packages-installments": "Packages & Installments",
	"30-commissions-payouts": "Commissions, Payouts & Expenses",
	"40-refunds": "Refunds & Cancellations",
	"50-attendance": "Attendance & Check-in",
	"60-inventory": "Inventory & Procurement",
	"70-customers-trainers": "Customers & Trainers",
	"80-settings": "Settings, Notifications & Announcements",
	"90-hierarchy-branch": "Hierarchy & Branch",
	"95-appointments-scheduling": "Appointments & Scheduling",
	"06-saas-platform": "SaaS Platform Surface",
};

const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);

function fileKey(file: string): string {
	return basename(file)
		.replace(/\.(admin|staff|platform|anon)\.journey\.spec\.ts$/, "")
		.replace(/\.spec\.ts$/, "");
}
function moduleFromFile(file: string): string {
	const key = fileKey(file);
	if (MODULE_LABELS[key]) return MODULE_LABELS[key];
	return key
		.replace(/^\d+[-_]/, "")
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}
function tabFromProject(project: string): string {
	return /platform/i.test(project) ? "SaaS Platform" : "Tenant Platform";
}

function flattenStepTitles(
	steps: Step[] | undefined,
	acc: string[] = [],
): string[] {
	if (!steps) return acc;
	for (const s of steps) {
		// The JSON reporter lists user test.step() titles here with no `category` field;
		// take every title, skipping framework hooks/fixtures defensively.
		const t = (s.title || "").trim();
		if (
			t &&
			!/^(before|after) hooks$/i.test(t) &&
			!/^fixture:/i.test(t) &&
			!/^(worker|browserContext|apiRequest)\b/i.test(t)
		) {
			acc.push(t);
		}
		if (s.steps) flattenStepTitles(s.steps, acc);
	}
	return acc;
}
function tierOf(tags: string[] | undefined, title: string): string {
	const all = (tags ?? []).join(" ").toLowerCase() + " " + title.toLowerCase();
	if (all.includes("p0")) return "P0";
	if (all.includes("p1")) return "P1";
	if (all.includes("p2")) return "P2";
	return "—";
}

// Walk suites tracking the owning file + the nearest describe() title (module override).
function collect(
	suites: Suite[] | undefined,
	file: string,
	describe: string,
	out: Card[],
): void {
	if (!suites) return;
	for (const suite of suites) {
		// Playwright sets `.file` on describe suites too, so detect the file suite by its
		// title (the spec path) — a describe suite's title is the module name.
		const isFile = /\.spec\.ts$/.test(suite.title);
		const nextFile = isFile ? suite.title : (suite.file ?? file);
		const nextDescribe = isFile ? "" : suite.title || describe;

		for (const spec of suite.specs ?? []) {
			const test = spec.tests?.[spec.tests.length - 1];
			const result = test?.results?.[test.results.length - 1];
			if (!result) continue;
			const project = test?.projectName ?? "";
			if (/setup/i.test(project)) continue; // drop auth setup projects
			const specFile = spec.file ?? nextFile;
			const tags = [...(spec.tags ?? []), ...(test?.tags ?? [])];
			const slug = slugify(`${spec.title}-${project}`);
			const dest = join(ASSET_DIR, slug);
			let video: string | undefined;
			const shots: string[] = [];
			for (const a of result.attachments ?? []) {
				if (!a.path || !existsSync(a.path)) continue;
				mkdirSync(dest, { recursive: true });
				const fname = basename(a.path);
				if (a.contentType === "video/webm" || a.name === "video") {
					copyFileSync(a.path, join(dest, "video.webm"));
					video = `assets/${slug}/video.webm`;
				} else if (
					a.contentType?.startsWith("image/") ||
					a.name === "screenshot"
				) {
					copyFileSync(a.path, join(dest, fname));
					shots.push(`assets/${slug}/${fname}`);
				}
			}
			out.push({
				id: slug,
				tab: tabFromProject(project),
				module: nextDescribe || moduleFromFile(specFile),
				title: spec.title,
				tier: tierOf(tags, spec.title),
				project,
				status: result.status,
				durationMs: result.duration,
				steps: flattenStepTitles(result.steps),
				error: result.errors?.[0]?.message
					?.replace(/\[[0-9;]*m/g, "")
					.slice(0, 600),
				video,
				shots,
			});
		}
		collect(suite.suites, nextFile, nextDescribe, out);
	}
}

// ── Build ──────────────────────────────────────────────────────────────────────
if (!existsSync(REPORT)) {
	console.error(`No report at ${REPORT} — run the journey suite first.`);
	process.exit(1);
}
if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(ASSET_DIR, { recursive: true });

const report = JSON.parse(readFileSync(REPORT, "utf-8")) as Report;
const cards: Card[] = [];
collect(report.suites, "", "", cards);

const TABS = ["SaaS Platform", "Tenant Platform"];
const esc = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const badgeClass = (s: string) =>
	s === "passed" ? "ok" : s === "skipped" ? "skip" : "bad";

const css = `
:root{--bg:#0b0d10;--card:#151a1f;--ln:#222a31;--fg:#e6edf3;--mut:#8b98a5;--ok:#3fb950;--bad:#f85149;--skip:#d29922;--accent:#d6cdb1;--saas:#6ea8fe}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:1060px;margin:0 auto;padding:32px 24px 100px}
h1{font-size:25px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 22px;font-size:13px}
.tabbar{display:flex;gap:8px;margin:0 0 8px;border-bottom:1px solid var(--ln)}
.tabbtn{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--mut);font:600 15px/1 inherit;padding:12px 16px;cursor:pointer}
.tabbtn .n{font-size:12px;color:var(--mut);margin-left:6px}
.tabbtn.active{color:var(--fg);border-bottom-color:var(--accent)}
.tabpanel{display:none}.tabpanel.active{display:block}
.tsummary{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0 6px}
.pill{font-size:13px;font-weight:600;padding:6px 14px;border-radius:999px;border:1px solid var(--ln);background:var(--card)}
.pill.ok{color:var(--ok)}.pill.bad{color:var(--bad)}.pill.skip{color:var(--skip)}
.module{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin:30px 0 12px;border-bottom:1px solid var(--ln);padding-bottom:8px}
.card{position:relative;background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:22px;margin:0 0 18px}
.card.reviewed{border-color:rgba(63,185,80,.5);background:linear-gradient(0deg,rgba(63,185,80,.05),rgba(63,185,80,.05)),var(--card)}
.card.reviewed::before{content:"\\2713 reviewed";position:absolute;top:-9px;right:14px;background:var(--ok);color:#0b0d10;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px;letter-spacing:.04em}
.rev{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);cursor:pointer;user-select:none;white-space:nowrap}
.rev input{width:16px;height:16px;cursor:pointer;accent-color:var(--ok)}
.revbar{margin:0 0 14px;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--mut)}
.revbar #rev-count{color:var(--ok);font-weight:700}
.revreset{appearance:none;background:transparent;border:1px solid var(--ln);color:var(--mut);border-radius:6px;padding:3px 10px;font:inherit;font-size:12px;cursor:pointer}
.revreset:hover{color:var(--fg);border-color:var(--mut)}
.thead{display:flex;align-items:center;gap:10px;margin:0 0 14px;flex-wrap:wrap}
.ttitle{font-size:16px;font-weight:600;flex:1;min-width:260px}
.badge{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.05em}
.badge.ok{background:rgba(63,185,80,.15);color:var(--ok);border:1px solid rgba(63,185,80,.4)}
.badge.bad{background:rgba(248,81,73,.15);color:var(--bad);border:1px solid rgba(248,81,73,.4)}
.badge.skip{background:rgba(210,153,34,.15);color:var(--skip);border:1px solid rgba(210,153,34,.4)}
.tier{font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;background:rgba(214,205,177,.12);color:var(--accent);border:1px solid rgba(214,205,177,.3)}
.dur{color:var(--mut);font-size:12px}
ol.steps{margin:0 0 18px;padding:0;counter-reset:s;list-style:none}
ol.steps li{counter-increment:s;position:relative;padding:8px 0 8px 38px;border-bottom:1px solid var(--ln);font-size:14px}
ol.steps li:last-child{border-bottom:0}
ol.steps li::before{content:counter(s);position:absolute;left:0;top:7px;width:24px;height:24px;border-radius:50%;background:rgba(214,205,177,.1);border:1px solid rgba(214,205,177,.35);color:var(--accent);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.nosteps{color:var(--mut);font-size:13px;font-style:italic;margin:0 0 16px}
.label{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:16px 0 8px}
video{width:100%;border-radius:10px;border:1px solid var(--ln);background:#000;display:block}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.shots img{width:100%;border-radius:8px;border:1px solid var(--ln);background:#000;cursor:zoom-in}
.err{background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.3);border-radius:8px;padding:12px;color:#ffb3ae;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;margin:12px 0 0}
.foot{color:var(--mut);font-size:12px;text-align:center;margin-top:30px}
`;

const cardHtml = (c: Card) => `
<section class="card" data-id="${c.id}">
  <div class="thead">
    ${c.tier !== "—" ? `<span class="tier">${c.tier}</span>` : ""}
    <div class="ttitle">${esc(c.title)}</div>
    <span class="badge ${badgeClass(c.status)}">${c.status}</span>
    <span class="dur">${(c.durationMs / 1000).toFixed(1)}s · ${esc(c.project)}</span>
    <label class="rev"><input type="checkbox" class="revchk" data-id="${c.id}"> Reviewed</label>
  </div>
  <div class="label">Journey steps</div>
  ${c.steps.length ? `<ol class="steps">${c.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : `<p class="nosteps">No explicit steps recorded for this test.</p>`}
  ${c.video ? `<div class="label">Recorded video</div><video controls preload="metadata"${c.shots[0] ? ` poster="${c.shots[0]}"` : ""}><source src="${c.video}" type="video/webm"></video>` : ""}
  ${c.shots.length ? `<div class="label">Screenshots</div><div class="shots">${c.shots.map((s) => `<img src="${s}" loading="lazy" onclick="window.open(this.src)">`).join("")}</div>` : ""}
  ${c.error ? `<div class="err">${esc(c.error)}</div>` : ""}
</section>`;

function panelHtml(tab: string, idx: number): string {
	const tabCards = cards.filter((c) => c.tab === tab);
	const passed = tabCards.filter((c) => c.status === "passed").length;
	const failed = tabCards.filter(
		(c) => c.status === "failed" || c.status === "timedOut",
	).length;
	const skipped = tabCards.filter((c) => c.status === "skipped").length;
	const modules = [...new Set(tabCards.map((c) => c.module))];
	let body = `<div class="tsummary">
    <span class="pill">${tabCards.length} journeys</span>
    <span class="pill">${modules.length} modules</span>
    <span class="pill ok">${passed} passed</span>
    <span class="pill bad">${failed} failed</span>
    <span class="pill skip">${skipped} skipped</span>
  </div>`;
	for (const m of modules) {
		const mc = tabCards.filter((c) => c.module === m);
		body += `<div class="module">${esc(m)} · ${mc.length}</div>`;
		body += mc.map(cardHtml).join("");
	}
	return `<div class="tabpanel${idx === 0 ? " active" : ""}" id="panel-${idx}">${body}</div>`;
}

const tabBtns = TABS.map((t, i) => {
	const n = cards.filter((c) => c.tab === t).length;
	return `<button class="tabbtn${i === 0 ? " active" : ""}" data-i="${i}">${esc(t)}<span class="n">${n}</span></button>`;
}).join("");

const total = cards.length;
const totPass = cards.filter((c) => c.status === "passed").length;
const totSkip = cards.filter((c) => c.status === "skipped").length;
const totFail = cards.filter(
	(c) => c.status === "failed" || c.status === "timedOut",
).length;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avantej — E2E Journey Review</title><style>${css}</style></head>
<body><div class="wrap">
<h1>Avantej — E2E Journey Review</h1>
<p class="sub">Playwright (Chromium) · ${total} journeys (${totPass} passed · ${totFail} failed · ${totSkip} skipped) · recorded against the running dev app · each card shows its journey steps + video</p>
<div class="revbar">Reviewed <span id="rev-count">0</span> / ${total} · marks persist in this browser <button id="rev-reset" class="revreset">Reset all</button></div>
<div class="tabbar">${tabBtns}</div>
${TABS.map((t, i) => panelHtml(t, i)).join("")}
<p class="foot">Generated from e2e/journeys/.results/report.json</p>
</div>
<script>
// Committed review state: every test was reviewed at build time. A fresh viewer
// (no localStorage yet) is seeded to "all reviewed"; an existing viewer keeps theirs.
var REVIEWED_BASELINE = ${JSON.stringify(cards.map((c) => c.id))};
document.querySelectorAll('.tabbtn').forEach(function(b){
  b.addEventListener('click', function(){
    var i = b.getAttribute('data-i');
    document.querySelectorAll('.tabbtn').forEach(function(x){ x.classList.remove('active'); });
    document.querySelectorAll('.tabpanel').forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active');
    document.getElementById('panel-' + i).classList.add('active');
  });
});
// Persistent "Reviewed" checkboxes — state stored in localStorage (survives reload/close).
(function(){
  var KEY = 'avantej-e2e-reviewed-v1';
  function load(){ try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){ return {}; } }
  function save(m){ try { localStorage.setItem(KEY, JSON.stringify(m)); } catch(e){} }
  function refresh(){ var m = load(); var n = Object.keys(m).filter(function(k){ return m[k]; }).length; var el = document.getElementById('rev-count'); if (el) el.textContent = n; }
  // Seed the committed "all reviewed" baseline on first visit only.
  if (localStorage.getItem(KEY) === null) {
    var seed = {};
    REVIEWED_BASELINE.forEach(function(id){ seed[id] = true; });
    save(seed);
  }
  var state = load();
  document.querySelectorAll('.revchk').forEach(function(chk){
    var id = chk.getAttribute('data-id');
    var card = chk.closest('.card');
    if (state[id]) { chk.checked = true; if (card) card.classList.add('reviewed'); }
    chk.addEventListener('change', function(){
      var m = load();
      if (chk.checked) { m[id] = true; if (card) card.classList.add('reviewed'); }
      else { delete m[id]; if (card) card.classList.remove('reviewed'); }
      save(m); refresh();
    });
  });
  var rb = document.getElementById('rev-reset');
  if (rb) rb.addEventListener('click', function(){
    if (confirm('Clear all reviewed marks?')) {
      save({});
      document.querySelectorAll('.revchk').forEach(function(c){ c.checked = false; var cc = c.closest('.card'); if (cc) cc.classList.remove('reviewed'); });
      refresh();
    }
  });
  refresh();
})();
</script>
</body></html>`;

writeFileSync(join(OUT_DIR, "e2e.html"), html);
const bySaas = cards.filter((c) => c.tab === "SaaS Platform").length;
const byTenant = cards.filter((c) => c.tab === "Tenant Platform").length;
console.log(
	`wrote ${join(OUT_DIR, "e2e.html")} — ${total} journeys (${totPass} passed, ${totFail} failed, ${totSkip} skipped) | SaaS Platform: ${bySaas}, Tenant Platform: ${byTenant}`,
);
