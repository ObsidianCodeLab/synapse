/**
 * 代码提交 · 试飞结果明细面板（节点详情）
 */
import React from 'react';
import { AlertTriangle, FileText, GitBranch, Plane } from 'lucide-react';

import {
  collectCodeCommitArchives,
  collectCodeCommitFlights,
  type CodeCommitFlightEntry,
} from './codeCommitDisplay';

function StatusBadge({ status }: { status?: string }) {
  const s = String(status || '—');
  const ok = s === 'ok' || s === '成功';
  const failed = s === 'failed' || s === 'timeout' || s === '失败';
  const pending = s === 'pending' || s === 'running';
  const label =
    s === 'ok'
      ? '成功'
      : s === 'failed'
        ? '失败'
        : s === 'timeout'
          ? '超时'
          : s === 'pending'
            ? '进行中'
            : s === 'skipped'
              ? '跳过'
              : s;
  const cls = ok
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : failed
      ? 'bg-red-500/15 text-red-400 border-red-500/30'
      : pending
        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function FlightTaskCard({ entry }: { entry: CodeCommitFlightEntry }) {
  return (
    <article className="rd-code-commit-flight-card">
      <header className="rd-code-commit-flight-card__header">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <StatusBadge status={entry.commitStatus} />
          <span className="text-sm font-medium text-slate-200">{entry.taskNo}</span>
          {entry.featureId ? (
            <span className="font-mono text-[10px] text-muted-foreground">{entry.featureId}</span>
          ) : null}
          {entry.commitHash ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {entry.commitHash.slice(0, 8)}
            </span>
          ) : null}
        </div>
        {entry.flightStatus ? (
          <div className="flex items-center gap-2 shrink-0">
            <Plane className="h-3.5 w-3.5 text-muted-foreground" />
            <StatusBadge status={entry.flightStatus} />
          </div>
        ) : null}
      </header>

      {entry.taskTitle ? (
        <p className="text-[11px] text-muted-foreground mt-1 mb-0">{entry.taskTitle}</p>
      ) : null}
      {entry.commitMessage ? (
        <p className="text-[11px] text-slate-400 mt-1 mb-0">{entry.commitMessage}</p>
      ) : null}

      {entry.flightStatus ? (
        <div className="rd-code-commit-flight-card__flight mt-3">
          {entry.runStateDesc ? (
            <p className="text-[11px] text-slate-300 mb-1">{entry.runStateDesc}</p>
          ) : null}
          {entry.beginDate || entry.endDate ? (
            <p className="text-[10px] text-muted-foreground mb-0">
              {entry.beginDate || '—'} → {entry.endDate || '—'}
            </p>
          ) : null}
          {entry.buildResults.length > 0 ? (
            <ul className="mt-2 space-y-1 mb-0">
              {entry.buildResults.map((item, idx) => (
                <li key={`${entry.id}-br-${idx}`} className="text-[11px] text-red-300/90">
                  <span className="font-medium">{item.resultType}：</span>
                  <span className="whitespace-pre-wrap break-all">{item.resultMsg.slice(0, 800)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {entry.flightError ? (
            <p className="text-[11px] text-red-400 mt-2 mb-0 flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {entry.flightError}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export const CodeCommitFlightPanel: React.FC<{
  display: Record<string, unknown>;
}> = ({ display }) => {
  const flights = collectCodeCommitFlights(display);
  const archives = collectCodeCommitArchives(display);

  if (!flights.length && !archives.some((a) => a.status === 'ok')) {
    return (
      <div className="rd-code-commit-empty">
        <GitBranch className="h-5 w-5 text-muted-foreground/60" />
        <p>暂无提交与试飞记录，请等待代码提交节点执行。</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {archives.length > 0 ? (
        <section>
          <h4 className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            归档产物
          </h4>
          <ul className="rd-code-commit-archive-list">
            {archives.map((art) => (
              <li key={art.name} className="rd-code-commit-archive-row">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono text-[11px] text-slate-300">{art.name}</span>
                <StatusBadge status={art.status === 'ok' ? 'ok' : art.status === 'pending' ? 'pending' : 'skipped'} />
                {art.path ? (
                  <code className="text-[10px] text-muted-foreground truncate" title={art.path}>
                    {art.path}
                  </code>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {flights.length > 0 ? (
        <section className="space-y-3">
          <h4 className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Plane className="h-3.5 w-3.5" />
            子单试飞明细
          </h4>
          {flights.map((entry) => (
            <FlightTaskCard key={entry.id} entry={entry} />
          ))}
        </section>
      ) : null}
    </div>
  );
};
