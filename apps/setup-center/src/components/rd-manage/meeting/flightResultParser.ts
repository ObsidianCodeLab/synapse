/**
 * 试飞 buildResult / 试飞结果.md 解析（代码提交节点展示用）
 */

export type BuildResultContentKind = 'empty' | 'text' | 'url' | 'html';
export type BuildResultKind = 'compile' | 'code_check' | 'legacy';

export interface BuildResultAlarm {
  fileName?: string;
  functionName?: string;
  errorArrow?: string;
  ccnCount?: number;
  benchmarkCcnCount?: number;
}

export interface BuildResultInput {
  resultType: string;
  resultMsg: string;
  kind?: string;
  nodeStateDesc?: string;
  alarms?: BuildResultAlarm[];
}

export interface ParsedBuildTable {
  caption?: string;
  headers: string[];
  rows: string[][];
  /** 与 rows 对齐：标红/待整改行 */
  violationRows?: boolean[];
  /** [rowIndex, colIndex] 标红单元格 */
  highlightCells?: Array<[number, number]>;
  /** 本表是否仅含待整改项（已过滤非标红行） */
  violationOnly?: boolean;
}

export interface ParsedBuildResult {
  resultType: string;
  kind: BuildResultContentKind;
  /** 折叠态一行摘要 */
  preview: string;
  plainText: string;
  url?: string;
  tables: ParsedBuildTable[];
  documentTitle?: string;
  /** SOURCEMONITOR / Lizard 等待整改条目数 */
  violationCount?: number;
  buildKind?: BuildResultKind;
  nodeStateDesc?: string;
  alarms?: BuildResultAlarm[];
}

export interface FlightReportTaskSection {
  heading: string;
  taskNo: string;
  featureId: string;
  flightStatus: string;
  taskId: string;
  beginDate: string;
  endDate: string;
  buildStateDesc: string;
  error: string;
  buildResults: ParsedBuildResult[];
}

export interface ParsedFlightReport {
  overallStatus: string;
  overallError: string;
  tasks: FlightReportTaskSection[];
}

const URL_RE = /^https?:\/\/\S+$/i;

const GENERIC_BUILD_STATUS = new Set(['构建失败', '构建成功', '构建中']);

export function isGenericBuildStatus(text: string | undefined | null): boolean {
  const t = String(text || '').trim();
  return !t || GENERIC_BUILD_STATUS.has(t);
}

export function resolveBuildFailureReason(item: {
  nodeStateDesc?: string;
  plainText?: string;
  preview?: string;
  buildKind?: BuildResultKind;
  alarms?: BuildResultAlarm[];
  tables?: ParsedBuildTable[];
}): string {
  const desc = String(item.nodeStateDesc || '').trim();
  if (desc && !isGenericBuildStatus(desc)) return desc;

  if (item.buildKind === 'compile') {
    for (const candidate of [item.plainText, item.preview]) {
      const text = String(candidate || '').trim();
      if (text && !isGenericBuildStatus(text)) return text;
    }
    const desc = String(item.nodeStateDesc || '').trim();
    if (desc && !isGenericBuildStatus(desc)) return stripHtmlToText(desc, 8000);
    return item.plainText?.trim() || item.preview?.trim() || '';
  }

  if (item.buildKind === 'code_check' && item.alarms?.length) return '';

  if (item.buildKind === 'legacy' && item.tables?.length) return '';

  for (const candidate of [item.plainText, item.preview]) {
    const text = String(candidate || '').trim();
    if (text && !isGenericBuildStatus(text)) return text;
  }
  return '';
}

export function classifyBuildResultMessage(msg: string): BuildResultContentKind {
  const raw = (msg || '').trim();
  if (!raw) return 'empty';
  if (URL_RE.test(raw)) return 'url';
  if (/<\s*(html|table|head|body|div|span|p|br|meta)\b/i.test(raw)) return 'html';
  return 'text';
}

export function stripHtmlToText(html: string, maxLen = 400): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen)}…`;
  return text;
}

function cellText(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

/** SOURCEMONITOR/Lizard：标红单元格（class=ccn 或 inline 红色） */
export function isViolationMarkedCell(el: Element): boolean {
  const cls = (el.getAttribute('class') || '').toLowerCase();
  if (/\bccn\b/.test(cls)) return true;
  const style = (el.getAttribute('style') || '').toLowerCase();
  if (/color\s*:\s*red|background\s*:\s*red|#f00|#ff0000|rgb\(\s*255\s*,\s*0\s*,\s*0/.test(style)) {
    return true;
  }
  if (el.tagName.toLowerCase() === 'font') {
    const color = (el.getAttribute('color') || '').toLowerCase();
    if (color === 'red' || color === '#ff0000' || color === '#f00') return true;
  }
  return false;
}

export function isViolationMarkedRow(tr: Element): boolean {
  const cells = Array.from(tr.querySelectorAll('td'));
  if (!cells.length) return false;
  if (cells.some((cell) => isViolationMarkedCell(cell))) return true;
  const rowStyle = (tr.getAttribute('style') || '').toLowerCase();
  return /color\s*:\s*red|background\s*:\s*red|#f00|#ff0000/.test(rowStyle);
}

interface ParsedTableRow {
  cells: string[];
  isViolation: boolean;
  highlightCols: number[];
}

function parseTableRow(tr: Element): ParsedTableRow | null {
  const cellEls = Array.from(tr.querySelectorAll('th, td'));
  if (!cellEls.length) return null;
  const cells = cellEls.map((cell) => cellText(cell));
  if (!cells.some(Boolean)) return null;
  const highlightCols: number[] = [];
  cellEls.forEach((cell, idx) => {
    if (isViolationMarkedCell(cell)) highlightCols.push(idx);
  });
  return {
    cells,
    isViolation: isViolationMarkedRow(tr),
    highlightCols,
  };
}

function countViolations(tables: ParsedBuildTable[]): number {
  return tables.reduce((sum, table) => {
    if (table.violationRows?.length) {
      return sum + table.violationRows.filter(Boolean).length;
    }
    return sum + table.rows.length;
  }, 0);
}

export function parseHtmlBuildReport(html: string): {
  documentTitle?: string;
  tables: ParsedBuildTable[];
  plainText: string;
  violationCount: number;
} {
  const fallbackPlain = stripHtmlToText(html, 2000);
  const fallback = {
    tables: [] as ParsedBuildTable[],
    plainText: fallbackPlain,
    violationCount: 0,
  };
  if (typeof DOMParser === 'undefined') return fallback;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const documentTitle = cellText(doc.querySelector('title') || doc.documentElement);
    const tables: ParsedBuildTable[] = [];

    doc.querySelectorAll('table').forEach((table, idx) => {
      const captionEl = table.querySelector('caption');
      const caption = captionEl ? cellText(captionEl) : undefined;

      const headerCells = Array.from(table.querySelectorAll('thead tr th, thead tr td'));
      let headers = headerCells.map((cell) => cellText(cell)).filter(Boolean);
      const bodyRowEls = table.querySelectorAll('tbody tr');
      const rowEls = bodyRowEls.length
        ? Array.from(bodyRowEls)
        : Array.from(table.querySelectorAll('tr')).filter((tr) => !tr.querySelector('th'));

      const parsedRows = rowEls
        .map((tr) => parseTableRow(tr))
        .filter((row): row is ParsedTableRow => row !== null);
      if (!parsedRows.length) return;

      if (!headers.length) {
        const headerTr = Array.from(table.querySelectorAll('tr')).find((tr) =>
          Boolean(tr.querySelector('th')),
        );
        if (headerTr) {
          headers = Array.from(headerTr.querySelectorAll('th, td'))
            .map((cell) => cellText(cell))
            .filter(Boolean);
        }
      }
      if (!headers.length && parsedRows[0]?.cells.length) {
        headers = ['NCSS', 'CCN', 'Function Name and Location'].slice(0, parsedRows[0].cells.length);
      }

      const hasViolationMarks = parsedRows.some((row) => row.isViolation);
      const visibleRows = hasViolationMarks
        ? parsedRows.filter((row) => row.isViolation)
        : parsedRows;

      if (!visibleRows.length) return;

      const violationRows = visibleRows.map((row) => row.isViolation);
      const highlightCells: Array<[number, number]> = [];
      visibleRows.forEach((row, rowIdx) => {
        row.highlightCols.forEach((colIdx) => {
          highlightCells.push([rowIdx, colIdx]);
        });
      });

      tables.push({
        caption:
          caption ||
          (hasViolationMarks
            ? '待整改项'
            : idx === 0 && documentTitle
              ? documentTitle
              : undefined),
        headers,
        rows: visibleRows.map((row) => row.cells),
        violationRows,
        highlightCells,
        violationOnly: hasViolationMarks,
      });
    });

    const violationCount = countViolations(tables);

    return {
      documentTitle: documentTitle || undefined,
      tables,
      plainText: violationCount > 0 ? `${violationCount} 项待整改` : fallbackPlain,
      violationCount,
    };
  } catch {
    return fallback;
  }
}

export function parseBuildResult(resultType: string, resultMsg: string): ParsedBuildResult {
  const type = (resultType || '检查项').trim() || '检查项';
  const msg = (resultMsg || '').trim();
  const kind = classifyBuildResultMessage(msg);

  if (kind === 'empty') {
    return { resultType: type, kind, preview: '（无明细）', plainText: '', tables: [] };
  }
  if (kind === 'url') {
    return {
      resultType: type,
      kind,
      preview: msg,
      plainText: msg,
      url: msg,
      tables: [],
    };
  }
  if (kind === 'html') {
    const parsed = parseHtmlBuildReport(msg);
    const preview =
      parsed.violationCount > 0
        ? `${parsed.violationCount} 项待整改`
        : parsed.tables.length > 0
          ? `${parsed.tables.length} 张表`
          : stripHtmlToText(msg, 120) || parsed.documentTitle || 'HTML 构建报告';
    return {
      resultType: type,
      kind,
      preview,
      plainText: parsed.plainText,
      tables: parsed.tables,
      documentTitle: parsed.documentTitle,
      violationCount: parsed.violationCount,
    };
  }

  const preview = msg.length > 160 ? `${msg.slice(0, 160)}…` : msg;
  return {
    resultType: type,
    kind,
    preview,
    plainText: msg,
    tables: [],
  };
}

export function formatAlarmCcn(alarm: BuildResultAlarm): string {
  const ccn = alarm.ccnCount;
  const bench = alarm.benchmarkCcnCount;
  if (ccn != null && bench != null) return `CCN(${bench}↗${ccn})`;
  if (ccn != null) return `CCN=${ccn}`;
  return '';
}

/** 解析后端 buildResult 行（含 code_check / compile 结构化字段） */
export function parseBuildResultRow(row: BuildResultInput): ParsedBuildResult {
  const resultType = (row.resultType || '检查项').trim() || '检查项';
  const resultMsg = (row.resultMsg || '').trim();
  const rowKind = String(row.kind || '').trim();

  if (rowKind === 'code_check') {
    const alarms = Array.isArray(row.alarms) ? row.alarms : [];
    const reason = String(row.nodeStateDesc || '').trim();
    const preview =
      alarms.length > 0
        ? `${alarms.length} 项待整改`
        : reason && !isGenericBuildStatus(reason)
          ? reason.slice(0, 120)
          : resultMsg
            ? resultMsg.slice(0, 120)
            : '检查未通过';
    return {
      resultType,
      kind: 'text',
      preview,
      plainText: resultMsg || String(row.nodeStateDesc || ''),
      tables: [],
      violationCount: alarms.length,
      buildKind: 'code_check',
      nodeStateDesc: row.nodeStateDesc,
      alarms,
    };
  }

  const parsed = parseBuildResult(resultType, resultMsg);
  if (rowKind === 'compile') {
    const compileParsed = { ...parsed, buildKind: 'compile' as const, nodeStateDesc: row.nodeStateDesc };
    if (compileParsed.kind === 'html' && compileParsed.plainText && !compileParsed.plainText.includes('error:')) {
      compileParsed.kind = 'text';
      compileParsed.plainText = compileParsed.plainText.trim() || resultMsg;
      compileParsed.preview =
        compileParsed.plainText.length > 160
          ? `${compileParsed.plainText.slice(0, 160)}…`
          : compileParsed.plainText;
    }
    return compileParsed;
  }
  return { ...parsed, buildKind: 'legacy' };
}

function readBulletValue(line: string, prefix: string): string {
  const t = line.trim();
  if (!t.startsWith(prefix)) return '';
  return t.slice(prefix.length).trim();
}

/** 解析归档 ``试飞结果.md``（与后端 format_flight_result_report 对齐） */
export function parseFlightReportMarkdown(md: string): ParsedFlightReport {
  const lines = (md || '').split(/\r?\n/);
  let overallStatus = '';
  let overallError = '';
  const tasks: FlightReportTaskSection[] = [];

  let section: FlightReportTaskSection | null = null;
  let inBuildDetails = false;

  const flush = () => {
    if (section) tasks.push(section);
    section = null;
    inBuildDetails = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('# ') && !line.startsWith('## ')) continue;

    if (line.startsWith('- 总体试飞状态：')) {
      overallStatus = readBulletValue(line, '- 总体试飞状态：');
      continue;
    }
    if (line.startsWith('- 报错：')) {
      overallError = readBulletValue(line, '- 报错：');
      continue;
    }

    if (line.startsWith('## ')) {
      flush();
      const body = line.slice(3).trim();
      const [taskNo, featureId = ''] = body.split('·').map((s) => s.trim());
      section = {
        heading: body,
        taskNo,
        featureId,
        flightStatus: '',
        taskId: '',
        beginDate: '',
        endDate: '',
        buildStateDesc: '',
        error: '',
        buildResults: [],
      };
      continue;
    }

    if (!section) continue;

    if (line.startsWith('- 试飞状态：')) {
      section.flightStatus = readBulletValue(line, '- 试飞状态：');
      continue;
    }
    if (line.startsWith('- taskId：')) {
      section.taskId = readBulletValue(line, '- taskId：');
      continue;
    }
    if (line.startsWith('- 开始：')) {
      section.beginDate = readBulletValue(line, '- 开始：');
      continue;
    }
    if (line.startsWith('- 结束：')) {
      section.endDate = readBulletValue(line, '- 结束：');
      continue;
    }
    if (line.startsWith('- 构建状态：')) {
      section.buildStateDesc = readBulletValue(line, '- 构建状态：');
      continue;
    }
    if (line.startsWith('- 构建明细：')) {
      inBuildDetails = true;
      continue;
    }
    if (line.startsWith('- 错误：')) {
      section.error = readBulletValue(line, '- 错误：');
      inBuildDetails = false;
      continue;
    }

    if (inBuildDetails && line.startsWith('  - ')) {
      const item = line.slice(4).trim();
      const sep = item.indexOf('：');
      const resultType = sep >= 0 ? item.slice(0, sep).trim() : '检查项';
      const resultMsg = sep >= 0 ? item.slice(sep + 1).trim() : item;
      section.buildResults.push(parseBuildResult(resultType, resultMsg));
    }
  }
  flush();

  return { overallStatus, overallError, tasks };
}

export function collectFlightOverview(display: Record<string, unknown>): {
  status: string;
  error: string;
  commitOk: number;
  commitTotal: number;
  flightOk: number;
} {
  const flight = (display.flight as Record<string, unknown>) || {};
  const summary = (display.summary as Record<string, unknown>) || {};
  return {
    status: String(flight.status || display.status || ''),
    error: String(flight.error || ''),
    commitOk: Number(summary.commit_ok || 0),
    commitTotal: Number(summary.total || 0),
    flightOk: Number(summary.flight_ok || 0),
  };
}
