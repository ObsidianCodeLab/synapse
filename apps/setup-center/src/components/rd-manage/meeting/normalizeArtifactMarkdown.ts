/**
 * 产出物 Markdown 预览预处理：修复 GFM 表格常见解析失败（函数级方案.md 等）。
 */

const TABLE_ROW_RE = /^\|.+\|$/;
const TABLE_SEP_RE = /^\|[\s\-:|]+\|$/;
const HEADING_RE = /^#{1,6}\s+/;
const BOLD_ONLY_RE = /^\*\*.+\*\*\s*$/;
const EMPTY_PLACEHOLDER_RE = /^（无）$/;

function isTableRow(line: string): boolean {
  const t = line.trim();
  return TABLE_ROW_RE.test(t) && !TABLE_SEP_RE.test(t);
}

function isSeparatorRow(line: string): boolean {
  return TABLE_SEP_RE.test(line.trim());
}

function countTableColumns(headerLine: string): number {
  return splitTableCells(headerLine).filter((_, i, arr) => i > 0 && i < arr.length - 1).length;
}

/** 按未转义的 | 切分表格行（保留首尾空段） */
function splitTableCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '|' && (i === 0 || line[i - 1] !== '\\')) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function buildPlaceholderRow(cols: number): string {
  const cells = Array.from({ length: cols }, (_, i) => (i === 0 ? '（无）' : ''));
  return `| ${cells.join(' | ')} |`;
}

function repairTableRow(line: string, expectedCols: number): string {
  const parts = splitTableCells(line);
  const inner = parts.slice(1, -1).map((c) => c.trim());
  if (inner.length === expectedCols) {
    return `| ${inner.join(' | ')} |`;
  }
  if (inner.length > expectedCols) {
    const head = inner.slice(0, expectedCols - 1);
    const tail = inner.slice(expectedCols - 1).join('\\|');
    return `| ${[...head, tail].join(' | ')} |`;
  }
  while (inner.length < expectedCols) inner.push('');
  return `| ${inner.join(' | ')} |`;
}

function needsBlankLineBeforeTable(prevLine: string | undefined): boolean {
  if (!prevLine || prevLine.trim() === '') return false;
  const t = prevLine.trim();
  if (isTableRow(t) || isSeparatorRow(t)) return false;
  return true;
}

/**
 * 规范化 Markdown，提高 remark-gfm 表格解析成功率。
 */
export function normalizeArtifactMarkdown(md: string): string {
  const lines = (md || '').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isTableRow(trimmed) && i + 1 < lines.length && isSeparatorRow(lines[i + 1].trim())) {
      if (needsBlankLineBeforeTable(out[out.length - 1])) {
        out.push('');
      }

      const cols = countTableColumns(trimmed);
      out.push(repairTableRow(line, cols));
      out.push(lines[i + 1]);
      i += 2;

      while (i < lines.length) {
        const bodyTrim = lines[i].trim();
        if (bodyTrim === '') {
          // 函数级方案.md 常在分隔行与数据行、数据行之间插入空行；仅当下一条非空行仍是数据行时跳过
          let k = i + 1;
          while (k < lines.length && lines[k].trim() === '') k += 1;
          const nextTrim = k < lines.length ? lines[k].trim() : '';
          const nextIsDataRow =
            Boolean(nextTrim) &&
            isTableRow(nextTrim) &&
            !(k + 1 < lines.length && isSeparatorRow(lines[k + 1].trim()));
          if (nextIsDataRow) {
            i += 1;
            continue;
          }
          break;
        }
        if (EMPTY_PLACEHOLDER_RE.test(bodyTrim)) {
          out.push(buildPlaceholderRow(cols));
          i += 1;
          continue;
        }
        if (HEADING_RE.test(bodyTrim) || BOLD_ONLY_RE.test(bodyTrim)) {
          break;
        }
        if (!isTableRow(bodyTrim)) {
          break;
        }
        out.push(repairTableRow(lines[i], cols));
        i += 1;
      }
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join('\n');
}
