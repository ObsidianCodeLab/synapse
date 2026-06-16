/**
 * 代码提交节点结构化展示（与后端 build_code_commit_display 对齐）
 */

export type CodeCommitPhase = 'prepare' | 'commit' | 'compile' | 'flight_poll' | 'archive' | 'done';

export type CodeCommitStepId = 'commit' | 'compile' | 'flight';

/** 未开始 | 进行中 | 已完成 | 已失败 */
export type StepVisualState = 'pending' | 'active' | 'ok' | 'failed';

export interface CodeCommitStepDef {
  id: CodeCommitStepId;
  label: string;
  subtitle: string;
}

export const CODE_COMMIT_STEPS: CodeCommitStepDef[] = [
  { id: 'commit', label: '代码提交', subtitle: '特性分支 push 至远程' },
  { id: 'compile', label: '代码编译', subtitle: 'CI 编译构建' },
  { id: 'flight', label: '代码试飞', subtitle: '圈复杂度等检查' },
];

export interface CodeCommitArchiveEntry {
  name: string;
  path: string;
  status: 'ok' | 'pending' | 'missing';
}

export interface CodeCommitBuildResultRow {
  resultType: string;
  resultMsg: string;
  kind?: string;
  nodeStateDesc?: string;
  alarms?: {
    fileName?: string;
    functionName?: string;
    errorArrow?: string;
    ccnCount?: number;
    benchmarkCcnCount?: number;
  }[];
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
  buildResults: CodeCommitBuildResultRow[];
}

type RowRecord = Record<string, unknown>;

function asRows(value: unknown): RowRecord[] {
  return Array.isArray(value) ? value.filter((r): r is RowRecord => !!r && typeof r === 'object') : [];
}

function normalizeStepState(raw: unknown): StepVisualState {
  const value = String(raw || '').trim();
  if (value === 'active' || value === 'ok' || value === 'failed' || value === 'pending') {
    return value;
  }
  return 'pending';
}

function mergeStepState(current: StepVisualState, incoming: StepVisualState): StepVisualState {
  const order: Record<StepVisualState, number> = {
    failed: 4,
    active: 3,
    ok: 2,
    pending: 1,
  };
  return order[current] >= order[incoming] ? current : incoming;
}

function aggregateCiPipelineSteps(tasks: RowRecord[]): Record<'compile' | 'flight', StepVisualState> {
  let compile: StepVisualState = 'pending';
  let flight: StepVisualState = 'pending';
  for (const row of tasks) {
    const flightData = (row.flight_data as RowRecord) || {};
    const steps = (flightData.pipelineSteps as RowRecord) || {};
    compile = mergeStepState(compile, normalizeStepState(steps.compile));
    flight = mergeStepState(flight, normalizeStepState(steps.flight));
  }
  return { compile, flight };
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
  const backendSteps = (progress.steps as RowRecord) || {};
  if (backendSteps.commit || backendSteps.compile || backendSteps.flight) {
    return enforceCiStepCascade({
      commit: normalizeStepState(backendSteps.commit),
      compile: normalizeStepState(backendSteps.compile),
      flight: normalizeStepState(backendSteps.flight),
    });
  }

  const phase = String(progress.phase || '') as CodeCommitPhase;
  const summary = (display.summary as RowRecord) || {};
  const total = Number(summary.total || 0);
  const commitOk = Number(summary.commit_ok || 0);
  const commitFailed = Number(summary.commit_failed || 0);
  const flight = (display.flight as RowRecord) || {};
  const flightStatus = String(flight.status || '');
  const nodeStatus = String(display.status || '');
  const tasks = asRows(display.tasks);
  const ciSteps = aggregateCiPipelineSteps(tasks);
  const compileFailed = ciSteps.compile === 'failed' || compileFailedInTasks(tasks);

  const allCommitsTerminal =
    total > 0 &&
    tasks.length >= total &&
    tasks.every((t) => ['ok', 'failed', 'skipped'].includes(String(t.status || '')));

  const states: Record<CodeCommitStepId, StepVisualState> = {
    commit: 'pending',
    compile: 'pending',
    flight: 'pending',
  };

  if (phase === 'prepare') {
    states.commit = 'active';
    return states;
  }

  if (phase === 'commit' || (nodeStatus === 'running' && !allCommitsTerminal)) {
    states.commit = 'active';
    return states;
  }

  if (allCommitsTerminal) {
    if (commitOk <= 0 || commitFailed > 0) {
      states.commit = 'failed';
    } else {
      states.commit = 'ok';
    }
  } else if (commitOk > 0) {
    states.commit = 'active';
  }

  if (states.commit !== 'ok') {
    return states;
  }

  if (phase === 'flight_poll' || (nodeStatus === 'running' && ['', 'pending'].includes(flightStatus))) {
    states.compile = ciSteps.compile === 'pending' ? 'active' : ciSteps.compile;
    states.flight = ciSteps.flight;
    if (states.compile === 'ok' && states.flight === 'pending') {
      states.flight = 'active';
    }
    return enforceCiStepCascade(states);
  }

  if (flightStatus === 'ok') {
    states.compile = ciSteps.compile === 'pending' ? 'ok' : ciSteps.compile;
    states.flight = ciSteps.flight === 'pending' ? 'ok' : ciSteps.flight;
    return enforceCiStepCascade(states);
  }

  if (flightStatus === 'failed' || flightStatus === 'timeout') {
    states.compile =
      ciSteps.compile === 'pending'
        ? compileFailed
          ? 'failed'
          : 'ok'
        : ciSteps.compile;
    states.flight = states.compile === 'failed' ? 'pending' : ciSteps.flight === 'pending' ? 'failed' : ciSteps.flight;
    return enforceCiStepCascade(states);
  }

  if (flightStatus === 'skipped') {
    states.compile = 'failed';
    states.flight = 'failed';
    return states;
  }

  if (phase === 'archive' || phase === 'done' || nodeStatus !== 'running') {
    if (compileFailed) {
      states.compile = ciSteps.compile === 'pending' ? 'failed' : ciSteps.compile;
      states.flight = 'pending';
    } else if (flightStatus === 'ok') {
      states.compile = ciSteps.compile === 'pending' ? 'ok' : ciSteps.compile;
      states.flight = ciSteps.flight === 'pending' ? 'ok' : ciSteps.flight;
    } else {
      states.compile = ciSteps.compile === 'pending' ? 'ok' : ciSteps.compile;
      states.flight = ciSteps.flight === 'pending' ? 'failed' : ciSteps.flight;
    }
  }

  return enforceCiStepCascade(states);
}

function enforceCiStepCascade(
  states: Record<CodeCommitStepId, StepVisualState>,
): Record<CodeCommitStepId, StepVisualState> {
  if (states.compile !== 'ok' && (states.flight === 'ok' || states.flight === 'active')) {
    return { ...states, flight: 'pending' };
  }
  return states;
}

function compileFailedInTasks(tasks: RowRecord[]): boolean {
  for (const row of tasks) {
    const flightData = (row.flight_data as RowRecord) || {};
    const pipeline = (flightData.pipelineSteps as RowRecord) || {};
    if (String(pipeline.compile || '') === 'failed') return true;
    for (const item of asRows(flightData.buildResult)) {
      if (String(item.kind || '') === 'compile') return true;
    }
  }
  return false;
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
      kind: item.kind != null ? String(item.kind) : undefined,
      nodeStateDesc: item.nodeStateDesc != null ? String(item.nodeStateDesc) : undefined,
      alarms: Array.isArray(item.alarms)
        ? item.alarms.filter((a): a is Record<string, unknown> => !!a && typeof a === 'object').map((a) => ({
            fileName: a.fileName != null ? String(a.fileName) : undefined,
            functionName: a.functionName != null ? String(a.functionName) : undefined,
            errorArrow: a.errorArrow != null ? String(a.errorArrow) : undefined,
            ccnCount: typeof a.ccnCount === 'number' ? a.ccnCount : undefined,
            benchmarkCcnCount:
              typeof a.benchmarkCcnCount === 'number' ? a.benchmarkCcnCount : undefined,
          }))
        : undefined,
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
