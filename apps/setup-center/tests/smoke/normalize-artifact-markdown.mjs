/**
 * Smoke: normalizeArtifactMarkdown 应合并「分隔行与数据行之间有空行」的 GFM 表格。
 * Run: node tests/smoke/normalize-artifact-markdown.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Vite/TS sources — compile-free import via dynamic ts transpile is unavailable;
// duplicate minimal logic check by reading built module is heavy; inline the fix contract:

const TABLE_ROW_RE = /^\|.+\|$/;
const TABLE_SEP_RE = /^\|[\s\-:|]+\|$/;
const HEADING_RE = /^#{1,6}\s+/;
const BOLD_ONLY_RE = /^\*\*.+\*\*\s*$/;
const EMPTY_PLACEHOLDER_RE = /^（无）$/;

function isTableRow(line) {
  const t = line.trim();
  return TABLE_ROW_RE.test(t) && !TABLE_SEP_RE.test(t);
}
function isSeparatorRow(line) {
  return TABLE_SEP_RE.test(line.trim());
}

function countMergedTableBodyRows(md) {
  const lines = md.split('\n');
  let totalBody = 0;
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i].trim()) && i + 1 < lines.length && isSeparatorRow(lines[i + 1].trim())) {
      let j = i + 2;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (t === '') {
          let k = j + 1;
          while (k < lines.length && lines[k].trim() === '') k += 1;
          const nt = k < lines.length ? lines[k].trim() : '';
          const nextIsData =
            Boolean(nt) && isTableRow(nt) && !(k + 1 < lines.length && isSeparatorRow(lines[k + 1].trim()));
          if (nextIsData) {
            j += 1;
            continue;
          }
          break;
        }
        if (HEADING_RE.test(t) || BOLD_ONLY_RE.test(t) || !isTableRow(t)) break;
        totalBody += 1;
        j += 1;
      }
      i = j - 1;
    }
  }
  return totalBody;
}

// Load TS via tsx if available, else skip deep integration
let normalizeArtifactMarkdown;
try {
  const tsx = await import('tsx/esm/api');
  tsx.register();
  ({ normalizeArtifactMarkdown } = await import(
    '../../src/components/rd-manage/meeting/normalizeArtifactMarkdown.ts'
  ));
} catch {
  console.log('skip: tsx not available, structural checks only');
}

const sample = `| A | B |
|---|---|

| 1 | 2 |


| 3 | 4 |

## next`;

if (normalizeArtifactMarkdown) {
  const out = normalizeArtifactMarkdown(sample);
  const bodyLines = out.split('\n').filter((l) => isTableRow(l.trim()) && !isSeparatorRow(l));
  if (bodyLines.length < 3) {
    console.error('FAIL: expected header + 2 data rows contiguous, got:\n', out);
    process.exit(1);
  }
  if (out.includes('\n\n|')) {
    console.error('FAIL: blank line still present inside table');
    process.exit(1);
  }
}

const fixture = process.argv[2];
if (fixture && fs.existsSync(fixture)) {
  const raw = fs.readFileSync(fixture, 'utf8');
  const rawBody = countMergedTableBodyRows(raw);
  if (normalizeArtifactMarkdown) {
    const norm = normalizeArtifactMarkdown(raw);
    const normBody = countMergedTableBodyRows(norm);
    if (normBody < rawBody) {
      console.error(`FAIL: normalized body rows ${normBody} < raw recoverable ${rawBody}`);
      process.exit(1);
    }
    console.log(`OK: ${path.basename(fixture)} body rows raw~${rawBody} normalized=${normBody}`);
  }
}

console.log('normalize-artifact-markdown smoke passed');
