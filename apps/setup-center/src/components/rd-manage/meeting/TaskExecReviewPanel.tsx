/**
 * 任务执行评审面板：展示 CLI 批量执行结果，供人工确认后推进。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, message } from 'antd';
import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  FileCode2,
  FileDiff,
  FolderGit2,
  ListTree,
  Loader2,
  Sparkles,
  Target,
  Terminal,
  XCircle,
} from 'lucide-react';
import {
  fetchTaskExec,
  reprocessMeetingRoom,
  submitTaskExecDecision,
  type TaskExecPayload,
  type TaskExecLiveTail,
  type TaskExecTaskRow,
} from '../../../api/meetingRoomService';
import { CLI_TOOL_OPTIONS } from './cliToolConfig';
import { displayCliModelLabel } from './cliModelConfig';
import { CursorAgentInstallModal } from './CursorAgentInstallModal';
import { ReviewMarkdown } from './ReviewMarkdown';
import { TaskExecCliLogViewer } from './TaskExecCliLogViewer';
import { TaskExecCodeDiffPanel } from './TaskExecCodeDiffPanel';

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
  done: '子单收尾',
  finished: '全部结束',
  skipped: '已跳过',
};

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeId?: string;
  initialPayload?: TaskExecPayload | null;
  blocked?: boolean;
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

function TaskRowCard({ task }: { task: TaskExecTaskRow }) {
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
        <div className="rd-task-exec-field">
          <div className="rd-task-exec-field__label">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            任务目标
          </div>
          <p className="rd-task-exec-field__value">{task.goal || '—'}</p>
        </div>

        <div className="rd-task-exec-field">
          <div className="rd-task-exec-field__label">
            <Bot className="h-3.5 w-3.5 text-violet-400" />
            覆盖功能
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

        <PromptBlock title="开发要求" content={task.develop_prompt} />
        <PromptBlock title="审计要求" content={task.verify_prompt} />

        {task.develop_agent_command ? (
          <details className="rd-task-exec-prompt">
            <summary className="rd-task-exec-field__label cursor-pointer select-none list-none inline-flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-emerald-400" />
              开发轮 agent 命令
            </summary>
            <pre className="rd-task-exec-prompt__body custom-scrollbar">{task.develop_agent_command}</pre>
          </details>
        ) : null}
        {task.verify_agent_command ? (
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
  initialPayload,
  blocked,
  live = false,
  onDecided,
}: Props) {
  const [payload, setPayload] = useState<TaskExecPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [liveTail, setLiveTail] = useState<TaskExecLiveTail | null>(null);
  const liveTailEndRef = useRef<HTMLDivElement>(null);

  const isRunning = live || String(payload?.status || '') === 'running';

  const refresh = useCallback(async () => {
    if (!isRunning) setLoading(true);
    setError('');
    try {
      const res = await fetchTaskExec(synapseApiBase, roomId);
      setPayload(res.payload);
      if (res.live_tail) setLiveTail(res.live_tail);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载失败';
      if (!isRunning || !msg.includes('404')) {
        if (!isRunning) setError(msg);
      }
    } finally {
      if (!isRunning) setLoading(false);
    }
  }, [isRunning, synapseApiBase, roomId]);

  useEffect(() => {
    if (!initialPayload || isRunning) void refresh();
  }, [initialPayload, isRunning, refresh]);

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

  const onDecision = async (decision: 'approve' | 'reject') => {
    setSubmitting(true);
    try {
      await submitTaskExecDecision(synapseApiBase, roomId, { decision, comment });
      message.success(decision === 'approve' ? '已通过，流程将推进' : '已驳回');
      onDecided?.();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const agentInstallHint =
    (payload?.agent_cli && typeof payload.agent_cli === 'object'
      ? String(payload.agent_cli.install_hint || '')
      : '') || String(payload?.error || '');

  useEffect(() => {
    if (agentCliMissing) setInstallOpen(true);
  }, [agentCliMissing]);

  const onAgentReady = async () => {
    setReprocessing(true);
    try {
      await reprocessMeetingRoom(
        synapseApiBase,
        roomId,
        'task_exec',
        'Cursor Agent CLI 已安装，重新执行任务执行',
      );
      message.success('已触发任务执行重新处理，请稍候刷新结果');
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
        加载任务执行结果…
      </div>
    );
  }

  if (isRunning && !payload) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        任务执行进行中，等待首批进度…
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
        <Alert type="warning" message="暂无任务执行结果" showIcon />
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
        : 'CLI 任务执行进行中…'));

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
                {isRunning ? '任务执行进度' : '任务执行评审'}
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
            </div>
            <p className="text-sm text-muted-foreground m-0 leading-relaxed">
              {isRunning
                ? `Cursor CLI 正在处理研发子单，页面每 3 秒自动刷新。${total ? `共 ${total} 个子单。` : ''}`
                : agentCliMissing
                ? payload?.status === 'agent_cli_login_required'
                  ? '任务执行尚未开始：Cursor Agent CLI 已安装，请先完成账号登录。'
                  : '任务执行尚未开始：本机缺少 Cursor Agent CLI（agent），请先安装后再重新执行。'
                : `CLI 已循环处理 ${total} 个研发子单 · 成功 ${ok} 个 · 请核对研发工作汇报、工作路径与提示词后裁决`}
            </p>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '子单总数', value: total, icon: <Bot className="h-4 w-4 text-violet-400" /> },
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

      {blocked ? (
        <Alert type="error" showIcon message="任务执行已被驳回，需人工介入后重新处理" />
      ) : null}

      <div className="space-y-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-foreground/90">
          <ListTree className="h-3.5 w-3.5 text-amber-400" />
          子单明细
        </div>
        {tasks.length === 0 && !agentCliMissing && !isRunning ? (
          <Alert type="warning" message="无子单执行记录" showIcon />
        ) : (
          tasks.map((t) => <TaskRowCard key={String(t.task_no)} task={t} />)
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

      {!agentCliMissing && !isRunning ? (
      <div className="rounded-xl border border-border/60 bg-muted/20 p-5 space-y-6">
        <label className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
          评审意见（可选）
        </label>
        <TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="补充对 CLI 执行结果的评价、风险说明或后续建议…"
          disabled={blocked || submitting}
        />
        <div className="flex flex-wrap gap-4 justify-end pt-3">
          <Button
            danger
            icon={<XCircle className="h-4 w-4" />}
            loading={submitting}
            disabled={blocked}
            onClick={() => void onDecision('reject')}
          >
            不通过
          </Button>
          <Button
            type="primary"
            icon={<CheckCircle2 className="h-4 w-4" />}
            loading={submitting}
            disabled={blocked}
            className="bg-emerald-600 hover:bg-emerald-500"
            onClick={() => void onDecision('approve')}
          >
            通过并推进
          </Button>
        </div>
      </div>
      ) : null}
      </div>
    </div>
  );
}
