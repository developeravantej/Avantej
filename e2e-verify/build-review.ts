#!/usr/bin/env bun
// Builds a self-contained HTML review page (base64-embedded video + screenshot).
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "review");
const videoB64 = readFileSync(join(dir, "journey.webm")).toString("base64");
const shotB64 = readFileSync(join(dir, "final-screen.png")).toString("base64");

const TESTS = [
	{
		title:
			"Platform Admin surface — sidebar lean + Billing tabs (post-simplification)",
		status: "passed",
		durationMs: 6690,
		steps: [
			"Log in as a platform admin (developer.avantej@gmail.com)",
			"Primary nav shows the 3 core ops surfaces — Mission Control · Tenants · Billing",
			"System group expands to reveal secondary surfaces — Health · Comms · Webhooks · Audit · Users",
			"Tenants surface loads",
			"Billing money-hub tabs render and navigate — Overview · Revenue · Renewals · Payments",
		],
		video: videoB64,
		screenshot: shotB64,
	},
];

const css = `
:root{--bg:#0b0d10;--card:#151a1f;--ln:#222a31;--fg:#e6edf3;--mut:#8b98a5;--ok:#3fb950;--accent:#d6cdb1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.wrap{max-width:980px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:24px;margin:0 0 4px}.sub{color:var(--mut);margin:0 0 28px;font-size:13px}
.card{background:var(--card);border:1px solid var(--ln);border-radius:14px;padding:24px;margin:0 0 24px}
.thead{display:flex;align-items:center;gap:12px;margin:0 0 16px}
.ttitle{font-size:17px;font-weight:600;flex:1}
.badge{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.05em}
.badge.ok{background:rgba(63,185,80,.15);color:var(--ok);border:1px solid rgba(63,185,80,.4)}
.dur{color:var(--mut);font-size:12px}
ol.steps{margin:0 0 22px;padding:0;counter-reset:s;list-style:none}
ol.steps li{counter-increment:s;position:relative;padding:9px 0 9px 40px;border-bottom:1px solid var(--ln);font-size:14px}
ol.steps li:last-child{border-bottom:0}
ol.steps li::before{content:counter(s);position:absolute;left:0;top:8px;width:26px;height:26px;border-radius:50%;background:rgba(63,185,80,.12);border:1px solid rgba(63,185,80,.4);color:var(--ok);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
ol.steps li .chk{color:var(--ok);margin-left:8px}
.label{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 8px}
video,img.shot{width:100%;border-radius:10px;border:1px solid var(--ln);background:#000;display:block}
.foot{color:var(--mut);font-size:12px;text-align:center;margin-top:8px}
`;

const testHtml = (t: (typeof TESTS)[number]) => `
<section class="card">
  <div class="thead">
    <div class="ttitle">${t.title}</div>
    <span class="badge ok">${t.status}</span>
    <span class="dur">${(t.durationMs / 1000).toFixed(1)}s</span>
  </div>
  <div class="label">Journey</div>
  <ol class="steps">${t.steps.map((s) => `<li>${s}<span class="chk">&#10003;</span></li>`).join("")}</ol>
  <div class="label">Recorded video</div>
  <video controls preload="metadata" poster="data:image/png;base64,${t.screenshot}">
    <source src="data:video/webm;base64,${t.video}" type="video/webm">
  </video>
  <div class="label">Final screen</div>
  <img class="shot" src="data:image/png;base64,${t.screenshot}" alt="final screen">
</section>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Avantej — Platform Admin verification</title><style>${css}</style></head>
<body><div class="wrap">
<h1>Platform Admin — post-simplification verification</h1>
<p class="sub">Playwright (Chromium) against the running dev app · gates verified separately by the integration test suite · generated from e2e-verify</p>
${TESTS.map(testHtml).join("")}
<p class="foot">1 test · ${TESTS.filter((t) => t.status === "passed").length} passed · 0 failed</p>
</div></body></html>`;

writeFileSync(join(dir, "review.html"), html);
console.log(
	"wrote",
	join(dir, "review.html"),
	`(${(html.length / 1024).toFixed(0)} KB)`,
);
