/**
 * 任务执行评审面板：展示 CLI 批量执行结果，供人工确认后推进。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, Tag, Typography, message } from 'antd';
import {
  Bot,
  CheckCircle2,
  Clock,
  Coins,
  FolderGit2,
  Loader2,
  Sparkles,
  Target,
  Terminal,
  XCircle,
} from 'lucide-react';
import {
  fetchTaskExec,
  submitTaskExecDecision,
  type TaskExecPayload,
  type TaskExecTaskRow,
} from '../../../api/meetingRoomService';
import { CLI_TOOL_OPTIONS } from './cliToolConfig';
import { ReviewMarkdown } from './ReviewMarkdown';

const { TextArea } = Input;
const { Text } = Typography;

const STATUS_COLOR: Record<string, string> = {
  ok: 'success',
  completed: 'success',
  partial: 'warning',
  failed: 'error',
  skipped: 'default',
};

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeId?: string;
  initialPayload?: TaskExecPayload | null;
  blocked?: boolean;
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

function TaskRowCard({ task }: { task: TaskExecTaskRow }) {
  const status = String(task.status || '—');
  const cov = Array.isArray(task.coverage) ? task.coverage : [];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-amber-950/20 p-4 shadow-[0_8px_32px_rgba(251,191,36,0.08)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/10 blur-2xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Tag color={STATUS_COLOR[status] || 'default'} className="m-0 font-mono text-[10px]">
              {status.toUpperCase()}
            </Tag>
            <span className="font-semibold text-foreground text-sm truncate">
              {task.task_no} {task.task_title || ''}
            </span>
          </div>
          {task.product_module ? (
            <p className="text-[11px] text-muted-foreground mt-1 mb-0">{task.product_module}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
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

      <div className="relative space-y-2 text-[12px]">
        <div className="flex items-start gap-2">
          <Target className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-muted-foreground">任务目标 · </span>
            <span className="text-foreground/90">{task.goal || '—'}</span>
          </div>
        </div>
        {cov.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pl-5">
            {cov.map((fp) => (
              <Tag key={fp} className="m-0 text-[10px] border-amber-500/25 bg-amber-500/10 text-amber-200">
                {fp}
              </Tag>
            ))}
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <FolderGit2 className="h-3.5 w-3.5 text-cyan-400 mt-0.5 shrink-0" />
          <code className="text-[10px] text-cyan-300/90 break-all">{task.sandbox_path || '—'}</code>
        </div>
        {task.error ? (
          <Alert type="error" showIcon message={String(task.error)} className="text-[11px]" />
        ) : null}
        {task.report_markdown ? (
          <details className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/50 px-3 py-2">
            <summary className="cursor-pointer text-[11px] text-muted-foreground select-none">
              CLI 任务报告
            </summary>
            <div className="mt-2 max-h-48 overflow-y-auto custom-scrollbar">
              <ReviewMarkdown content={String(task.report_markdown)} />
            </div>
          </details>
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
  onDecided,
}: Props) {
  const [payload, setPayload] = useState<TaskExecPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchTaskExec(synapseApiBase, roomId);
      setPayload(res.payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [synapseApiBase, roomId]);

  useEffect(() => {
    if (!initialPayload) void refresh();
  }, [initialPayload, refresh]);

  const summary = payload?.summary;
  const tasks = useMemo(
    () => (Array.isArray(payload?.tasks) ? payload.tasks : []) as TaskExecTaskRow[],
    [payload?.tasks],
  );

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

  if (loading && !payload) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载任务执行结果…
      </div>
    );
  }

  if (error && !payload) {
    return <Alert type="error" message={error} showIcon />;
  }

  if (!payload) {
    return <Alert type="warning" message="暂无任务执行结果" showIcon />;
  }

  const ok = Number(summary?.ok || 0);
  const total = Number(summary?.total || tasks.length);

  return (
    <div className="space-y-5 pb-6">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-violet-500/10 to-slate-900 p-6 shadow-[0_16px_48px_rgba(251,191,36,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.15),transparent_55%)]" />
        <div className="relative flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 border border-amber-400/30 shadow-[0_0_24px_rgba(251,191,36,0.25)]">
            <Terminal className="h-7 w-7 text-amber-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-foreground m-0 tracking-tight">任务执行评审</h2>
              <Tag icon={<Sparkles className="h-3 w-3" />} color="gold" className="m-0">
                {cliLabel(String(payload.cli_tool || ''))}
              </Tag>
            </div>
            <p className="text-sm text-muted-foreground m-0 leading-relaxed">
              CLI 已循环处理 {total} 个研发子单 · 成功 {ok} 个 · 请核对沙箱路径、覆盖功能与任务报告后裁决
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

      {blocked ? (
        <Alert type="error" showIcon message="任务执行已被驳回，需人工介入后重新处理" />
      ) : null}

      <div className="space-y-3">
        <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          子单执行明细
        </Text>
        {tasks.length === 0 ? (
          <Alert type="warning" message="无子单执行记录" showIcon />
        ) : (
          tasks.map((t) => <TaskRowCard key={String(t.task_no)} task={t} />)
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <label className="text-xs font-semibold text-foreground/80">评审意见（可选）</label>
        <TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="补充对 CLI 执行结果的评价、风险说明或后续建议…"
          disabled={blocked || submitting}
        />
        <div className="flex flex-wrap gap-3 justify-end">
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
    </div>
  );
}
