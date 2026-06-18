/**
 * 任务执行评审面板：展示 CLI 批量执行结果，供人工确认后推进。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Tabs, message } from 'antd';
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  FileCode2,
  FileDiff,
  FolderGit2,
  GitBranch,
  ListTree,
  Loader2,
  RotateCw,
  Sparkles,
  AlertTriangle,
  Target,
  Terminal,
  Wrench,
} from 'lucide-react';
import {
  fetchTaskExec,
  reprocessMeetingRoom,
  submitTaskExecCommit,
  submitTaskExecDecision,
  type TaskExecPayload,
  type TaskExecReprocessRound,
  type TaskExecLiveTail,
  type TaskExecTaskRow,
  type TaskExecGetResponse,
} from '../../../api/meetingRoomService';
import { CLI_TOOL_OPTIONS } from './cliToolConfig';
import { displayCliModelLabel } from './cliModelConfig';
import { CursorAgentInstallModal } from './CursorAgentInstallModal';
import { ReviewMarkdown } from './ReviewMarkdown';
import { TaskExecCliLogViewer } from './TaskExecCliLogViewer';
import { TaskExecCodeDiffPanel } from './TaskExecCodeDiffPanel';
import { CodeCommitFlightPanel } from './CodeCommitFlightPanel';
import { CodeCommitProgressSteps } from './CodeCommitProgressSteps';
import { codeCommitSummaryLine, resolveCodeCommitStepStates } from './codeCommitDisplay';

const { TextArea } = Input;

const STATUS_META: Record<string, { label: string; className: string }> = {
  ok: { label: '成功', className: 'rd-task-exec-status--ok' },
  completed: { label: '已完成', className: 'rd-task-exec-status--ok' },
  partial: { label: '部分完成', className: 'rd-task-exec-status--partial' },
  failed: { label: '失败', className: 'rd-task-exec-status--failed' },
  skipped: { label: '已跳过', className: 'rd-task-exec-status--skipped' },
  running: { label: '执行中', className: 'rd-task-exec-status--running' },
};

const PHASE_LABEL: Record<string, string> = {
  prepare: '准备',
  develop: '开发轮',
  verify: '完成检测',
  done: '明细收尾',
  finished: '全部结束',
  skipped: '已跳过',
  code_commit: '代码提交与试飞',
};

type CliExecNodeId = 'task_exec' | 'diff_analysis';

const NODE_COPY: Record<
  CliExecNodeId,
  {
    titleRunning: string;
    titleReview: string;
    detailList: string;
    goalLabel: string;
    coverageLabel: string;
    runningHint: string;
    reviewHint: (total: number, ok: number) => string;
    emptyDetail: string;
    blockedMsg: string;
    loading: string;
    waiting: string;
    empty: string;
    developPrompt: string;
    verifyPrompt: string;
    reprocessTarget: CliExecNodeId;
  }
> = {
  task_exec: {
    titleRunning: '任务执行进度',
    titleReview: '任务执行评审',
    detailList: '子单明细',
    goalLabel: '任务目标',
    coverageLabel: '覆盖功能',
    runningHint: 'Cursor CLI 正在处理研发子单',
    reviewHint: (total, ok) =>
      `CLI 已循环处理 ${total} 个研发子单 · 成功 ${ok} 个 · 请核对研发工作汇报、工作路径与提示词后裁决`,
    emptyDetail: '无子单执行记录',
    blockedMsg: '任务执行流程异常阻断，请通过重处理或优化处理恢复',
    loading: '加载任务执行结果…',
    waiting: '任务执行进行中，等待首批进度…',
    empty: '暂无任务执行结果',
    developPrompt: '开发要求',
    verifyPrompt: '审计要求',
    reprocessTarget: 'task_exec',
  },
  diff_analysis: {
    titleRunning: '试飞优化进度',
    titleReview: '试飞优化评审',
    detailList: '试飞优化明细',
    goalLabel: '试飞优化关键内容',
    coverageLabel: '关联子单',
    runningHint: 'Cursor CLI 正在按试飞优化方案修复问题',
    reviewHint: (total, ok) =>
      `CLI 已完成 ${total} 条试飞优化明细 · 成功 ${ok} 条 · 请核对修复内容与代码提交/试飞结果后裁决`,
    emptyDetail: '无试飞优化明细',
    blockedMsg: '试飞优化流程异常阻断（含试飞未通过），请通过重处理恢复',
    loading: '加载试飞优化结果…',
    waiting: '试飞优化进行中，等待首批进度…',
    empty: '暂无试飞优化结果',
    developPrompt: '修复要求',
    verifyPrompt: '审计要求',
    reprocessTarget: 'diff_analysis',
  },
};

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeId?: string;
  nodeId?: CliExecNodeId;
  initialPayload?: TaskExecPayload | null;
  blocked?: boolean;
  /** 历史只读：展示执行/优化结果，隐藏评审意见与裁决操作 */
  readOnly?: boolean;
  /** 节点仍在 processing 时轮询 task-exec 增量结果 */
  live?: boolean;
  onDecided?: () => void;
}

function cliLabel(toolId: string): string {
  return CLI_TOOL_OPTIONS.find((o) => o.id === toolId)?.label || toolId || '—';
}

function formatDuration(sec: number): string {
  if (!sec || sec < 60) return `${sec || 0}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function statusMeta(status: string) {
  const key = String(status || '').toLowerCase();
  return STATUS_META[key] || { label: status || '—', className: 'rd-task-exec-status--default' };
}

function PromptBlock({ title, content }: { title: string; content?: string }) {
  const text = (content || '').trim();
  if (!text) {
    return (
      <div className="rd-task-exec-field">
        <div className="rd-task-exec-field__label">{title}</div>
        <p className="rd-task-exec-field__empty">—</p>
      </div>
    );
  }
  return (
    <details className="rd-task-exec-prompt">
      <summary className="rd-task-exec-field__label cursor-pointer select-none list-none">
        {title}
      </summary>
      <pre className="rd-task-exec-prompt__body custom-scrollbar">{text}</pre>
    </details>
  );
}

function roundKindLabel(kind: string | undefined, variant: 'task_exec' | 'diff_analysis'): string {
  if (variant === 'diff_analysis') {
    return kind === 'reprocess' ? '优化处理' : '首轮优化';
  }
  return kind === 'reprocess' ? '重新处理' : '首轮执行';
}

function roundStatusLabel(status: string | undefined): string {
  const key = String(status || '').toLowerCase();
  if (key === 'ok' || key === 'completed') return '成功';
  if (key === 'partial') return '部分完成';
  if (key === 'failed') return '失败';
  if (key === 'running') return '执行中';
  if (key === 'pending') return '待执行';
  if (key === 'superseded') return '已被新一轮取代';
  return status || '—';
}

function TaskExecRoundsPanel({
  rounds,
  currentRound,
  variant = 'task_exec',
}: {
  rounds: TaskExecReprocessRound[];
  currentRound?: number;
  variant?: 'task_exec' | 'diff_analysis';
}) {
  if (!rounds.length) return null;
  const total = currentRound || rounds[rounds.length - 1]?.round || rounds.length;
  const panelTitle = variant === 'diff_analysis' ? '优化轮次' : '执行轮次';
  const reasonPrefix = variant === 'diff_analysis' ? '优化建议' : '处理建议';
  const emptyInitialHint =
    variant === 'diff_analysis' ? '首轮优化，无额外优化意见' : '首轮执行，无额外处理建议';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-violet-950/20 p-4 shadow-[0_8px_32px_rgba(139,92,246,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
          <RotateCw className="h-3.5 w-3.5 text-violet-400" />
          {panelTitle}
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-200">
          共 {total} 轮
        </span>
      </div>
      <div className="space-y-2">
        {rounds.map((round) => {
          const active = round.round === currentRound;
          const reason = (round.reason || '').trim();
          const summary = round.summary;
          return (
            <div
              key={`round-${round.round}`}
              className={`rounded-xl border px-3 py-2.5 ${
                active
                  ? 'border-violet-400/35 bg-violet-500/10'
                  : 'border-white/10 bg-black/20'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold text-foreground">第 {round.round} 轮</span>
                <span className="text-muted-foreground">{roundKindLabel(round.kind, variant)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    String(round.status).toLowerCase() === 'ok'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : String(round.status).toLowerCase() === 'running'
                        ? 'bg-blue-500/15 text-blue-300'
                        : 'bg-white/10 text-muted-foreground'
                  }`}
                >
                  {roundStatusLabel(round.status)}
                </span>
                {summary?.total_tokens ? (
                  <span className="text-muted-foreground tabular-nums">
                    {summary.total_tokens} tokens
                  </span>
                ) : null}
                {summary?.total_duration_sec ? (
                  <span className="text-muted-foreground tabular-nums">
                    {formatDuration(Number(summary.total_duration_sec))}
                  </span>
                ) : null}
              </div>
              {reason ? (
                <p className="mt-2 mb-0 text-[12px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  <span className="text-muted-foreground">{reasonPrefix}：</span>
                  {reason}
                </p>
              ) : round.kind === 'initial' ? (
                <p className="mt-2 mb-0 text-[12px] text-muted-foreground">{emptyInitialHint}</p>
              ) : null}
              {round.note ? (
                <p className="mt-1 mb-0 text-[11px] text-muted-foreground/80">{round.note}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffAnalysisTaskRowCard({ task }: { task: TaskExecTaskRow }) {
  const status = String(task.status || '—');
  const meta = statusMeta(status);
  const isRunning = status === 'running';
  const phase = String(task.phase || '').trim();

  return (
    <div className="rounded-xl border border-amber-500/15 bg-black/20 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground">
            {task.task_no} {task.task_title || ''}
          </span>
          {task.product_module ? (
            <p className="mb-0 mt-0.5 text-[11px] text-muted-foreground">{task.product_module}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {isRunning && phase ? (
            <span className="inline-flex items-center gap-1 text-blue-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              {PHASE_LABEL[phase] || phase}
            </span>
          ) : null}
          <span className={`rd-task-exec-status ${meta.className}`}>{meta.label}</span>
          <span className="tabular-nums">{task.tokens_used ?? 0} tk</span>
          <span className="tabular-nums">{formatDuration(Number(task.duration_seconds || 0))}</span>
        </div>
      </div>
      {task.error ? (
        <Alert type="error" showIcon message={String(task.error)} className="mt-2 text-[11px]" />
      ) : null}
    </div>
  );
}

function DiffAnalysisDetailSubsection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/10 last:border-b-0">
      <div className="flex items-center gap-2 border-b border-white/5 bg-black/15 px-4 py-2.5 text-[11px] font-semibold text-foreground/90">
        {icon}
        {title}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function FlightOptimizePlanTabs({
  section,
}: {
  section: NonNullable<TaskExecGetResponse['optimize_plan_sections']>[number] | undefined;
}) {
  if (!section) {
    return <Alert type="info" showIcon message="暂无试飞优化方案中的修复建议" />;
  }

  const items = Array.isArray(section.plan_items) ? section.plan_items : [];
  const fallbackMd = String(section.markdown || '').trim();
  const tabItems =
    items.length > 0
      ? items.map((item) => ({
          key: String(item.item_no ?? item.label ?? item.title),
          label: String(item.label || item.title || `计划项 ${item.item_no ?? ''}`),
          children: (
            <div className="rd-task-exec-report__body custom-scrollbar max-h-[480px] overflow-y-auto px-1 py-2 text-[13px] leading-relaxed">
              <ReviewMarkdown content={String(item.markdown || '')} compact />
            </div>
          ),
        }))
      : fallbackMd
        ? [
            {
              key: 'all',
              label: '修复建议',
              children: (
                <div className="rd-task-exec-report__body custom-scrollbar max-h-[480px] overflow-y-auto px-1 py-2 text-[13px] leading-relaxed">
                  <ReviewMarkdown content={fallbackMd} compact />
                </div>
              ),
            },
          ]
        : [];

  return (
    <div className="space-y-2">
      {String(section.intro || '').trim() ? (
        <div className="rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-[12px] text-muted-foreground rd-task-exec-report__body">
          <ReviewMarkdown content={String(section.intro)} compact />
        </div>
      ) : null}
      {tabItems.length > 0 ? (
        <Tabs size="small" items={tabItems} className="rd-flight-plan-tabs" destroyInactiveTabPane={false} />
      ) : (
        <Alert type="warning" showIcon message="未解析到计划项" />
      )}
    </div>
  );
}

function DiffAnalysisDetailPanel({
  flightContent,
  commitRunning,
  codeCommitDisplay,
  codeCommitStepStates,
  identifiedIssuesMarkdown,
  optimizePlanSections,
}: {
  flightContent?: TaskExecGetResponse['flight_key_content'];
  commitRunning?: boolean;
  codeCommitDisplay?: Record<string, unknown> | null;
  codeCommitStepStates?: ReturnType<typeof resolveCodeCommitStepStates>;
  identifiedIssuesMarkdown?: string | null;
  optimizePlanSections: NonNullable<TaskExecGetResponse['optimize_plan_sections']>;
}) {
  const display =
    (commitRunning || codeCommitDisplay ? codeCommitDisplay : flightContent?.display) as
      | Record<string, unknown>
      | null
      | undefined;
  const latestPlan =
    optimizePlanSections.length > 0
      ? optimizePlanSections[optimizePlanSections.length - 1]
      : undefined;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-amber-950/15 shadow-[0_8px_32px_rgba(251,191,36,0.08)]">
      <DiffAnalysisDetailSubsection
        title="代码提交明细"
        icon={<GitBranch className="h-3.5 w-3.5 text-sky-400" />}
      >
        {commitRunning ? (
          <div className="mb-3 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
              {codeCommitDisplay ? codeCommitSummaryLine(codeCommitDisplay) : '正在提交并等待试飞…'}
            </div>
            {codeCommitStepStates ? (
              <div className="mt-3">
                <CodeCommitProgressSteps stepStates={codeCommitStepStates} />
              </div>
            ) : null}
          </div>
        ) : null}
        {display ? (
          <CodeCommitFlightPanel display={display} hideArchives />
        ) : flightContent?.markdown ? (
          <div className="rd-task-exec-report__body custom-scrollbar max-h-[480px] overflow-y-auto rounded-xl border border-amber-500/10 bg-black/20 p-3">
            <ReviewMarkdown content={flightContent.markdown} compact />
          </div>
        ) : (
          <Alert type="info" showIcon message="暂无代码提交与试飞明细" />
        )}
      </DiffAnalysisDetailSubsection>

      <DiffAnalysisDetailSubsection
        title="已识别问题清单"
        icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
      >
        {identifiedIssuesMarkdown ? (
          <div className="rd-task-exec-report__body custom-scrollbar max-h-[360px] overflow-y-auto text-[13px] leading-relaxed">
            <ReviewMarkdown content={identifiedIssuesMarkdown} compact />
          </div>
        ) : (
          <Alert type="info" showIcon message="暂无已识别问题清单，请先完成试飞方案节点" />
        )}
      </DiffAnalysisDetailSubsection>

      <DiffAnalysisDetailSubsection
        title={
          latestPlan && Number(latestPlan.round) > 1
            ? `修复建议（第 ${latestPlan.round} 轮）`
            : '修复建议'
        }
        icon={<Sparkles className="h-3.5 w-3.5 text-violet-400" />}
      >
        <FlightOptimizePlanTabs section={latestPlan} />
      </DiffAnalysisDetailSubsection>
    </div>
  );
}

function TaskRowCard({
  task,
  copy,
  showVerify,
}: {
  task: TaskExecTaskRow;
  copy: (typeof NODE_COPY)[CliExecNodeId];
  showVerify: boolean;
}) {
  const status = String(task.status || '—');
  const meta = statusMeta(status);
  const cov = Array.isArray(task.coverage) ? task.coverage : [];
  const phase = String(task.phase || '').trim();
  const isRunning = status === 'running';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-amber-950/20 p-4 shadow-[0_8px_32px_rgba(251,191,36,0.08)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl" />
      <div className="relative mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-foreground text-sm truncate">
            {task.task_no} {task.task_title || ''}
          </div>
          {task.product_module ? (
            <p className="text-[11px] text-muted-foreground mt-1 mb-0">{task.product_module}</p>
          ) : null}
          {isRunning && phase ? (
            <p className="text-[11px] text-blue-300 mt-1 mb-0 inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {PHASE_LABEL[phase] || phase}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className={`rd-task-exec-status ${meta.className}`}>
            {isRunning ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {meta.label}
              </span>
            ) : (
              meta.label
            )}
          </span>
          <span className="inline-flex items-center gap-1">
            <Coins className="h-3 w-3 text-amber-400" />
            {task.tokens_used ?? 0}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-sky-400" />
            {formatDuration(Number(task.duration_seconds || 0))}
          </span>
        </div>
      </div>

      <div className="relative space-y-3 text-[12px]">
        {showVerify ? (
        <div className="rd-task-exec-field">
          <div className="rd-task-exec-field__label">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            {copy.goalLabel}
          </div>
          <p className="rd-task-exec-field__value">{task.goal || '—'}</p>
        </div>
        ) : null}

        {showVerify ? (
        <div className="rd-task-exec-field">
          <div className="rd-task-exec-field__label">
            <Bot className="h-3.5 w-3.5 text-violet-400" />
            {copy.coverageLabel}
          </div>
          {cov.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {cov.map((fp) => (
                <span
                  key={fp}
                  className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"
                >
                  {fp}
                </span>
              ))}
            </div>
          ) : (
            <p className="rd-task-exec-field__empty">—</p>
          )}
        </div>
        ) : null}

        {task.report_markdown ? (
          <details className="rd-task-exec-prompt" open>
            <summary className="rd-task-exec-field__label cursor-pointer select-none list-none inline-flex items-center gap-1.5">
              <FileCode2 className="h-3.5 w-3.5 text-amber-400" />
              研发工作汇报
            </summary>
            <div className="rd-task-exec-prompt__body rd-task-exec-report__body custom-scrollbar overflow-y-auto">
              <ReviewMarkdown content={String(task.report_markdown)} />
            </div>
          </details>
        ) : null}

        {showVerify ? <PromptBlock title={copy.developPrompt} content={task.develop_prompt} /> : null}
        {showVerify ? <PromptBlock title={copy.verifyPrompt} content={task.verify_prompt} /> : null}

        {showVerify && task.develop_agent_command ? (
          <details className="rd-task-exec-prompt">
            <summary className="rd-task-exec-field__label cursor-pointer select-none list-none inline-flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              {showVerify ? '开发轮 agent 命令' : '修复轮 agent 命令'}
            </summary>
            <pre className="rd-task-exec-prompt__body custom-scrollbar">{task.develop_agent_command}</pre>
          </details>
        ) : null}
        {showVerify && task.verify_agent_command ? (
          <details className="rd-task-exec-prompt">
            <summary className="rd-task-exec-field__label cursor-pointer select-none list-none inline-flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-sky-400" />
              完成检测 agent 命令
            </summary>
            <pre className="rd-task-exec-prompt__body custom-scrollbar">{task.verify_agent_command}</pre>
          </details>
        ) : null}

        <details className="rd-task-exec-prompt">
          <summary className="rd-task-exec-field__label cursor-pointer select-none list-none inline-flex items-center gap-1.5">
            <FolderGit2 className="h-3.5 w-3.5 text-cyan-400" />
            工作路径
          </summary>
          <pre className="rd-task-exec-prompt__body custom-scrollbar">{task.sandbox_path || '—'}</pre>
        </details>

        {task.error ? (
          <Alert type="error" showIcon message={String(task.error)} className="text-[11px]" />
        ) : null}
      </div>
    </div>
  );
}

export function TaskExecReviewPanel({
  synapseApiBase,
  roomId,
  nodeId = 'task_exec',
  initialPayload,
  blocked,
  readOnly = false,
  live = false,
  onDecided,
}: Props) {
  const copy = NODE_COPY[nodeId] ?? NODE_COPY.task_exec;
  const showVerify = nodeId === 'task_exec';
  const [payload, setPayload] = useState<TaskExecPayload | null>(initialPayload ?? null);
  const [reprocessRounds, setReprocessRounds] = useState<TaskExecReprocessRound[]>([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [loading, setLoading] = useState(!initialPayload);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [liveTail, setLiveTail] = useState<TaskExecLiveTail | null>(null);
  const [optimizePlanSections, setOptimizePlanSections] = useState<
    NonNullable<TaskExecGetResponse['optimize_plan_sections']>
  >([]);
  const [flightKeyContent, setFlightKeyContent] = useState<TaskExecGetResponse['flight_key_content']>();
  const [optimizeCommentHint, setOptimizeCommentHint] = useState('');
  const [identifiedIssuesMarkdown, setIdentifiedIssuesMarkdown] = useState<string | null>(null);
  const [commentPrefilled, setCommentPrefilled] = useState(false);
  const liveTailEndRef = useRef<HTMLDivElement>(null);

  const isRunning =
    live ||
    String(payload?.status || '') === 'running' ||
    (nodeId === 'diff_analysis' && String(payload?.commit_phase || '') === 'running');

  const refresh = useCallback(async () => {
    if (!isRunning) setLoading(true);
    setError('');
    try {
      const res = await fetchTaskExec(synapseApiBase, roomId, nodeId);
      setPayload(res.payload);
      setReprocessRounds(Array.isArray(res.reprocess_rounds) ? res.reprocess_rounds : []);
      setCurrentRound(Number(res.current_round) || 0);
      if (res.live_tail) setLiveTail(res.live_tail);
      if (nodeId === 'diff_analysis') {
        setOptimizePlanSections(Array.isArray(res.optimize_plan_sections) ? res.optimize_plan_sections : []);
        setFlightKeyContent(res.flight_key_content);
        setOptimizeCommentHint(String(res.optimize_comment_hint || ''));
        setIdentifiedIssuesMarkdown(
          res.identified_issues_markdown != null ? String(res.identified_issues_markdown) : null,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载失败';
      if (!isRunning || !msg.includes('404')) {
        if (!isRunning) setError(msg);
      }
    } finally {
      if (!isRunning) setLoading(false);
    }
  }, [isRunning, nodeId, synapseApiBase, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [isRunning, refresh]);

  useEffect(() => {
    if (!isRunning && !liveTail?.entries?.length && !liveTail?.lines?.length) return;
    liveTailEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isRunning, liveTail?.entries?.length, liveTail?.lines?.length, liveTail?.updated_at]);

  const summary = payload?.summary;
  const tasks = useMemo(
    () => (Array.isArray(payload?.tasks) ? payload.tasks : []) as TaskExecTaskRow[],
    [payload?.tasks],
  );

  const agentCliMissing = ['agent_cli_missing', 'agent_cli_login_required'].includes(
    String(payload?.status || ''),
  );

  const showReviewCodeDiff =
    !isRunning &&
    !agentCliMissing &&
    Boolean(payload) &&
    String(payload?.status || '').toLowerCase() !== 'running';

  const onDecision = async (decision: 'approve') => {
    setSubmitting(true);
    try {
      await submitTaskExecDecision(synapseApiBase, roomId, { decision, comment });
      message.success('已通过，流程将推进');
      onDecided?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onOptimize = async () => {
    const text = comment.trim();
    if (!text) {
      message.warning('请填写优化处理意见');
      return;
    }
    setSubmitting(true);
    try {
      await reprocessMeetingRoom(synapseApiBase, roomId, copy.reprocessTarget, text);
      message.success(`已触发${copy.titleReview.replace('评审', '')}重处理，请稍候刷新结果`);
      onDecided?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '优化处理失败');
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirmCommit = async () => {
    setCommitting(true);
    try {
      await submitTaskExecCommit(synapseApiBase, roomId, 'diff_analysis');
      message.success('已确认，正在提交代码并等待试飞…');
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '触发提交失败');
    } finally {
      setCommitting(false);
    }
  };

  const flightFailed = Boolean(payload?.flight_failed);
  const isDiffAnalysis = nodeId === 'diff_analysis';
  const hasFlightIssues = isDiffAnalysis
    ? Boolean(flightKeyContent?.has_issues ?? flightFailed)
    : flightFailed;
  const commitPhase = String(payload?.commit_phase || '').trim();
  const awaitCommitConfirm = isDiffAnalysis && commitPhase === 'await_confirm';
  const commitRunning = isDiffAnalysis && (commitPhase === 'running' || committing);
  const commitDone = isDiffAnalysis && commitPhase === 'done';
  const codeCommitDisplay = useMemo(() => {
    const raw = payload?.code_commit;
    if (!raw || typeof raw !== 'object') return null;
    const display = (raw as { display?: Record<string, unknown> }).display;
    return (display && typeof display === 'object' ? display : raw) as Record<string, unknown>;
  }, [payload?.code_commit]);
  const codeCommitStepStates = useMemo(
    () => (codeCommitDisplay ? resolveCodeCommitStepStates(codeCommitDisplay) : null),
    [codeCommitDisplay],
  );
  const canApprove =
    !blocked &&
    !submitting &&
    !flightFailed &&
    !hasFlightIssues &&
    !awaitCommitConfirm &&
    !commitRunning &&
    (!isDiffAnalysis || commitDone);
  const optimizeDisabled =
    submitting ||
    isRunning ||
    agentCliMissing ||
    commitRunning ||
    (isDiffAnalysis && commitDone && !hasFlightIssues);
  const canOptimize = comment.trim().length > 0 && !optimizeDisabled;
  const canConfirmCommit =
    isDiffAnalysis &&
    awaitCommitConfirm &&
    !submitting &&
    !commitRunning &&
    !agentCliMissing &&
    !tasks.some((t) => t.status === 'failed');

  const agentInstallHint =
    (payload?.agent_cli && typeof payload.agent_cli === 'object'
      ? String(payload.agent_cli.install_hint || '')
      : '') || String(payload?.error || '');

  useEffect(() => {
    if (agentCliMissing) setInstallOpen(true);
  }, [agentCliMissing]);

  useEffect(() => {
    if (!isDiffAnalysis || commentPrefilled || isRunning) return;
    if (commitDone && hasFlightIssues && optimizeCommentHint.trim()) {
      setComment(optimizeCommentHint.trim());
      setCommentPrefilled(true);
    }
  }, [
    isDiffAnalysis,
    commitDone,
    hasFlightIssues,
    optimizeCommentHint,
    commentPrefilled,
    isRunning,
  ]);

  useEffect(() => {
    if (awaitCommitConfirm) setCommentPrefilled(false);
  }, [awaitCommitConfirm]);

  const onAgentReady = async () => {
    setReprocessing(true);
    try {
      await reprocessMeetingRoom(
        synapseApiBase,
        roomId,
        copy.reprocessTarget,
        `Cursor Agent CLI 已安装，重新执行${copy.titleReview.replace('评审', '')}`,
      );
      message.success(`已触发${copy.titleReview.replace('评审', '')}重新处理，请稍候刷新结果`);
      setInstallOpen(false);
      await refresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '重新执行失败');
    } finally {
      setReprocessing(false);
    }
  };

  if (loading && !payload && !isRunning) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {copy.loading}
      </div>
    );
  }

  if (isRunning && !payload) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        {copy.waiting}
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert type="error" message={error} showIcon />
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Alert type="warning" message={copy.empty} showIcon />
      </div>
    );
  }

  const showCliLog =
    isRunning ||
    Boolean(liveTail?.entries?.length) ||
    Boolean(liveTail?.lines?.length) ||
    Boolean(liveTail?.path);
  const ok = Number(summary?.ok || 0);
  const total = Number(summary?.total || tasks.length);
  const progress = payload.progress;
  const cliLogStatusHint =
    isRunning &&
    ((progress?.message || '').trim() ||
      (progress?.task_total
        ? `工单 ${progress.task_no || progress.task_index || 0} · ${PHASE_LABEL[String(progress.phase || '')] || progress.phase || '执行中'}（${progress.task_index || 0}/${progress.task_total}）`
        : `${copy.runningHint}…`));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <CursorAgentInstallModal
        open={installOpen}
        synapseApiBase={synapseApiBase}
        installHint={agentInstallHint}
        onClose={() => setInstallOpen(false)}
        onReady={() => void onAgentReady()}
      />
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
      {showCliLog ? (
        <TaskExecCliLogViewer
          entries={liveTail?.entries}
          lines={liveTail?.lines}
          path={liveTail?.path}
          statusHint={cliLogStatusHint || undefined}
          loading={isRunning}
          footerRef={liveTailEndRef}
        />
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-violet-500/10 to-slate-900 p-6 shadow-[0_16px_48px_rgba(251,191,36,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.15),transparent_55%)]" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-400/30 shadow-[0_0_24px_rgba(251,191,36,0.25)]">
            <Terminal className="h-7 w-7 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 flex-nowrap overflow-hidden">
              <h2 className="text-lg font-bold text-foreground m-0 tracking-tight shrink-0 whitespace-nowrap">
                {isRunning ? copy.titleRunning : copy.titleReview}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-200 shrink-0 whitespace-nowrap">
                <Terminal className="h-3 w-3" />
                {cliLabel(String(payload.cli_tool || ''))}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/35 bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-medium text-violet-200 shrink-0 whitespace-nowrap">
                <Sparkles className="h-3 w-3" />
                {payload.cli_model_label ||
                  displayCliModelLabel(
                    String(payload.cli_tool || 'cursor_cli') as 'cursor_cli',
                    payload.cli_model,
                    payload.cli_model_custom,
                  )}
              </span>
              {(currentRound || reprocessRounds.length) > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-400/35 bg-fuchsia-500/15 px-2.5 py-0.5 text-[11px] font-medium text-fuchsia-200 shrink-0 whitespace-nowrap">
                  <RotateCw className="h-3 w-3" />
                  第 {currentRound || reprocessRounds.length} 轮
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground m-0 leading-relaxed">
              {isRunning
                ? `${copy.runningHint}，页面每 3 秒自动刷新。${total ? `共 ${total} 条。` : ''}`
                : agentCliMissing
                ? payload?.status === 'agent_cli_login_required'
                  ? `${copy.titleReview.replace('评审', '')}尚未开始：Cursor Agent CLI 已安装，请先完成账号登录。`
                  : `${copy.titleReview.replace('评审', '')}尚未开始：本机缺少 Cursor Agent CLI（agent），请先安装后再重新执行。`
                : copy.reviewHint(total, ok)}
            </p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: nodeId === 'diff_analysis' ? '明细总数' : '子单总数', value: total, icon: <Bot className="h-4 w-4 text-violet-400" /> },
            { label: '成功', value: ok, icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" /> },
            {
              label: 'Token 合计',
              value: summary?.total_tokens ?? 0,
              icon: <Coins className="h-4 w-4 text-amber-400" />,
            },
            {
              label: '总耗时',
              value: formatDuration(Number(summary?.total_duration_sec || 0)),
              icon: <Clock className="h-4 w-4 text-sky-400" />,
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 backdrop-blur-sm"
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {s.icon}
                {s.label}
              </div>
              <div className="text-lg font-semibold text-foreground tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <TaskExecRoundsPanel
        rounds={reprocessRounds}
        currentRound={currentRound || undefined}
        variant={isDiffAnalysis ? 'diff_analysis' : 'task_exec'}
      />

      {agentCliMissing ? (
        <Alert
          type="warning"
          showIcon
          message="需要安装 Cursor Agent CLI"
          description={
            <div className="space-y-2">
              <p className="m-0 text-[12px]">{payload.error || '未检测到 agent 命令'}</p>
              <Button type="primary" loading={reprocessing} onClick={() => setInstallOpen(true)}>
                打开安装向导
              </Button>
            </div>
          }
        />
      ) : null}

      {flightFailed ? (
        <Alert
          type="error"
          showIcon
          message="试飞仍未通过"
          description={String(payload?.error || '代码已提交但试飞失败，不允许推进节点，请重处理后重试。')}
        />
      ) : null}

      {blocked && !isDiffAnalysis ? (
        <Alert type="error" showIcon message={copy.blockedMsg} />
      ) : null}

      <div className="space-y-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
          <ListTree className="h-3.5 w-3.5 text-amber-400" />
          {copy.detailList}
        </div>
        {isDiffAnalysis ? (
          <>
            {(!isRunning || commitRunning || commitDone) && !agentCliMissing ? (
              <DiffAnalysisDetailPanel
                flightContent={flightKeyContent}
                commitRunning={commitRunning}
                codeCommitDisplay={commitDone || commitRunning ? codeCommitDisplay : null}
                codeCommitStepStates={codeCommitStepStates ?? undefined}
                identifiedIssuesMarkdown={identifiedIssuesMarkdown}
                optimizePlanSections={optimizePlanSections}
              />
            ) : null}
            {tasks.length > 0 ? (
              <div className="space-y-2 pt-1">
                <p className="mb-0 text-[10px] uppercase tracking-wider text-muted-foreground">执行明细</p>
                {tasks.map((t) => (
                  <DiffAnalysisTaskRowCard key={String(t.task_no)} task={t} />
                ))}
              </div>
            ) : !agentCliMissing && !isRunning ? (
              <Alert type="warning" message={copy.emptyDetail} showIcon />
            ) : null}
          </>
        ) : tasks.length === 0 && !agentCliMissing && !isRunning ? (
          <Alert type="warning" message={copy.emptyDetail} showIcon />
        ) : (
          tasks.map((t) => (
            <TaskRowCard key={String(t.task_no)} task={t} copy={copy} showVerify={showVerify} />
          ))
        )}
      </div>

      {showReviewCodeDiff ? (
        <div className="space-y-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
            <FileDiff className="h-3.5 w-3.5 text-cyan-400" />
            代码差异
          </div>
          <TaskExecCodeDiffPanel synapseApiBase={synapseApiBase} roomId={roomId} />
        </div>
      ) : null}

      {!readOnly && !agentCliMissing && (!isRunning || commitRunning) ? (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-5 space-y-6">
        <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
          评审意见
        </label>
        <TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            isDiffAnalysis
              ? '优化处理时必填：说明修复方向、需调整的改造要点…'
              : '优化处理时必填：说明 CLI 执行结果的问题、需调整的方向或后续研发要求…'
          }
          disabled={(blocked && !isDiffAnalysis) || submitting || (isDiffAnalysis && commitDone && !hasFlightIssues)}
        />
        <div className="flex flex-wrap gap-4 justify-end pt-3">
          <Button
            type={canOptimize ? 'primary' : 'default'}
            icon={<Wrench className="h-4 w-4" />}
            loading={submitting}
            disabled={!canOptimize}
            className={
              canOptimize
                ? '!bg-orange-600 !border-orange-600 !text-white shadow-none hover:!bg-orange-500 hover:!border-orange-500 focus:!bg-orange-600 active:!bg-orange-700'
                : undefined
            }
            onClick={() => void onOptimize()}
          >
            优化处理
          </Button>
          {canConfirmCommit ? (
            <Button
              type="primary"
              icon={<CheckCircle2 className="h-4 w-4" />}
              loading={committing}
              disabled={submitting}
              className="bg-sky-600 hover:bg-sky-500"
              onClick={() => void onConfirmCommit()}
            >
              确认并提交
            </Button>
          ) : null}
          {isDiffAnalysis ? (
            canApprove ? (
              <Button
                type="primary"
                icon={<CheckCircle2 className="h-4 w-4" />}
                loading={submitting}
                className="bg-emerald-600 hover:bg-emerald-500"
                onClick={() => void onDecision('approve')}
              >
                试飞通过并推进
              </Button>
            ) : null
          ) : (
            <Button
              type="primary"
              icon={<CheckCircle2 className="h-4 w-4" />}
              loading={submitting}
              disabled={!canApprove}
              className="bg-emerald-600 hover:bg-emerald-500"
              onClick={() => void onDecision('approve')}
            >
              通过并推进
            </Button>
          )}
        </div>
      </div>
      ) : null}
      </div>
    </div>
  );
}
