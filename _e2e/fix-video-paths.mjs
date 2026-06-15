// Win32 fix: gen-review-html.mjs emits OS-native (backslash) video paths; browsers
// need forward slashes in <video src>. Normalize only .webm references.
import { readFileSync, writeFileSync } from "node:fs";
const p = "_e2e/review.html";
let h = readFileSync(p, "utf8");
let n = 0;
h = h.replace(/(src=")([^"]*\.webm)(")/g, (_m, a, path, c) => {
	n++;
	return a + path.replace(/\\/g, "/") + c;
});
// also fix the visible vpath caption (it repeats the path before " · N MB")
h = h.replace(
	/(<div class="vpath">)([^<]*\.webm[^<]*)(<\/div>)/g,
	(_m, a, txt, c) => a + txt.replace(/\\/g, "/") + c,
);
writeFileSync(p, h);
console.log("normalized video srcs:", n);
