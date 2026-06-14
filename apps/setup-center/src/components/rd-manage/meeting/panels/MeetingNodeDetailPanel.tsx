/**
 * MeetingNodeDetailPanel — 会议室节点详情（产出 / 消耗 / 流程）
 * 节点 token/耗时取自 meeting-summary（room_state.node_metrics）；流程/产出等仍拉 agent-contexts 等。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spin, Tabs, Tooltip } from 'antd';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Clock,
  Coins,
  Crown,
  FileCode2,
  FileText,
  Hammer,
  Loader2,
  RefreshCw,
  Server,
  Sparkles,
  Timer,
  TrendingUp,
  Wrench,
  Zap,
} from 'lucide-react';
import {
  fetchMeetingAgentContexts,
  fetchMeetingSummary,
  fetchNodeReview,
  fetchSystemNodeDisplay,
  fetchTaskExec,
  type MeetingSummaryNode,
  type NodeReviewPayload,
  type ProcessingHistoryEntry,
} from '../../../../api/meetingRoomService';
import { MarkdownArtifactsPanel, toMarkdownArtifactFiles } from '../MarkdownArtifactsPanel';
import {
  SYSTEM_STRUCTURED_NODE_IDS,
  SystemNodeDetailCard,
} from '../SystemNodeCards';
import {
  KnowledgeBaseTab,
  KnowledgeGraphTab,
  knowledgeBaseTabLabel,
  knowledgeGraphTabLabel,
  SimilarTicketsTab,
  similarTicketsTabLabel,
} from './MeetingNodeReferenceTabs';

export type MeetingNodeVisualState =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'human_intervention'
  | 'error';

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeType?: 'demand' | 'task';
  scopeId?: string;
  nodeId: string;
  nodeName: string;
  nodeState: MeetingNodeVisualState;
  /** 轮询间隔（处理中节点），0 表示不轮询 */
  pollMs?: number;
  /** 工单管理抽屉：可横向滚轮切换 Tab，隐藏 Ant Design「…」溢出菜单 */
  variant?: 'default' | 'orderDrawer';
}

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

function formatActivityTime(ts?: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ReactNode; chip: string; dot: string }
> = {
  input: {
    label: '输入',
    icon: <ArrowDownToLine className="w-3 h-3" />,
    chip: 'bg-sky-500/12 text-sky-200 border-sky-500/35',
    dot: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.5)]',
  },
  output: {
    label: '输出',
    icon: <ArrowUpFromLine className="w-3 h-3" />,
    chip: 'bg-emerald-500/12 text-emerald-200 border-emerald-500/35',
    dot: 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]',
  },
  llm_usage: {
    label: 'LLM',
    icon: <BrainCircuit className="w-3 h-3" />,
    chip: 'bg-violet-500/15 text-violet-100 border-violet-500/40',
    dot: 'bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.55)]',
  },
  tool: {
    label: '工具',
    icon: <Wrench className="w-3 h-3" />,
    chip: 'bg-slate-500/12 text-slate-200 border-slate-500/35',
    dot: 'bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.35)]',
  },
  skill_load: {
    label: '技能加载',
    icon: <BookOpen className="w-3 h-3" />,
    chip: 'bg-cyan-500/12 text-cyan-200 border-cyan-500/35',
    dot: 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]',
  },
  skill_exec: {
    label: '技能执行',
    icon: <Sparkles className="w-3 h-3" />,
    chip: 'bg-amber-500/12 text-amber-200 border-amber-500/35',
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]',
  },
  skill: {
    label: '技能',
    icon: <Sparkles className="w-3 h-3" />,
    chip: 'bg-amber-500/12 text-amber-200 border-amber-500/35',
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]',
  },
};

function categoryMeta(cat?: string) {
  const key = (cat || 'tool').trim();
  return CATEGORY_META[key] ?? CATEGORY_META.tool;
}

function isPrimaryEntry(entry: ProcessingHistoryEntry): boolean {
  if (entry.presentation_tier === 'secondary') return false;
  if (entry.presentation_tier === 'primary') return true;
  return (entry.category || '') !== 'llm_usage';
}

function MetricTile({
  icon,
  label,
  value,
  accent,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={`relative overflow-hidden rounded-xl border ${accent} px-4 py-3
        bg-gradient-to-br from-white/[0.03] to-white/[0.07]
        shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}
    >
      <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/[0.03] blur-xl" />
      <div className="relative flex items-center gap-2 text-[10px] uppercase tracking-wider opacity-75">
        {icon}
        <span>{label}</span>
      </div>
      <div className="relative mt-1.5 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
    </motion.div>
  );
}

function ProcessTimelineItem({ entry, index }: { entry: ProcessingHistoryEntry; index: number }) {
  const cat = categoryMeta(entry.category);
  const title =
    entry.display_title || entry.title || entry.tool_name || entry.skill_name || entry.category_label || '活动';
  const summary = entry.summary || entry.result_preview || '';
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="relative flex gap-3 pb-4 last:pb-0"
    >
      <div className="flex flex-col items-center">
        <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${cat.dot}`} />
        <div className="mt-1 w-px flex-1 bg-gradient-to-b from-border/80 to-transparent min-h-[12px]" />
      </div>
      <div className="min-w-0 flex-1 -mt-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] ${cat.chip}`}
          >
            {cat.icon}
            {cat.label}
          </span>
          <span className="text-xs font-medium text-foreground/95 truncate">{title}</span>
          {entry.duration_ms ? (
            <span className="font-mono text-[10px] text-muted-foreground">{entry.duration_ms}ms</span>
          ) : null}
          {entry.total_tokens ? (
            <span className="font-mono text-[10px] text-amber-500/90">{entry.total_tokens} tk</span>
          ) : null}
          <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
            {formatActivityTime(entry.ts)}
          </span>
        </div>
        {summary ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
        ) : null}
      </div>
    </motion.div>
  );
}

function PendingLivePlaceholder() {
  return (
    <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
      <CircleDashed className="h-10 w-10 opacity-40" />
      <p className="text-sm">节点尚未开始，暂无产出与流程数据</p>
    </div>
  );
}

export function MeetingNodeDetailPanel({
  synapseApiBase,
  roomId,
  scopeType = 'demand',
  scopeId = '',
  nodeId,
  nodeName,
  nodeState,
  pollMs = 0,
  variant = 'default',
}: Props) {
  const tabsRootRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState('output');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<NodeReviewPayload | null>(null);
  const [summaryNode, setSummaryNode] = useState<MeetingSummaryNode | null>(null);
  const [fallbackArtifacts, setFallbackArtifacts] = useState<
    { name: string; relative_path: string; size: number; ext?: string }[]
  >([]);
  const [processEntries, setProcessEntries] = useState<ProcessingHistoryEntry[]>([]);
  const [systemDisplay, setSystemDisplay] = useState<Record<string, unknown> | null>(null);
  const isStructuredSystemNode = SYSTEM_STRUCTURED_NODE_IDS.includes(
    nodeId as (typeof SYSTEM_STRUCTURED_NODE_IDS)[number],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (!roomId || !nodeId) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const sid = (scopeId || '').trim();
        const skipNodeReview = nodeId === 'solution_review';
        const isTaskExecLive = nodeId === 'task_exec' && nodeState === 'processing';
        const [reviewRes, ctxRes, summaryRes, systemRes, taskExecRes] = await Promise.allSettled([
          skipNodeReview
            ? Promise.resolve(null)
            : fetchNodeReview(synapseApiBase, roomId, { nodeId, refresh }),
          fetchMeetingAgentContexts(synapseApiBase, roomId, { messageCharLimit: 0, nodeId }),
          sid
            ? fetchMeetingSummary(synapseApiBase, scopeType, sid)
            : Promise.reject(new Error('missing_scope')),
          isStructuredSystemNode
            ? fetchSystemNodeDisplay(synapseApiBase, roomId, nodeId)
            : Promise.resolve(null),
          isTaskExecLive ? fetchTaskExec(synapseApiBase, roomId) : Promise.resolve(null),
        ]);

        if (reviewRes.status === 'fulfilled' && reviewRes.value) {
          setReview(reviewRes.value);
        } else if (nodeState !== 'pending' && !skipNodeReview) {
          setReview(null);
        }

        const ctx = ctxRes.status === 'fulfilled' ? ctxRes.value : null;
        const entries: ProcessingHistoryEntry[] = [];
        for (const agent of ctx?.agents ?? []) {
          for (const h of agent.processing_history ?? []) {
            if ((h.node_id || ctx?.current_node_id) === nodeId && isPrimaryEntry(h)) {
              entries.push(h);
            }
          }
        }
        entries.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));

        if (taskExecRes.status === 'fulfilled' && taskExecRes.value?.payload) {
          const te = taskExecRes.value.payload;
          const progress = te.progress;
          if (progress?.message) {
            entries.push({
              id: `task-exec-${progress.updated_at || progress.phase || 'live'}`,
              ts: progress.updated_at,
              category: 'tool',
              display_title: 'CLI 任务执行',
              summary: progress.message,
              node_id: nodeId,
            });
          }
          for (const task of te.tasks || []) {
            if (String(task.status || '') !== 'running') continue;
            entries.push({
              id: `task-exec-row-${task.task_no}-${task.phase || 'running'}`,
              ts: progress?.updated_at,
              category: 'tool',
              display_title: `${task.task_no || '工单'} · ${task.phase === 'verify' ? '完成检测' : '开发轮'}`,
              summary: task.task_title || task.goal || '执行中',
              node_id: nodeId,
            });
          }
          entries.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));
        }
        setProcessEntries(entries);

        if (systemRes.status === 'fulfilled' && systemRes.value?.display) {
          setSystemDisplay(systemRes.value.display);
        } else if (!isStructuredSystemNode) {
          setSystemDisplay(null);
        } else {
          setSystemDisplay(null);
        }

        if (summaryRes.status === 'fulfilled') {
          const sn = summaryRes.value.nodes?.find((n) => n.node_id === nodeId) ?? null;
          setSummaryNode(sn);
          const archiveFiles =
            summaryRes.value.archive_index
              ?.filter((a) => a.node_id === nodeId)
              .flatMap((a) =>
                a.files.map((f) => ({
                  name: f.name,
                  relative_path: f.relative_path,
                  size: f.size,
                  ext: f.name.includes('.') ? f.name.slice(f.name.lastIndexOf('.')) : '',
                })),
              ) ?? [];
          setFallbackArtifacts(archiveFiles);
        } else {
          setFallbackArtifacts([]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [isStructuredSystemNode, nodeId, nodeName, nodeState, roomId, scopeId, scopeType, synapseApiBase],
  );

  useEffect(() => {
    if (nodeState === 'pending') return;
    void load(false);
  }, [load, nodeState, nodeId, roomId]);

  useEffect(() => {
    if (nodeState !== 'processing') return;
    setReview((prev) => (prev ? { ...prev, artifacts: [] } : null));
    setFallbackArtifacts([]);
  }, [nodeState, nodeId]);

  useEffect(() => {
    if (!pollMs || nodeState !== 'processing') return;
    const t = window.setInterval(() => void load(true), pollMs);
    return () => window.clearInterval(t);
  }, [load, nodeState, pollMs]);

  useEffect(() => {
    if (variant !== 'orderDrawer') return;
    const root = tabsRootRef.current;
    if (!root) return;
    const wrap = root.querySelector<HTMLElement>('.ant-tabs-nav-wrap');
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      if (wrap.scrollWidth <= wrap.clientWidth + 2) return;
      const dominantVertical = Math.abs(e.deltaY) > Math.abs(e.deltaX);
      if (!dominantVertical && e.deltaX === 0) return;
      e.preventDefault();
      wrap.scrollLeft += dominantVertical ? e.deltaY : e.deltaX;
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [variant, activeTab]);

  const metrics = review?.metrics;
  const artifacts = review?.artifacts?.length ? review.artifacts : fallbackArtifacts;
  const mdArtifacts = useMemo(
    () =>
      toMarkdownArtifactFiles(
        artifacts.filter((f) => /\.(md|markdown)$/i.test(f.name)),
      ),
    [artifacts],
  );
  const otherArtifacts = useMemo(
    () => artifacts.filter((f) => !/\.(md|markdown)$/i.test(f.name)),
    [artifacts],
  );

  const tokenTotal = summaryNode?.metrics?.tokens ?? 0;
  const durationSec = summaryNode?.metrics?.deal_seconds ?? 0;
  const toolTotal = metrics?.tool_call_total ?? 0;
  const skillTotal = metrics?.skill_call_total ?? 0;
  const delegationTotal = metrics?.delegation_total ?? 0;

  const isPending = nodeState === 'pending';

  const header = (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Zap className="h-3 w-3 text-indigo-400" />
          节点实况
          {nodeState === 'processing' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" /> 进行中
            </span>
          ) : nodeState === 'completed' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> 已完成
            </span>
          ) : null}
        </div>
      </div>
      <Tooltip title="刷新指标与流程">
        <Button
          size="small"
          icon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          loading={refreshing}
          onClick={() => void load(true)}
        />
      </Tooltip>
    </div>
  );

  const metricsGrid = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricTile
        icon={<Timer className="h-3.5 w-3.5 text-indigo-400" />}
        label="节点耗时"
        value={formatDuration(durationSec)}
        accent="border-indigo-500/30"
        delay={0}
      />
      <MetricTile
        icon={<Coins className="h-3.5 w-3.5 text-amber-400" />}
        label="Token 消耗"
        value={tokenTotal.toLocaleString()}
        accent="border-amber-500/30"
        delay={0.05}
      />
      <MetricTile
        icon={<Hammer className="h-3.5 w-3.5 text-slate-300" />}
        label="工具 / 技能"
        value={`${toolTotal} / ${skillTotal}`}
        accent="border-slate-500/30"
        delay={0.1}
      />
      <MetricTile
        icon={<TrendingUp className="h-3.5 w-3.5 text-violet-400" />}
        label="委派次数"
        value={delegationTotal}
        accent="border-violet-500/30"
        delay={0.15}
      />
    </div>
  );

  const agentCards = (
    <div className="space-y-3">
      {metrics?.host ? (
        <div className="rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/[0.06] to-transparent p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-amber-300">
            <Crown className="h-3.5 w-3.5" /> 主持人 · {metrics.host.display_name}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            <div><div className="text-muted-foreground">委派</div><div className="font-mono text-base">{metrics.host.delegations}</div></div>
            <div><div className="text-muted-foreground">工具</div><div className="font-mono text-base">{metrics.host.tool_calls}</div></div>
            <div><div className="text-muted-foreground">技能</div><div className="font-mono text-base">{metrics.host.skill_calls}</div></div>
            <div><div className="text-muted-foreground">Token</div><div className="font-mono text-base">{metrics.host.tokens.toLocaleString()}</div></div>
          </div>
        </div>
      ) : null}
      {(metrics?.workers ?? []).map((w) => (
        <div key={w.profile_id} className="rounded-xl border border-violet-500/25 bg-gradient-to-r from-violet-500/[0.05] to-transparent p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-violet-300">
            <Bot className="h-3.5 w-3.5" /> 协作 · {w.display_name}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            <div><div className="text-muted-foreground">委派</div><div className="font-mono text-base">{w.delegations}</div></div>
            <div><div className="text-muted-foreground">工具</div><div className="font-mono text-base">{w.tool_calls}</div></div>
            <div><div className="text-muted-foreground">技能</div><div className="font-mono text-base">{w.skill_calls}</div></div>
            <div><div className="text-muted-foreground">Token</div><div className="font-mono text-base">{w.tokens.toLocaleString()}</div></div>
          </div>
        </div>
      ))}
    </div>
  );

  const outputTab = (
    <div className="space-y-4">
      {isStructuredSystemNode && systemDisplay ? (
        <SystemNodeDetailCard
          nodeId={nodeId}
          display={systemDisplay}
          roomId={roomId}
          scopeId={scopeId}
          synapseApiBase={synapseApiBase}
        />
      ) : isStructuredSystemNode ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">系统节点执行结果尚未就绪</p>
          {nodeState === 'processing' ? (
            <p className="mt-1 text-xs text-primary/80">脚本执行中，完成后将展示拆单/沙箱结构化结果</p>
          ) : null}
        </div>
      ) : mdArtifacts.length || otherArtifacts.length ? (
        <div className="space-y-3">
          {otherArtifacts.length ? (
            <div className="flex flex-wrap gap-2">
              {otherArtifacts.map((f) => (
                <span
                  key={f.relative_path}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground"
                  title={f.relative_path}
                >
                  <FileCode2 className="h-3 w-3" />
                  {f.name}
                  <span className="font-mono text-[10px] opacity-70">{formatBytes(f.size)}</span>
                </span>
              ))}
            </div>
          ) : null}
          {mdArtifacts.length ? (
            <MarkdownArtifactsPanel
              files={mdArtifacts}
              synapseApiBase={synapseApiBase}
              roomId={roomId}
              emptyMessage="本节点归档产物尚未生成"
            />
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">本节点归档产物尚未生成</p>
          {nodeState === 'processing' ? (
            <p className="mt-1 text-xs text-primary/80">智能体正在处理，完成后将自动归档至此</p>
          ) : null}
        </div>
      )}
    </div>
  );

  const metricsTab = (
    <div className="space-y-5">
      {metricsGrid}
      {agentCards}
      {!metrics && !summaryNode && !loading ? (
        <p className="text-center text-xs text-muted-foreground">指标汇总将在节点首次产出后可用</p>
      ) : null}
    </div>
  );

  const processTab = (
    <div className="rounded-xl border border-border/50 bg-[color:var(--panel)]/40 p-4">
      {processEntries.length ? (
        <AnimatePresence>
          {processEntries.map((entry, i) => (
            <ProcessTimelineItem key={`${entry.id || entry.ts}-${i}`} entry={entry} index={i} />
          ))}
        </AnimatePresence>
      ) : (
        <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
          <Activity className="h-8 w-8 opacity-30" />
          <p className="text-sm">暂无流程活动记录</p>
          {nodeState === 'processing' ? (
            <p className="text-xs text-primary/70">处理中，活动将实时写入…</p>
          ) : null}
        </div>
      )}
    </div>
  );

  const tabPaneClass =
    variant === 'orderDrawer'
      ? 'custom-scrollbar overflow-y-auto max-h-[min(58vh,560px)]'
      : 'custom-scrollbar overflow-y-auto max-h-[min(52vh,520px)]';

  const liveTabItems = [
    {
      key: 'output',
      label: (
        <span className="flex items-center gap-1.5 text-xs">
          <FileText className="h-3 w-3" /> 产出
          {!isPending && (isStructuredSystemNode && systemDisplay ? true : artifacts.length > 0) ? (
            <span className="rounded-full bg-primary/20 px-1.5 font-mono text-[10px] text-primary">
              {isStructuredSystemNode && systemDisplay ? '✓' : artifacts.length}
            </span>
          ) : null}
        </span>
      ),
      children: (
        <div className={`pt-3 ${tabPaneClass}`}>
          {isPending ? <PendingLivePlaceholder /> : outputTab}
        </div>
      ),
    },
    {
      key: 'metrics',
      label: (
        <span className="flex items-center gap-1.5 text-xs">
          <Coins className="h-3 w-3" /> 消耗
        </span>
      ),
      children: (
        <div className={`pt-3 ${tabPaneClass}`}>
          {isPending ? <PendingLivePlaceholder /> : metricsTab}
        </div>
      ),
    },
    {
      key: 'process',
      label: (
        <span className="flex items-center gap-1.5 text-xs">
          <Clock className="h-3 w-3" /> 流程
          {!isPending && processEntries.length ? (
            <span className="rounded-full bg-violet-500/20 px-1.5 font-mono text-[10px] text-violet-300">
              {processEntries.length}
            </span>
          ) : null}
        </span>
      ),
      children: (
        <div className={`pt-3 ${tabPaneClass}`}>
          {isPending ? <PendingLivePlaceholder /> : processTab}
        </div>
      ),
    },
    {
      key: 'similar-tickets',
      label: similarTicketsTabLabel(),
      children: (
        <div className={tabPaneClass}>
          <SimilarTicketsTab />
        </div>
      ),
    },
    {
      key: 'kb',
      label: knowledgeBaseTabLabel(),
      children: (
        <div className={tabPaneClass}>
          <KnowledgeBaseTab />
        </div>
      ),
    },
    {
      key: 'kg',
      label: knowledgeGraphTabLabel(),
      children: (
        <div className={tabPaneClass}>
          <KnowledgeGraphTab />
        </div>
      ),
    },
  ];

  const tabsClass =
    variant === 'orderDrawer'
      ? 'meeting-node-detail-tabs meeting-node-detail-tabs--drawer req-analysis-tabs flex-1 min-h-0'
      : 'meeting-node-detail-tabs req-analysis-tabs flex-1 min-h-0';

  return (
    <div ref={tabsRootRef} className="flex h-full min-h-0 flex-col">
      {!isPending ? header : null}
      {!isPending && loading && !review ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
          <Spin indicator={<Loader2 className="h-5 w-5 animate-spin text-primary" />} />
          <span className="text-sm">加载 {nodeName} 实况…</span>
        </div>
      ) : !isPending && error && !review && !processEntries.length ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          加载失败：{error}
        </div>
      ) : (
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="small"
          className={tabsClass}
          items={liveTabItems}
        />
      )}
    </div>
  );
}
