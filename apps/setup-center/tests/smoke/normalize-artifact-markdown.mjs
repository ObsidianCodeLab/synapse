/**
 * Smoke: normalizeArtifactMarkdown merges blank-line-separated GFM table body rows.
 * Run: node tests/smoke/normalize-artifact-markdown.mjs [path/to/函数级方案.md]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { normalizeArtifactMarkdown } = await import(
  pathToFileURL(
    path.resolve('src/components/rd-manage/meeting/normalizeArtifactMarkdown.ts'),
  ).href
);

const TABLE_ROW_RE = /^\|.+\|$/;
const TABLE_SEP_RE = /^\|[\s\-:|]+\|$/;

function isTableRow(line) {
  const t = line.trim();
  return TABLE_ROW_RE.test(t) && !TABLE_SEP_RE.test(t);
}
function isSeparatorRow(line) {
  return TABLE_SEP_RE.test(line.trim());
}

function countTableBodyRows(md) {
  let n = 0;
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!isTableRow(lines[i].trim()) || !isSeparatorRow(lines[i + 1]?.trim() || '')) continue;
    for (let j = i + 2; j < lines.length; j++) {
      const t = lines[j].trim();
      if (!t) break;
      if (!isTableRow(t)) break;
      n += 1;
    }
  }
  return n;
}

const sample = `| A | B |
|---|---|

| 1 | 2 |


| 3 | 4 |

## next`;

const sampleOut = normalizeArtifactMarkdown(sample);
if (sampleOut.split('\n').filter((l) => isTableRow(l.trim())).length < 3) {
  console.error('FAIL: sample table rows not merged');
  process.exit(1);
}

const fixture =
  process.argv[2] ||
  path.join(
    process.env.HOME || process.env.USERPROFILE || '',
    '.synapse/work/21881451/archive/需求设计/func_solution/函数级方案.md',
  );

if (fs.existsSync(fixture)) {
  const raw = fs.readFileSync(fixture, 'utf8');
  const norm = normalizeArtifactMarkdown(raw);
  const rawRows = countTableBodyRows(raw);
  const normRows = countTableBodyRows(norm);
  if (normRows <= rawRows) {
    console.error(`FAIL: expected more body rows after normalize (${rawRows} -> ${normRows})`);
    process.exit(1);
  }
  console.log(`fixture OK: ${normRows} table body rows (was ${rawRows})`);
}

console.log('normalize-artifact-markdown smoke passed');
