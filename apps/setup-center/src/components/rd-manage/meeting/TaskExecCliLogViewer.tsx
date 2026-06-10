/**
 * 任务执行 CLI 日志结构化展示（tool / thinking / output 等分类）。
 */
import React from 'react';
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Cog,
  Loader2,
  Terminal,
  Wrench,
} from 'lucide-react';
import type { TaskExecCliLogEntry } from '../../../api/meetingRoomService';

const TOOL_LABEL: Record<string, string> = {
  read: '读取',
  edit: '编辑',
  write: '写入',
  glob: '文件搜索',
  grep: '内容检索',
  shell: '终端',
  list: '列表',
  search: '搜索',
};

function toolLabel(name: string): string {
  const key = String(name || '').split(':')[0].toLowerCase();
  return TOOL_LABEL[key] || name || '工具';
}

function kindMeta(kind: string) {
  switch (kind) {
    case 'think':
      return {
        label: '思考',
        icon: Brain,
        className: 'rd-cli-log-entry--think',
      };
    case 'tool':
      return {
        label: '工具',
        icon: Wrench,
        className: 'rd-cli-log-entry--tool',
      };
    case 'tool_done':
      return {
        label: '完成',
        icon: CheckCircle2,
        className: 'rd-cli-log-entry--tool-done',
      };
    case 'output':
      return {
        label: '输出',
        icon: Terminal,
        className: 'rd-cli-log-entry--output',
      };
    case 'system':
      return {
        label: '系统',
        icon: Cog,
        className: 'rd-cli-log-entry--system',
      };
    case 'success':
    case 'result':
      return {
        label: '结果',
        icon: CheckCircle2,
        className: 'rd-cli-log-entry--success',
      };
    case 'error':
      return {
        label: '错误',
        icon: AlertCircle,
        className: 'rd-cli-log-entry--error',
      };
    case 'meta':
    default:
      return {
        label: '信息',
        icon: Terminal,
        className: 'rd-cli-log-entry--meta',
      };
  }
}

function CliLogEntryRow({ entry }: { entry: TaskExecCliLogEntry }) {
  const kind = String(entry.kind || 'meta');
  const meta = kindMeta(kind);
  const Icon = meta.icon;
  const isCompact = kind === 'meta' || kind === 'system';
  const isDone = kind === 'tool' && entry.status === 'ok';
  const isRunningTool = kind === 'tool' && entry.status === 'running';
  const isFail = kind === 'error' || entry.status === 'fail';
  const rowClass = `${meta.className}${isFail ? ' is-fail' : ''}${isDone ? ' is-done' : ''}${isRunningTool ? ' is-running' : ''}`;

  return (
    <div className={`rd-cli-log-entry ${rowClass}`}>
      <div className="rd-cli-log-entry__head">
        <span className="rd-cli-log-entry__badge">
          <Icon className={`h-3 w-3${isRunningTool ? ' animate-pulse' : ''}`} />
          {kind === 'tool' ? toolLabel(String(entry.tool || '')) : meta.label}
          {isDone ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : null}
        </span>
        {entry.time ? <span className="rd-cli-log-entry__time">{entry.time}</span> : null}
      </div>
      {kind === 'tool' && entry.detail ? (
        <code className="rd-cli-log-entry__detail" title={entry.detail}>
          {entry.detail}
        </code>
      ) : null}
      {!isCompact ? (
        <p className="rd-cli-log-entry__text">{entry.text || '—'}</p>
      ) : (
        <p className="rd-cli-log-entry__text rd-cli-log-entry__text--compact">{entry.text}</p>
      )}
    </div>
  );
}

interface Props {
  entries?: TaskExecCliLogEntry[] | null;
  lines?: string[] | null;
  path?: string;
  loading?: boolean;
  emptyText?: string;
  maxHeightClass?: string;
  footerRef?: React.RefObject<HTMLDivElement | null>;
}

export function TaskExecCliLogViewer({
  entries,
  lines,
  path,
  loading = false,
  emptyText = '等待 Cursor CLI 输出…',
  maxHeightClass = 'max-h-72',
  footerRef,
}: Props) {
  const hasEntries = Array.isArray(entries) && entries.length > 0;
  const hasLines = Array.isArray(lines) && lines.length > 0;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-950/80 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/50 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
          ) : (
            <Terminal className="h-3.5 w-3.5 text-emerald-400" />
          )}
          CLI 执行日志
        </span>
        {path ? (
          <span className="truncate font-mono text-[10px] opacity-70" title={path}>
            {path.split(/[/\\]/).pop()}
          </span>
        ) : null}
      </div>
      <div className={`${maxHeightClass} overflow-y-auto custom-scrollbar p-2 space-y-1.5`}>
        {hasEntries ? (
          entries!.map((entry, idx) => (
            <CliLogEntryRow key={`${idx}-${entry.kind}-${entry.time}-${entry.text?.slice(0, 24)}`} entry={entry} />
          ))
        ) : hasLines ? (
          <pre className="m-0 p-1 text-[11px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all">
            {lines!.map((line, idx) => (
              <div key={`${idx}-${line.slice(0, 24)}`}>{line}</div>
            ))}
          </pre>
        ) : (
          <p className="m-0 px-1 py-6 text-center text-[11px] text-muted-foreground">{emptyText}</p>
        )}
        {footerRef ? <div ref={footerRef} /> : null}
      </div>
    </div>
  );
}
