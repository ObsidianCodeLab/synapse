/**
 * 函数级方案 · 改造内容：将 content_markdown 解析为结构化区块并分块渲染
 */
import React, { useMemo } from 'react';
import {
  Box,
  Code2,
  GitBranch,
  Layers,
  Sparkles,
  Table2,
  type LucideIcon,
} from 'lucide-react';

import { ReviewMarkdown } from './ReviewMarkdown';

type SectionKind = 'meta' | 'table' | 'code' | 'prose';

export interface PlanContentSection {
  id: string;
  title: string;
  kind: SectionKind;
  bullets?: { label: string; value: string }[];
  headers?: string[];
  rows?: string[][];
  code?: string;
  markdown?: string;
}

const BULLET_FIELD_RE =
  /^-\s+(?:\*\*(.+?)\*\*[：:]\s*(.*)|([^：:*]+)[：:]\s*(.*))$/;

const MODULE_HEADING_RE = /^1\.7\.\d+\s+/;

function stripModuleHeading(title: string): string {
  const t = title.trim();
  if (MODULE_HEADING_RE.test(t)) return t.replace(MODULE_HEADING_RE, '').trim();
  if (/^#{1,4}\s/.test(t)) return t.replace(/^#{1,4}\s+/, '').trim();
  return t;
}

const HIDDEN_TABLE_HEADERS = ['所属类文件'];

function shouldHideTableColumn(header: string): boolean {
  const h = header.trim();
  return HIDDEN_TABLE_HEADERS.some((x) => h === x || h.includes(x));
}

function omitHiddenTableColumns(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const keepIndices = headers
    .map((h, i) => (shouldHideTableColumn(h) ? -1 : i))
    .filter((i) => i >= 0);
  if (keepIndices.length === headers.length) {
    return { headers, rows };
  }
  return {
    headers: keepIndices.map((i) => headers[i]),
    rows: rows.map((row) => keepIndices.map((i) => row[i] ?? '')),
  };
}

function parseTableLines(lines: string[]): { headers: string[]; rows: string[][] } | null {
  const tableLines = lines.filter((l) => l.trim().startsWith('|'));
  if (tableLines.length < 2) return null;
  const parseRow = (line: string) =>
    line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
  const headers = parseRow(tableLines[0]);
  if (!headers.length) return null;
  const rows = tableLines
    .slice(2)
    .filter((l) => !/^\|[\s\-:|]+\|$/.test(l.trim()))
    .map(parseRow)
    .filter((r) => r.some((c) => c));
  return rows.length ? { headers, rows } : null;
}

function parseBullets(body: string): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  for (const line of body.split('\n')) {
    const m = BULLET_FIELD_RE.exec(line.trim());
    if (!m) continue;
    const label = (m[1] || m[3] || '').trim();
    const value = (m[2] || m[4] || '').trim();
    if (label && value) items.push({ label, value });
  }
  return items;
}

function extractCodeBlocks(body: string): string {
  const blocks: string[] = [];
  const re = /```[\w]*\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const block = (m[1] || '').trim();
    if (block) blocks.push(block);
  }
  return blocks.join('\n\n');
}

function classifySection(title: string, body: string): PlanContentSection {
  const id = `${title || 'section'}-${body.slice(0, 24)}`;
  const lines = body.split('\n');
  const table = parseTableLines(lines);
  if (table) {
    const trimmed = omitHiddenTableColumns(table.headers, table.rows);
    return { id, title, kind: 'table', headers: trimmed.headers, rows: trimmed.rows };
  }
  const code = extractCodeBlocks(body);
  if (code) {
    return { id, title, kind: 'code', code };
  }
  const bullets = parseBullets(body);
  const nonEmptyLines = lines.filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (bullets.length >= 2 || (bullets.length > 0 && bullets.length >= nonEmptyLines.length * 0.5)) {
    return { id, title, kind: 'meta', bullets };
  }
  return { id, title, kind: 'prose', markdown: body.trim() };
}

export function parsePlanContentMarkdown(markdown: string): PlanContentSection[] {
  const raw = (markdown || '').trim();
  if (!raw) return [];

  const sections: { title: string; body: string }[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join('\n').trim();
    const title = stripModuleHeading(currentTitle);
    if (title || body) sections.push({ title, body });
  };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    const h = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    const bold = /^\*\*(.+?)\*\*\s*$/.exec(trimmed);
    if (h || bold) {
      flush();
      currentTitle = (h?.[2] || bold?.[1] || '').trim();
      currentLines = [];
      continue;
    }
    currentLines.push(line);
  }
  flush();

  return sections
    .filter((s) => s.body || (s.title && !MODULE_HEADING_RE.test(s.title)))
    .map((s) => classifySection(s.title || '详情', s.body))
    .filter((s) => {
      if (s.kind === 'meta') return (s.bullets?.length ?? 0) > 0;
      if (s.kind === 'table') return (s.rows?.length ?? 0) > 0;
      if (s.kind === 'code') return Boolean(s.code?.trim());
      return Boolean(s.markdown?.trim());
    });
}

function sectionStyle(title: string): { icon: LucideIcon; accent: string; chip: string } {
  const t = title.trim();
  if (t.includes('概要') || t.includes('模块')) {
    return {
      icon: Layers,
      accent: 'from-violet-400 to-purple-500',
      chip: 'bg-violet-500/15 text-violet-200 border-violet-500/30',
    };
  }
  if (t.includes('函数设计') || t.includes('清单') || t.includes('表格')) {
    return {
      icon: Table2,
      accent: 'from-cyan-400 to-blue-500',
      chip: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30',
    };
  }
  if (t.includes('伪代码') || t.includes('代码')) {
    return {
      icon: Code2,
      accent: 'from-[#00ffb2] to-teal-500',
      chip: 'bg-[rgba(0,217,165,0.15)] text-[#5efecf] border-[rgba(0,255,178,0.28)]',
    };
  }
  if (t.includes('调用') || t.includes('关系')) {
    return {
      icon: GitBranch,
      accent: 'from-amber-400 to-orange-500',
      chip: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
    };
  }
  return {
    icon: Sparkles,
    accent: 'from-fuchsia-400 to-pink-500',
    chip: 'bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/30',
  };
}

const MetaGrid: React.FC<{ bullets: { label: string; value: string }[] }> = ({ bullets }) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
    {bullets.map((b) => (
      <div
        key={`${b.label}-${b.value}`}
        className="group/meta rounded-lg border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-transparent px-3 py-2.5 transition-colors hover:border-violet-400/25 hover:from-violet-500/[0.06]"
      >
        <div className="text-[11px] font-medium text-foreground/80">{b.label}</div>
        <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{b.value}</div>
      </div>
    ))}
  </div>
);

const FuncTable: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <div className="overflow-x-auto rounded-lg border border-cyan-500/20 custom-scrollbar">
    <table className="w-full min-w-[420px] border-collapse text-[12px]">
      <thead>
        <tr className="bg-gradient-to-r from-cyan-500/15 via-blue-500/10 to-violet-500/10">
          {headers.map((h) => (
            <th
              key={h}
              className="whitespace-nowrap border-b border-cyan-500/20 px-3 py-2.5 text-left text-[11px] font-semibold text-cyan-100/95"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr
            key={ri}
            className="border-b border-white/[0.04] transition-colors even:bg-white/[0.02] hover:bg-cyan-500/[0.04]"
          >
            {headers.map((_, ci) => {
              const val = (row[ci] || '').trim() || '—';
              return (
                <td key={ci} className="px-3 py-2.5 align-top text-[11px] leading-relaxed text-muted-foreground">
                  {val}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CodeBlock: React.FC<{ code: string }> = ({ code }) => (
  <div className="overflow-hidden rounded-lg border border-[rgba(0,255,178,0.22)] bg-[#0a0f0d] shadow-[inset_0_1px_0_rgba(0,255,178,0.08),0_8px_24px_rgba(0,0,0,0.35)]">
    <div className="flex items-center gap-2 border-b border-[rgba(0,255,178,0.12)] bg-[rgba(0,217,165,0.06)] px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-[#00ffb2]/80" />
      <span className="h-2 w-2 rounded-full bg-cyan-400/50" />
      <span className="h-2 w-2 rounded-full bg-violet-400/40" />
      <span className="ml-1 text-[10px] font-mono text-[#5efecf]/80">pseudocode</span>
    </div>
    <pre className="max-h-[320px] overflow-auto custom-scrollbar p-4 text-[11.5px] leading-relaxed text-[#c8ffe8]/95 font-mono">
      {code}
    </pre>
  </div>
);

const ContentSection: React.FC<{ section: PlanContentSection }> = ({ section }) => {
  const { icon: Icon, accent, chip } = sectionStyle(section.title);
  return (
    <article className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-black/15">
      <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-gradient-to-b ${accent}`} />
      <div className="pl-4 pr-4 py-3.5">
        <header className="mb-3 flex flex-wrap items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br ${chip}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <h4 className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight text-foreground">
            {section.title}
          </h4>
          {section.kind === 'table' && section.rows ? (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${chip}`}>
              {section.rows.length} 项
            </span>
          ) : null}
        </header>
        {section.kind === 'meta' && section.bullets ? <MetaGrid bullets={section.bullets} /> : null}
        {section.kind === 'table' && section.headers && section.rows ? (
          <FuncTable headers={section.headers} rows={section.rows} />
        ) : null}
        {section.kind === 'code' && section.code ? <CodeBlock code={section.code} /> : null}
        {section.kind === 'prose' && section.markdown ? (
          <div className="rounded-lg border border-border/40 bg-black/10 px-3 py-2">
            <ReviewMarkdown content={section.markdown} compact />
          </div>
        ) : null}
      </div>
    </article>
  );
};

export const PlanTransformationContent: React.FC<{ markdown: string }> = ({ markdown }) => {
  const sections = useMemo(() => parsePlanContentMarkdown(markdown), [markdown]);

  if (!sections.length) {
    return (
      <div className="rounded-xl border border-border/40 bg-black/10 px-4 py-3">
        <ReviewMarkdown content={markdown} compact />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] via-transparent to-[rgba(0,217,165,0.04)]">
      <div className="flex items-center gap-2 border-b border-violet-500/15 bg-violet-500/[0.07] px-4 py-2.5">
        <Box className="h-4 w-4 text-violet-300" />
        <span className="text-[12px] font-semibold text-violet-100/95">改造内容</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{sections.length} 个区块</span>
      </div>
      <div className="space-y-3 p-4">
        {sections.map((section) => (
          <ContentSection key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
};
