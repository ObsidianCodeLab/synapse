/**
 * NodeReviewPanel —— SOP 节点确认总结（PR 2/3/4 NodeReview 体系）
 *
 * 四段式：metrics 概览 / 工作摘要 / 产出物 / 人工裁决。替代 result_confirm 场景下
 * 的老 MeetingHitlForm；其他 intervention_kind（interactive / exception）维持原逻辑。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Tooltip, message } from 'antd';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Crown,
  FileCode2,
  FileText,
  Hash,
  Hammer,
  Loader2,
  RefreshCw,
  Sparkles,
  Timer,
  Users,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';

import {
  fetchNodeReview,
  submitReviewDecision,
  type NodeReviewAgentRow,
  type NodeReviewArtifactFile,
  type NodeReviewPayload,
  type NodeReviewSummary,
  type ReviewDecisionMode,
} from '../../../api/meetingRoomService';
import { MarkdownArtifactsPanel, toMarkdownArtifactFiles } from './MarkdownArtifactsPanel';
import { ReviewMarkdown } from './ReviewMarkdown';

interface Props {
  synapseApiBase: string;
  roomId: string;
  nodeId?: string;
  /** 父组件可预置 payload（来自 live.pending_delivery.review_payload）以避免首屏空白 */
  initialPayload?: NodeReviewPayload | null;
  onDecided?: (mode: ReviewDecisionMode) => void;
  /** 只读模式：隐藏人工裁决区（节点处理详情） */
  readOnly?: boolean;
  /** 只读模式标题 */
  title?: string;
}

const MD_EXTS = new Set(['.md', '.markdown']);

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m${rem ? ` ${rem}s` : ''}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

const ACCENT = {
  host: {
    icon: <Crown className="w-4 h-4" />,
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
    bar: 'from-amber-400 to-orange-400',
    label: '主持人',
  },
  worker: {
    icon: <Bot className="w-4 h-4" />,
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
    bar: 'from-violet-400 to-fuchsia-400',
    label: '协作智能体',
  },
};

/** profile_id 跟在智能体名后，同行省略，悬停展示全量 */
const ProfileIdInline: React.FC<{ profileId: string; className?: string }> = ({
  profileId,
  className = '',
}) => {
  const id = (profileId || '').trim();
  if (!id) return null;
  return (
    <Tooltip title={id} placement="topLeft" mouseEnterDelay={0.2}>
      <span
        className={`min-w-0 truncate text-[10px] text-muted-foreground font-mono cursor-default ${className}`}
      >
        {id}
      </span>
    </Tooltip>
  );
};

// ─── Metrics ────────────────────────────────────────────────────────────

const MetricStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div
    className={`flex-1 min-w-[160px] rounded-xl border ${accent} px-4 py-3
      bg-gradient-to-br from-white/[0.02] to-white/[0.06]
      shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]`}
  >
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-80">
      {icon}
      <span>{label}</span>
    </div>
    <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
  </div>
);

const AgentMetricsCard: React.FC<{ row: NodeReviewAgentRow }> = ({ row }) => {
  const accent = ACCENT[row.role === 'host' ? 'host' : 'worker'];
  const total = row.tool_calls + row.skill_calls;
  return (
    <div className="rounded-xl border border-border/60 bg-[color:var(--panel)]/60 p-4 transition hover:border-border hover:shadow-lg">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <span className={`inline-flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${accent.badge}`}>
          {accent.icon}
          {accent.label}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="shrink-0 font-semibold text-foreground">{row.display_name}</span>
          <ProfileIdInline profileId={row.profile_id} className="flex-1" />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3 text-center">
        <div>
          <div className="text-[10px] text-muted-foreground">委派</div>
          <div className="font-mono text-base text-foreground tabular-nums">{row.delegations}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">工具</div>
          <div className="font-mono text-base text-foreground tabular-nums">{row.tool_calls}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">技能</div>
          <div className="font-mono text-base text-foreground tabular-nums">{row.skill_calls}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Token</div>
          <div className="font-mono text-base text-foreground tabular-nums">{row.tokens.toLocaleString()}</div>
        </div>
      </div>

      {total > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {row.tools.slice(0, 8).map((t) => (
            <Tooltip key={`tool-${t.name}`} title={`工具调用 ${t.count} 次`}>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-[11px] text-blue-300">
                <Wrench className="w-3 h-3" />
                {t.name}
                <span className="opacity-70">×{t.count}</span>
              </span>
            </Tooltip>
          ))}
          {row.skills.slice(0, 6).map((s) => (
            <Tooltip key={`skill-${s.skill}`} title={`技能调用 ${s.count} 次`}>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300">
                <Sparkles className="w-3 h-3" />
                {s.skill}
                <span className="opacity-70">×{s.count}</span>
              </span>
            </Tooltip>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground italic">本节点未调用工具/技能</div>
      )}
    </div>
  );
};

// ─── Summaries ──────────────────────────────────────────────────────────

const AgentSummaryItem: React.FC<{ summary: NodeReviewSummary; defaultOpen?: boolean }> = ({
  summary,
  defaultOpen,
}) => {
  const [open, setOpen] = useState(!!defaultOpen);
  const accent = ACCENT[summary.role === 'host' ? 'host' : 'worker'];
  const isLlm = summary.source === 'llm';
  return (
    <div className="rounded-xl border border-border/60 bg-[color:var(--panel)]/40 overflow-hidden transition">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors"
      >
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${accent.badge}`}>
          {accent.icon}
          {accent.label}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left">
          <span className="shrink-0 font-semibold text-foreground">{summary.display_name}</span>
          <ProfileIdInline profileId={summary.profile_id} className="flex-1" />
        </div>
        {!isLlm ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            兜底摘要
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
            LLM 总结
          </span>
        )}
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="px-5 pb-5 pt-2 border-t border-border/30 bg-gradient-to-b from-white/[0.02] to-transparent">
          <ReviewMarkdown content={summary.summary_markdown || '_（无摘要内容）_'} compact />
        </div>
      ) : null}
    </div>
  );
};

// ─── Artifacts ──────────────────────────────────────────────────────────

const ArtifactsSection: React.FC<{
  files: NodeReviewArtifactFile[];
  synapseApiBase: string;
  roomId: string;
}> = ({ files, synapseApiBase, roomId }) => {
  const mdFiles = useMemo(() => files.filter((f) => MD_EXTS.has(f.ext)), [files]);
  const otherFiles = useMemo(() => files.filter((f) => !MD_EXTS.has(f.ext)), [files]);
  const markdownEntries = useMemo(() => toMarkdownArtifactFiles(mdFiles), [mdFiles]);

  if (!files.length) {
    return <div className="text-muted-foreground text-sm italic">本节点暂无归档文件</div>;
  }

  return (
    <div className="space-y-3">
      {otherFiles.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {otherFiles.map((f) => (
            <span
              key={f.relative_path}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border/40 bg-muted/20 text-[11px] text-muted-foreground"
              title={f.relative_path}
            >
              <FileCode2 className="w-3 h-3" />
              {f.name}
              <span className="text-[10px] opacity-70 font-mono">{formatBytes(f.size)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {markdownEntries.length ? (
        <MarkdownArtifactsPanel
          files={markdownEntries}
          synapseApiBase={synapseApiBase}
          roomId={roomId}
        />
      ) : otherFiles.length ? null : (
        <div className="text-muted-foreground text-sm italic">暂无可预览的 Markdown 产出物</div>
      )}
    </div>
  );
};

// ─── Human decision box ────────────────────────────────────────────────

const DecisionBox: React.FC<{
  busy: boolean;
  pendingMode: ReviewDecisionMode | null;
  onSubmit: (mode: ReviewDecisionMode, comment: string) => void;
}> = ({ busy, pendingMode, onSubmit }) => {
  const [comment, setComment] = useState('');
  const btnState = (mode: ReviewDecisionMode) => ({
    loading: busy && pendingMode === mode,
    disabled: busy && pendingMode !== mode,
  });
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/[0.06] to-violet-500/[0.04] p-5">
      <div className="flex items-center gap-2 mb-2 text-foreground">
        <Hammer className="w-4 h-4 text-blue-300" />
        <span className="font-semibold">人工裁决</span>
        <span className="text-[11px] text-muted-foreground">
          通过则归档并进入下一节点；打回会带上你的备注重跑本节点；异常介入会暂停流水线等待人工兜底。
        </span>
      </div>
      <Input.TextArea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="可选：填写评审备注 / 返工指引 / 异常说明…"
        autoSize={{ minRows: 3, maxRows: 8 }}
        disabled={busy}
        className="!bg-black/30 !text-foreground !border-border/60"
      />
      <div className="flex flex-wrap gap-2 mt-3 justify-end">
        <Button
          danger
          icon={<AlertTriangle className="w-4 h-4" />}
          {...btnState('escalate')}
          onClick={() => onSubmit('escalate', comment.trim())}
        >
          异常介入
        </Button>
        <Button
          icon={<XCircle className="w-4 h-4" />}
          {...btnState('reject')}
          onClick={() => onSubmit('reject', comment.trim())}
        >
          打回返工
        </Button>
        <Button
          type="primary"
          icon={<CheckCircle2 className="w-4 h-4" />}
          {...btnState('approve')}
          onClick={() => onSubmit('approve', comment.trim())}
        >
          通过归档
        </Button>
      </div>
    </div>
  );
};

// ─── Main ──────────────────────────────────────────────────────────────

export const NodeReviewPanel: React.FC<Props> = ({
  synapseApiBase,
  roomId,
  nodeId,
  initialPayload,
  onDecided,
  readOnly = false,
  title,
}) => {
  const [payload, setPayload] = useState<NodeReviewPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMode, setSubmittingMode] = useState<ReviewDecisionMode | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (nodeId === 'solution_review') {
        setError('方案评审节点请使用方案评审面板查看');
        setPayload(null);
        return;
      }
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const data = await fetchNodeReview(synapseApiBase, roomId, { nodeId, refresh });
        if (nodeId && data.node_id && data.node_id !== nodeId) {
          setPayload(null);
          setError(`节点数据不匹配（期望 ${nodeId}，收到 ${data.node_id}）`);
          return;
        }
        setPayload(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [nodeId, roomId, synapseApiBase],
  );

  useEffect(() => {
    setPayload(readOnly ? null : (initialPayload ?? null));
    setError(null);
    void load(false);
  }, [nodeId, roomId, synapseApiBase, readOnly, load]);

  const onSubmit = useCallback(
    async (mode: ReviewDecisionMode, comment: string) => {
      setSubmitting(true);
      setSubmittingMode(mode);
      try {
        await submitReviewDecision(synapseApiBase, roomId, mode, comment);
        message.success(
          mode === 'approve' ? '已确认归档' : mode === 'reject' ? '已打回，将重跑本节点' : '已转入异常介入',
        );
        onDecided?.(mode);
      } catch (e) {
        message.error(e instanceof Error ? e.message : '提交失败');
      } finally {
        setSubmitting(false);
        setSubmittingMode(null);
      }
    },
    [onDecided, roomId, synapseApiBase],
  );

  const metrics = payload?.metrics;
  const headerActions = readOnly ? null : (
    <div className="flex items-center gap-2">
      <Tooltip title="重新计算 metrics / 产出物（不重跑 LLM 摘要）">
        <Button
          size="small"
          icon={<RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          loading={refreshing}
          onClick={() => load(true)}
        >
          刷新指标
        </Button>
      </Tooltip>
    </div>
  );

  const hostMetrics = useMemo(() => metrics?.host ?? null, [metrics]);
  const workerMetrics = metrics?.workers ?? [];

  return (
    <div className="h-full min-h-0 overflow-y-auto custom-scrollbar bg-[color:var(--panel)]">
      <div className="max-w-[980px] mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {readOnly ? title || '节点处理详情' : '节点确认总结'}
            </div>
            <h2 className="text-xl font-semibold text-foreground mt-1">
              {payload?.node_name || nodeId || '—'}
              <span className="ml-2 text-[12px] font-mono text-muted-foreground">
                #{payload?.node_id || nodeId || ''}
              </span>
            </h2>
            {payload?.node_intent ? (
              <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2 max-w-[680px]">
                {payload.node_intent}
              </p>
            ) : null}
          </div>
          {headerActions}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在装配确认总结…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200 text-sm">
            读取失败：{error}
          </div>
        ) : !payload ? (
          <div className="text-muted-foreground py-8 text-center">暂无确认总结数据</div>
        ) : (
          <>
            {/* 1. Metrics overview */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Zap className="w-4 h-4 text-blue-300" />
                整体指标
              </div>
              <div className="flex flex-wrap gap-3">
                <MetricStat
                  icon={<Hash className="w-3.5 h-3.5" />}
                  label="本节点 Token"
                  value={(metrics?.node_token_total ?? 0).toLocaleString()}
                  accent="border-blue-500/40 text-blue-300"
                />
                <MetricStat
                  icon={<Timer className="w-3.5 h-3.5" />}
                  label="节点耗时"
                  value={formatDuration(metrics?.node_duration_seconds ?? 0)}
                  accent="border-emerald-500/40 text-emerald-300"
                />
                <MetricStat
                  icon={<Users className="w-3.5 h-3.5" />}
                  label="委派次数"
                  value={metrics?.delegation_total ?? 0}
                  accent="border-amber-500/40 text-amber-300"
                />
                <MetricStat
                  icon={<Wrench className="w-3.5 h-3.5" />}
                  label="工具/技能调用"
                  value={(metrics?.tool_call_total ?? 0) + (metrics?.skill_call_total ?? 0)}
                  accent="border-violet-500/40 text-violet-300"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {hostMetrics ? <AgentMetricsCard row={hostMetrics} /> : null}
                {workerMetrics.map((w) => (
                  <AgentMetricsCard key={w.profile_id} row={w} />
                ))}
              </div>
            </section>

            {/* 2. Summaries */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Sparkles className="w-4 h-4 text-emerald-300" />
                工作摘要（{payload.summaries.length}）
              </div>
              {payload.summaries.length === 0 ? (
                <div className="text-muted-foreground text-sm italic">没有可展示的摘要</div>
              ) : (
                <div className="space-y-2">
                  {payload.summaries.map((s, idx) => (
                    <AgentSummaryItem
                      key={`${s.profile_id}-${idx}`}
                      summary={s}
                      defaultOpen={s.role === 'host' || idx === 0}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 3. Artifacts */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <FileText className="w-4 h-4 text-blue-300" />
                节点产出物（{payload.artifacts.length}）
              </div>
              {payload.artifacts.length === 0 ? (
                <div className="text-muted-foreground text-sm italic">本节点暂无归档文件</div>
              ) : (
                <ArtifactsSection
                  files={payload.artifacts}
                  synapseApiBase={synapseApiBase}
                  roomId={roomId}
                />
              )}
            </section>

            {/* 4. Human decision */}
            {!readOnly ? (
              <section>
                <DecisionBox busy={submitting} pendingMode={submittingMode} onSubmit={onSubmit} />
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default NodeReviewPanel;
