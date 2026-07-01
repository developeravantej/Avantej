import fs from "node:fs";
const [, , file, json] = process.argv;
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const entry = JSON.parse(json);
const i = data.tests.findIndex((t) => t.relpath === entry.relpath);
if (i >= 0) data.tests[i] = entry;
else data.tests.push(entry);
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("tests now:", data.tests.length);
