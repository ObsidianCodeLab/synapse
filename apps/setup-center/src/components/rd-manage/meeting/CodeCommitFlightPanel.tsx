/**
 * 代码提交 · 试飞结果明细面板（节点详情）
 */
import React, { useMemo } from 'react';
import { ChevronDown, ExternalLink, FileText, GitBranch } from 'lucide-react';

import {
  collectCodeCommitArchives,
  collectCodeCommitFlights,
  type CodeCommitFlightEntry,
} from './codeCommitDisplay';
import {
  formatAlarmCcn,
  parseBuildResultRow,
  resolveBuildFailureReason,
  type BuildResultAlarm,
  type ParsedBuildResult,
  type ParsedBuildTable,
} from './flightResultParser';

function BuildResultTable({ table }: { table: ParsedBuildTable }) {
  if (!table.headers.length && !table.rows.length) return null;
  const headers = table.headers.length ? table.headers : table.rows[0] || [];
  const rows = table.headers.length ? table.rows : table.rows.slice(1);
  const highlightSet = new Set(
    (table.highlightCells || []).map(([row, col]) => `${row}:${col}`),
  );
  const violationCount = table.violationRows?.filter(Boolean).length ?? rows.length;
  const caption =
    table.caption ||
    (table.violationOnly ? `待整改项（${violationCount}）` : undefined);

  return (
    <div className="rd-flight-build-table-wrap">
      {caption ? <p className="rd-flight-build-table__caption">{caption}</p> : null}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="rd-flight-build-table">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={`h-${i}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={`r-${ri}`}
                className={table.violationRows?.[ri] ? 'rd-flight-build-table__row--violation' : undefined}
              >
                {headers.map((_, ci) => (
                  <td
                    key={`c-${ri}-${ci}`}
                    className={
                      highlightSet.has(`${ri}:${ci}`)
                        ? 'rd-flight-build-table__cell--highlight'
                        : undefined
                    }
                  >
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CodeCheckAlarmList({ alarms }: { alarms: BuildResultAlarm[] }) {
  if (!alarms.length) return null;
  return (
    <div className="rd-flight-build-table-wrap">
      <p className="rd-flight-build-table__caption">待整改项（{alarms.length}）</p>
      <div className="overflow-x-auto">
        <table className="rd-flight-build-table">
          <thead>
            <tr>
              <th>文件</th>
              <th>函数</th>
              <th>CCN</th>
            </tr>
          </thead>
          <tbody>
            {alarms.map((alarm, idx) => (
              <tr key={`alarm-${idx}`} className="rd-flight-build-table__row--violation">
                <td>{alarm.fileName ?? ''}</td>
                <td>{alarm.functionName ?? ''}</td>
                <td className="rd-flight-build-table__cell--highlight">{formatAlarmCcn(alarm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BuildResultDetail({ item }: { item: ParsedBuildResult }) {
  const hasExpand =
    item.buildKind === 'code_check' ||
    item.kind === 'html' ||
    (item.kind === 'text' && item.plainText.length > item.preview.length) ||
    item.tables.length > 0;
  const failureReason = resolveBuildFailureReason(item);

  return (
    <details
      className="rd-flight-build-result"
      open={item.buildKind === 'code_check' || (item.kind === 'html' && item.tables.length > 0)}
    >
      <summary className="rd-flight-build-result__summary">
        <ChevronDown className="rd-flight-build-result__chevron h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="font-medium text-slate-200">{item.resultType}</span>
        <span className="text-[11px] text-muted-foreground truncate">{item.preview}</span>
      </summary>
      <div className="rd-flight-build-result__body">
        {item.kind === 'url' && item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline break-all"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            {item.url}
          </a>
        ) : null}
        {failureReason ? (
          <p className="text-[11px] text-red-300 mb-2 whitespace-pre-wrap">{failureReason}</p>
        ) : null}
        {item.buildKind === 'code_check' && item.alarms?.length ? (
          <CodeCheckAlarmList alarms={item.alarms} />
        ) : null}
        {item.tables.map((table, idx) => (
          <BuildResultTable key={`tbl-${idx}`} table={table} />
        ))}
        {item.kind === 'html' && !item.tables.length ? (
          <pre className="rd-flight-build-result__pre">{item.plainText}</pre>
        ) : null}
        {item.kind === 'text' && hasExpand && item.buildKind !== 'code_check' ? (
          <pre className="rd-flight-build-result__pre">{item.plainText}</pre>
        ) : null}
        {item.kind === 'empty' ? (
          <p className="text-[11px] text-muted-foreground mb-0">无构建明细</p>
        ) : null}
      </div>
    </details>
  );
}

function FlightTaskCard({ entry }: { entry: CodeCommitFlightEntry }) {
  const parsedBuildResults = useMemo(
    () => entry.buildResults.map((row) => parseBuildResultRow(row)),
    [entry.buildResults],
  );

  return (
    <article className="rd-code-commit-flight-card">
      <header className="rd-code-commit-flight-card__header">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-slate-200 line-clamp-2">
            {entry.taskTitle || entry.taskNo || '—'}
          </span>
          {entry.featureId ? (
            <span className="font-mono text-[10px] text-muted-foreground">{entry.featureId}</span>
          ) : null}
          {entry.commitHash ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {entry.commitHash.slice(0, 8)}
            </span>
          ) : null}
        </div>
      </header>

      {entry.flightStatus ? (
        <div className="rd-code-commit-flight-card__flight mt-3">
          <dl className="rd-flight-meta-grid">
            {entry.runStateDesc ? (
              <>
                <dt>构建状态</dt>
                <dd>{entry.runStateDesc}</dd>
              </>
            ) : null}
            {entry.beginDate || entry.endDate ? (
              <>
                <dt>时间</dt>
                <dd>
                  {entry.beginDate || '—'} → {entry.endDate || '—'}
                </dd>
              </>
            ) : null}
          </dl>

          {parsedBuildResults.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">构建明细</p>
              {parsedBuildResults.map((item, idx) => (
                <BuildResultDetail key={`${entry.id}-br-${idx}`} item={item} />
              ))}
            </div>
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
                <code
                  className="text-[10px] text-muted-foreground truncate min-w-0"
                  title={art.path || art.name}
                >
                  {art.path || '—'}
                </code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {flights.length > 0 ? (
        <section className="space-y-3">
          <h4 className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            代码提交明细
          </h4>
          {flights.map((entry) => (
            <FlightTaskCard key={entry.id} entry={entry} />
          ))}
        </section>
      ) : null}
    </div>
  );
};
