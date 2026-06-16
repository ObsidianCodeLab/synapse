/**
 * 代码提交节点结构化展示（与后端 build_code_commit_display 对齐）
 */

export type CodeCommitPhase = 'prepare' | 'commit' | 'flight_poll' | 'archive' | 'done';

export type CodeCommitStepId = 'commit' | 'flight_poll' | 'flight_done' | 'results';

export interface CodeCommitStepDef {
  id: CodeCommitStepId;
  label: string;
  subtitle: string;
}

export const CODE_COMMIT_STEPS: CodeCommitStepDef[] = [
  { id: 'commit', label: '提交完成', subtitle: '特性分支 push 至远程' },
  { id: 'flight_poll', label: '试飞中', subtitle: '轮询 CI 构建状态' },
  { id: 'flight_done', label: '试飞完成', subtitle: '全部子单试飞已结束' },
  { id: 'results', label: '试飞结果', subtitle: '结果归档至 synapse_archive' },
];

export type StepVisualState = 'pending' | 'active' | 'ok' | 'failed' | 'partial';

export interface CodeCommitArchiveEntry {
  name: string;
  path: string;
  status: 'ok' | 'pending' | 'missing';
}

export interface CodeCommitFlightEntry {
  id: string;
  taskNo: string;
  taskTitle: string;
  featureId: string;
  commitStatus: string;
  commitHash: string;
  commitMessage: string;
  sandboxPath: string;
  flightStatus: string;
  flightError: string;
  runStateDesc: string;
  beginDate: string;
  endDate: string;
  buildResults: { resultType: string; resultMsg: string }[];
}

type RowRecord = Record<string, unknown>;

function asRows(value: unknown): RowRecord[] {
  return Array.isArray(value) ? value.filter((r): r is RowRecord => !!r && typeof r === 'object') : [];
}

export function codeCommitSummaryLine(display: RowRecord): string {
  const progress = (display.progress as RowRecord) || {};
  const phase = String(progress.message || '').trim();
  if (phase) return phase;

  const status = String(display.status || '—');
  const summary = (display.summary as RowRecord) || {};
  const total = Number(summary.total || 0);
  const commitOk = Number(summary.commit_ok || 0);
  const flightOk = Number(summary.flight_ok || 0);
  const flight = (display.flight as RowRecord) || {};
  const flightStatus = String(flight.status || '');

  if (status === 'running') return `代码提交进行中（${commitOk}/${total} 已提交）`;
  if (status === 'failed') return `提交失败，成功 ${commitOk}/${total} 个子单`;
  if (flightStatus === 'failed') return `试飞未通过，提交 ${commitOk}/${total}，试飞成功 ${flightOk}`;
  if (status === 'partial') return `部分完成：提交 ${commitOk}/${total}，试飞成功 ${flightOk}`;
  if (status === 'ok') return `已完成 ${total} 个子单提交与试飞`;
  return '等待代码提交节点执行';
}

export function resolveCodeCommitStepStates(display: RowRecord): Record<CodeCommitStepId, StepVisualState> {
  const progress = (display.progress as RowRecord) || {};
  const phase = String(progress.phase || '') as CodeCommitPhase;
  const summary = (display.summary as RowRecord) || {};
  const total = Number(summary.total || 0);
  const commitOk = Number(summary.commit_ok || 0);
  const commitFailed = Number(summary.commit_failed || 0);
  const flight = (display.flight as RowRecord) || {};
  const flightStatus = String(flight.status || '');
  const archives = asRows(display.archives);
  const hasFlightArchive = archives.some((a) => String(a.name || '') === '试飞结果.md');
  const nodeStatus = String(display.status || '');
  const tasks = asRows(display.tasks);

  const allCommitsTerminal =
    total > 0 &&
    tasks.length >= total &&
    tasks.every((t) => ['ok', 'failed', 'skipped'].includes(String(t.status || '')));
  const allFlightsTerminal =
    tasks.length > 0 &&
    tasks.every((t) => {
      const st = String((t.flight_status as string) || '');
      return st && !['pending', ''].includes(st);
    });

  const states: Record<CodeCommitStepId, StepVisualState> = {
    commit: 'pending',
    flight_poll: 'pending',
    flight_done: 'pending',
    results: 'pending',
  };

  if (phase === 'prepare') {
    states.commit = 'active';
    return states;
  }

  if (allCommitsTerminal && commitOk > 0) {
    states.commit = commitFailed > 0 ? 'partial' : 'ok';
  } else if (phase === 'commit' || commitOk > 0) {
    states.commit = nodeStatus === 'running' ? 'active' : commitOk > 0 ? 'partial' : 'active';
  } else if (nodeStatus === 'running') {
    states.commit = 'active';
  }

  if (phase === 'flight_poll' || (allCommitsTerminal && commitOk > 0 && !allFlightsTerminal)) {
    states.flight_poll = 'active';
  } else if (allFlightsTerminal && flightStatus === 'pending') {
    states.flight_poll = 'active';
  } else if (allFlightsTerminal || phase === 'archive' || phase === 'done') {
    states.flight_poll =
      flightStatus === 'ok' ? 'ok' : flightStatus === 'failed' ? 'failed' : 'partial';
  }

  if (allFlightsTerminal || phase === 'archive' || phase === 'done') {
    states.flight_done =
      flightStatus === 'ok'
        ? 'ok'
        : flightStatus === 'failed'
          ? 'failed'
          : flightStatus === 'timeout'
            ? 'failed'
            : 'partial';
  } else if (states.flight_poll === 'active') {
    states.flight_done = 'pending';
  }

  if (hasFlightArchive || phase === 'archive' || phase === 'done') {
    states.results = hasFlightArchive
      ? flightStatus === 'failed'
        ? 'partial'
        : 'ok'
      : phase === 'done'
        ? 'partial'
        : 'active';
  } else if (states.flight_done === 'ok' || states.flight_done === 'failed') {
    states.results = 'active';
  }

  return states;
}

export function collectCodeCommitArchives(display: RowRecord): CodeCommitArchiveEntry[] {
  const fromBackend = asRows(display.archives);
  const known = ['代码提交日志.md', '试飞结果.md'];
  const map = new Map<string, CodeCommitArchiveEntry>();
  for (const name of known) {
    map.set(name, { name, path: '', status: 'pending' });
  }
  for (const row of fromBackend) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    map.set(name, {
      name,
      path: String(row.path || ''),
      status: 'ok',
    });
  }
  return known.map((name) => map.get(name)!);
}

export function collectCodeCommitFlights(display: RowRecord): CodeCommitFlightEntry[] {
  return asRows(display.tasks).map((row, idx) => {
    const flightData = (row.flight_data as RowRecord) || {};
    const buildResult = asRows(flightData.buildResult).map((item) => ({
      resultType: String(item.resultType || '检查项'),
      resultMsg: String(item.resultMsg || ''),
    }));
    return {
      id: `flight-${idx}-${String(row.task_no || idx)}`,
      taskNo: String(row.task_no || '—'),
      taskTitle: String(row.task_title || ''),
      featureId: String(row.feature_id || ''),
      commitStatus: String(row.status || ''),
      commitHash: String(row.commit_hash || ''),
      commitMessage: String(row.commit_message || ''),
      sandboxPath: String(row.sandbox_path || ''),
      flightStatus: String(row.flight_status || ''),
      flightError: String(row.flight_error || ''),
      runStateDesc: String(flightData.ciFlowInstRunStateDesc || ''),
      beginDate: String(flightData.ciFlowInstBeginDate || ''),
      endDate: String(flightData.ciFlowInstEndDate || ''),
      buildResults: buildResult,
    };
  });
}
