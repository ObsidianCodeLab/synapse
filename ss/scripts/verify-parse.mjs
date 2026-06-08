/**
 * Quick parse smoke test (Node). Run from ss/: node scripts/verify-parse.mjs [dir]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FILE_RE = /^llm_(request|response)_(\d{8}_\d{6})_([0-9a-f]{8})\.json$/i;
const dir =
  process.argv[2] ?? join(process.cwd(), "..", "data", "llm_debug");

let files;
try {
  files = readdirSync(dir).filter((f) => FILE_RE.test(f));
} catch (e) {
  console.error("Cannot read dir:", dir, e.message);
  process.exit(1);
}

if (!files.length) {
  console.log("No matching files in", dir);
  process.exit(0);
}

const byId = new Map();
for (const name of files.slice(0, 20)) {
  const m = name.match(FILE_RE);
  const id = m[3].toLowerCase();
  const kind = m[1].toLowerCase();
  const raw = JSON.parse(readFileSync(join(dir, name), "utf8"));
  let entry = byId.get(id) ?? { id, hasRequest: false, hasResponse: false };
  if (kind === "request") {
    entry.hasRequest = true;
    entry.requestTs = raw.timestamp;
  } else {
    entry.hasResponse = true;
    entry.responseTs = raw.timestamp;
  }
  byId.set(id, entry);
}

const entries = [...byId.values()].sort((a, b) => {
  const ta = a.responseTs ?? a.requestTs ?? "";
  const tb = b.responseTs ?? b.requestTs ?? "";
  return String(ta).localeCompare(String(tb));
});

console.log("Parsed", files.length, "files ->", entries.length, "timeline entries");
for (const e of entries.slice(0, 5)) {
  console.log(
    " -",
    e.id,
    e.hasRequest ? "req" : "",
    e.hasResponse ? "res" : "",
  );
}
console.log("OK");
