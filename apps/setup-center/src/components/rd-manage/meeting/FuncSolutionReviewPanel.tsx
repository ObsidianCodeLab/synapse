/**
 * 函数级方案评审面板：解析改造方案，按 需求 → 模块 展示；GitHub PR 式逐条打勾评审
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Crown,
  GitBranch,
  Hash,
  Layers,
  Loader2,
  MessageSquareWarning,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Users,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';

import {
  fetchFuncSolutionReview,
  fetchNodeReview,
  saveFuncSolutionPlanReviews,
  submitFuncSolutionReviewDecision,
  type FuncSolutionReviewPayload,
  type FuncSolutionTransformationPlan,
  type NodeReviewAgentRow,
  type NodeReviewMetrics,
} from '../../../api/meetingRoomService';
import { useAntThemeDark } from '../../rd-view/useAntThemeDark';
import { MermaidDiagramCard } from './MermaidDiagramCard';
import { PlanTransformationContent } from './PlanTransformationContent';
import { ReviewMarkdown } from './ReviewMarkdown';

const { TextArea } = Input;
const { Text, Title } = Typography;

const MIN_OVERALL_COMMENT_LEN = 20;
const MIN_PLAN_COMMENT_LEN = 8;

interface Props {
  synapseApiBase: string;
  roomId: string;
  scopeId?: string;
  nodeId?: string;
  initialPayload?: FuncSolutionReviewPayload | null;
  blocked?: boolean;
  /** 历史只读：展示评审结论与节点处理指标，隐藏裁决操作 */
  readOnly?: boolean;
  onDecided?: () => void;
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

const MetricStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div
    className={`min-w-[140px] flex-1 rounded-xl border ${accent} px-4 py-3
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
  const isHost = row.role === 'host';
  const badge = isHost
    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
    : 'bg-violet-500/15 text-violet-300 border-violet-500/40';
  const icon = isHost ? <Crown className="h-4 w-4" /> : <Bot className="h-4 w-4" />;
  const label = isHost ? '主持人' : '协作智能体';
  return (
    <div className="rounded-xl border border-border/60 bg-[color:var(--panel)]/60 p-4">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ${badge}`}>
          {icon}
          {label}
        </span>
        <span className="min-w-0 truncate font-semibold text-foreground">{row.display_name}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[10px] text-muted-foreground">委派</div>
          <div className="font-mono text-base tabular-nums">{row.delegations}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">工具</div>
          <div className="font-mono text-base tabular-nums">{row.tool_calls}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">技能</div>
          <div className="font-mono text-base tabular-nums">{row.skill_calls}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Token</div>
          <div className="font-mono text-base tabular-nums">{row.tokens.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};

function NodeProcessingMetricsSection({ metrics }: { metrics: NodeReviewMetrics | null }) {
  if (!metrics) return null;
  const host = metrics.host;
  const workers = metrics.workers ?? [];
  const hasAgentRows = Boolean(host) || workers.length > 0;
  return (
    <section className="mb-6 rounded-2xl border border-border/50 bg-gradient-to-br from-blue-500/[0.04] to-transparent p-5">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-blue-300" />
        <Text strong>节点处理详情 · 整体指标</Text>
      </div>
      <div className="flex flex-wrap gap-3">
        <MetricStat
          icon={<Hash className="h-3.5 w-3.5" />}
          label="本节点 Token"
          value={(metrics.node_token_total ?? 0).toLocaleString()}
          accent="border-blue-500/40 text-blue-300"
        />
        <MetricStat
          icon={<Timer className="h-3.5 w-3.5" />}
          label="节点耗时"
          value={formatDuration(metrics.node_duration_seconds ?? 0)}
          accent="border-emerald-500/40 text-emerald-300"
        />
        <MetricStat
          icon={<Users className="h-3.5 w-3.5" />}
          label="委派次数"
          value={metrics.delegation_total ?? 0}
          accent="border-amber-500/40 text-amber-300"
        />
        <MetricStat
          icon={<Wrench className="h-3.5 w-3.5" />}
          label="工具/技能调用"
          value={(metrics.tool_call_total ?? 0) + (metrics.skill_call_total ?? 0)}
          accent="border-violet-500/40 text-violet-300"
        />
      </div>
      {hasAgentRows ? (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {host ? <AgentMetricsCard row={host} /> : null}
          {workers.map((w) => (
            <AgentMetricsCard key={w.profile_id} row={w} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type PlanDraft = {
  status: 'pending' | 'approved' | 'needs_change' | 'deprecated';
  comment: string;
  collapsed: boolean;
  showRejectForm: boolean;
};

function planDraftFromPayload(plan: FuncSolutionTransformationPlan): PlanDraft {
  const st = plan.human_review?.status || 'pending';
  const status =
    st === 'approved'
      ? 'approved'
      : st === 'needs_change'
        ? 'needs_change'
        : st === 'deprecated'
          ? 'deprecated'
          : 'pending';
  return {
    status,
    comment: plan.human_review?.comment || '',
    collapsed: status === 'approved',
    showRejectForm: status === 'needs_change' || status === 'deprecated',
  };
}

function draftsFromPayload(payload: FuncSolutionReviewPayload | null | undefined) {
  const drafts: Record<string, PlanDraft> = {};
  for (const p of payload?.transformation_plans || []) {
    if (p.id) drafts[p.id] = planDraftFromPayload(p);
  }
  return drafts;
}

const DESIGN_DETAIL_TEXT_CLASS = 'mt-2 text-[11px] leading-relaxed text-muted-foreground';
const DESIGN_DETAIL_LABEL_CLASS = 'font-medium text-foreground/80';

/** 将「改造类型：…；职责：…」分段渲染，标签色与「预期效果：」一致 */
function renderLabeledDetailText(text: string): React.ReactNode {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[；;]\s*/).filter(Boolean);
  const segments = parts.length > 1 ? parts : [trimmed];

  return segments.map((part, i) => {
    const colonIdx = part.search(/[：:]/);
    if (colonIdx < 0) {
      return (
        <span key={`${part}-${i}`}>
          {i > 0 ? '；' : null}
          {part}
        </span>
      );
    }
    const label = part.slice(0, colonIdx + 1);
    const value = part.slice(colonIdx + 1);
    return (
      <span key={`${part}-${i}`}>
        {i > 0 ? '；' : null}
        <span className={DESIGN_DETAIL_LABEL_CLASS}>{label}</span>
        {value}
      </span>
    );
  });
}

const ApproveToggle: React.FC<{
  approved: boolean;
  disabled?: boolean;
  onToggle: () => void;
}> = ({ approved, disabled, onToggle }) => (
  <Tooltip title={approved ? '点击取消通过' : '标记评审通过'} mouseEnterDelay={0.5}>
    <button
      type="button"
      disabled={disabled}
      aria-pressed={approved}
      aria-label={approved ? '取消通过' : '标记评审通过'}
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium leading-none whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ffb2]/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
        approved
          ? 'border border-[rgba(0,255,178,0.42)] bg-[#00d9a5] text-[#022a1f] shadow-[0_2px_12px_rgba(0,255,178,0.32)] hover:bg-[#00ffb2]'
          : 'border border-border/55 bg-white/[0.03] text-muted-foreground hover:border-[rgba(0,255,178,0.38)] hover:bg-[rgba(0,217,165,0.12)] hover:text-[#5efecf]'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <Check
        className={`h-3.5 w-3.5 shrink-0 ${approved ? 'stroke-[2.5]' : 'stroke-[2] opacity-75'}`}
      />
      <span>{approved ? '已通过' : '通过'}</span>
    </button>
  </Tooltip>
);

const CollapseToggle: React.FC<{
  collapsed: boolean;
  onToggle: () => void;
}> = ({ collapsed, onToggle }) => (
  <button
    type="button"
    aria-expanded={!collapsed}
    aria-label={collapsed ? '展开改造详情' : '收起改造详情'}
    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium leading-none whitespace-nowrap text-muted-foreground transition-colors duration-200 hover:bg-white/[0.03] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ffb2]/50 active:scale-[0.98]"
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
  >
    <ChevronDown
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    />
    <span>{collapsed ? '展开' : '收起'}</span>
  </button>
);

const PlanReviewCard: React.FC<{
  plan: FuncSolutionTransformationPlan;
  index: number;
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  isDark: boolean;
  readOnly?: boolean;
}> = ({ plan, index, draft, onChange, isDark, readOnly = false }) => {
  const approved = draft.status === 'approved';
  const needsChange = draft.status === 'needs_change';
  const deprecated = draft.status === 'deprecated';
  const reqLabel = (plan.requirement_summary || plan.requirement_ref || '').trim();
  const moduleLabel = (plan.module_name || '').trim();
  const titleLabel = (plan.title || moduleLabel || `改造方案 ${index + 1}`).trim();

  const toggleApprove = () => {
    if (approved) {
      onChange({ ...draft, status: 'pending', collapsed: false, showRejectForm: false });
      return;
    }
    onChange({
      ...draft,
      status: 'approved',
      collapsed: true,
      showRejectForm: false,
      comment: '',
    });
  };

  const requestChanges = () => {
    onChange({
      ...draft,
      status: 'needs_change',
      collapsed: false,
      showRejectForm: true,
    });
  };

  const requestDeprecate = () => {
    onChange({
      ...draft,
      status: 'deprecated',
      collapsed: false,
      showRejectForm: true,
    });
  };

  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        approved
          ? 'border-[rgba(0,255,178,0.35)] bg-[rgba(0,217,165,0.08)]'
          : deprecated
            ? 'border-red-500/45 bg-red-500/[0.05]'
            : needsChange
              ? 'border-amber-500/45 bg-amber-500/[0.05]'
              : 'border-border/60 bg-gradient-to-br from-white/[0.03] to-white/[0.01]'
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[12px] font-semibold ${
            approved
              ? 'border-[rgba(0,255,178,0.4)] bg-[rgba(0,217,165,0.15)] text-[#5efecf]'
              : deprecated
                ? 'border-red-500/45 bg-red-500/12 text-red-200'
                : needsChange
                  ? 'border-amber-500/45 bg-amber-500/12 text-amber-200'
                  : 'border-violet-500/35 bg-violet-500/12 text-violet-200'
          }`}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 text-[13.5px] font-semibold leading-snug text-foreground">
              {titleLabel}
            </span>
            {approved ? (
              <Tag className="m-0 inline-flex shrink-0 items-center border-[rgba(0,255,178,0.35)] bg-[rgba(0,217,165,0.15)] px-2 py-0.5 text-[11px] leading-snug text-[#5efecf]">
                已通过
              </Tag>
            ) : deprecated ? (
              <Tag color="error" className="m-0 inline-flex shrink-0 items-center px-2 py-0.5 text-[11px] leading-snug">
                待废弃
              </Tag>
            ) : needsChange ? (
              <Tag color="warning" className="m-0 inline-flex shrink-0 items-center px-2 py-0.5 text-[11px] leading-snug">
                需调整
              </Tag>
            ) : (
              <Tag className="m-0 inline-flex shrink-0 items-center px-2 py-0.5 text-[11px] leading-snug">待评审</Tag>
            )}
          </div>
          {(moduleLabel || reqLabel) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {moduleLabel ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Layers className="h-3 w-3 shrink-0 text-violet-400" />
                  <span className="truncate">{moduleLabel}</span>
                </span>
              ) : null}
              {reqLabel ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Target className="h-3 w-3 shrink-0 text-cyan-400" />
                  <span className="truncate">{reqLabel}</span>
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CollapseToggle
            collapsed={draft.collapsed}
            onToggle={() => onChange({ ...draft, collapsed: !draft.collapsed })}
          />
          {readOnly ? null : <ApproveToggle approved={approved} onToggle={toggleApprove} />}
        </div>
      </div>

      {!draft.collapsed ? (
        <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
          {(plan.design_rationale || plan.expected_effect) && (
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.04] p-3">
              <Text className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/90">
                设计逻辑 · 为什么这样改
              </Text>
              {plan.design_rationale ? (
                <p className={DESIGN_DETAIL_TEXT_CLASS}>{renderLabeledDetailText(plan.design_rationale)}</p>
              ) : null}
              {plan.expected_effect ? (
                <p className={DESIGN_DETAIL_TEXT_CLASS}>
                  <span className={DESIGN_DETAIL_LABEL_CLASS}>预期效果：</span>
                  {plan.expected_effect}
                </p>
              ) : null}
            </div>
          )}

          {plan.design_evidence && plan.design_evidence.length > 0 ? (
            <div>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
                设计依据
              </Text>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-foreground/85">
                {plan.design_evidence.map((ev) => (
                  <li key={ev}>{ev}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {plan.content_markdown ? (
            <PlanTransformationContent markdown={plan.content_markdown} />
          ) : null}

          {!readOnly && !approved ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
              <Button
                size="small"
                danger={deprecated}
                type={deprecated ? 'primary' : 'default'}
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={requestDeprecate}
              >
                {deprecated ? '继续填写废弃原因' : '废弃'}
              </Button>
              <Button
                size="small"
                danger={needsChange}
                type={needsChange ? 'primary' : 'default'}
                icon={<MessageSquareWarning className="h-3.5 w-3.5" />}
                onClick={requestChanges}
              >
                {needsChange ? '继续填写意见' : '请求变更'}
              </Button>
            </div>
          ) : null}

          {readOnly && (needsChange || deprecated) && draft.comment.trim() ? (
            <div
              className={`rounded-lg border p-4 ${
                deprecated
                  ? 'border-red-500/30 bg-red-500/[0.04]'
                  : 'border-amber-500/30 bg-amber-500/[0.04]'
              }`}
            >
              <Text
                className={`!mb-1 block text-[10px] font-medium ${
                  deprecated ? 'text-red-200/90' : 'text-amber-200/90'
                }`}
              >
                {deprecated ? '废弃原因' : '评审意见'}
              </Text>
              <p className="text-[12px] leading-relaxed text-foreground/90">{draft.comment.trim()}</p>
            </div>
          ) : null}

          {!readOnly && (draft.showRejectForm || needsChange || deprecated) ? (
            <div
              className={`flex flex-col gap-4 rounded-lg border p-4 ${
                deprecated
                  ? 'border-red-500/30 bg-red-500/[0.04]'
                  : 'border-amber-500/30 bg-amber-500/[0.04]'
              }`}
            >
              <Text
                className={`!mb-0 block text-[10px] leading-relaxed ${
                  deprecated ? 'text-red-200/90' : 'text-amber-200/90'
                }`}
              >
                {deprecated
                  ? `废弃原因（必填，说明为何完全移除此改造方案，≥${MIN_PLAN_COMMENT_LEN} 字）`
                  : `评审意见（必填，说明不合理之处或改进方向，≥${MIN_PLAN_COMMENT_LEN} 字）`}
              </Text>
              <TextArea
                rows={3}
                value={draft.comment}
                placeholder={
                  deprecated
                    ? '例如：该模块已有等价实现，无需重复改造；移除后不影响主链路…'
                    : '例如：优先级调整应走现有 TaskService 扩展，不应新增并行入口…'
                }
                className="text-[12px]"
                onChange={(e) =>
                  onChange({
                    ...draft,
                    status: deprecated ? 'deprecated' : 'needs_change',
                    comment: e.target.value,
                    showRejectForm: true,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export function FuncSolutionReviewPanel({
  synapseApiBase,
  roomId,
  nodeId = 'func_solution',
  initialPayload,
  blocked,
  readOnly = false,
  onDecided,
}: Props) {
  const [payload, setPayload] = useState<FuncSolutionReviewPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [nodeMetrics, setNodeMetrics] = useState<NodeReviewMetrics | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [overallComment, setOverallComment] = useState('');
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>(() =>
    draftsFromPayload(initialPayload),
  );
  /** 本地逐条评审有未保存编辑时，禁止轮询 initialPayload 覆盖 planDrafts */
  const draftsDirtyRef = useRef(false);
  const overallCommentDirtyRef = useRef(false);
  const isDark = useAntThemeDark();

  const reload = useCallback(async () => {
    if (!synapseApiBase || !roomId) return;
    setLoading(true);
    try {
      const res = await fetchFuncSolutionReview(synapseApiBase, roomId);
      setPayload(res.payload);
      if (!draftsDirtyRef.current) {
        setPlanDrafts(draftsFromPayload(res.payload));
      }
      if (!overallCommentDirtyRef.current) {
        setOverallComment(res.payload.human_review?.comment || '');
      }
    } catch {
      message.error('加载函数级方案评审数据失败');
    } finally {
      setLoading(false);
    }
  }, [synapseApiBase, roomId]);

  useEffect(() => {
    draftsDirtyRef.current = false;
    overallCommentDirtyRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (readOnly) {
      void reload();
      return;
    }
    if (initialPayload) {
      setPayload(initialPayload);
      if (!draftsDirtyRef.current) {
        setPlanDrafts(draftsFromPayload(initialPayload));
      }
      if (!overallCommentDirtyRef.current) {
        setOverallComment(initialPayload.human_review?.comment || '');
      }
      setLoading(false);
      return;
    }
    void reload();
  }, [initialPayload, readOnly, reload]);

  useEffect(() => {
    if (!readOnly || !synapseApiBase || !roomId) {
      setNodeMetrics(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchNodeReview(synapseApiBase, roomId, { nodeId, refresh: true });
        if (!cancelled) setNodeMetrics(data.metrics ?? null);
      } catch {
        if (!cancelled) setNodeMetrics(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readOnly, synapseApiBase, roomId, nodeId]);

  const plans = payload?.transformation_plans || [];
  const approvedCount = plans.filter((p) => planDrafts[p.id]?.status === 'approved').length;
  const needsChangePlans = plans.filter((p) => planDrafts[p.id]?.status === 'needs_change');
  const deprecatedPlans = plans.filter((p) => planDrafts[p.id]?.status === 'deprecated');
  const reviseActionCount = needsChangePlans.length + deprecatedPlans.length;
  const allApproved = plans.length > 0 && approvedCount === plans.length;

  const planUpdates = useCallback(
    () =>
      plans.map((p) => ({
        id: p.id,
        status: planDrafts[p.id]?.status || 'pending',
        comment: planDrafts[p.id]?.comment || '',
      })),
    [plans, planDrafts],
  );

  const persistPlans = useCallback(async () => {
    const res = await saveFuncSolutionPlanReviews(synapseApiBase, roomId, planUpdates());
    setPayload(res.payload);
    draftsDirtyRef.current = false;
    message.success('评审进度已保存');
  }, [planUpdates, synapseApiBase, roomId]);

  const updatePlanDraft = useCallback((planId: string, next: PlanDraft) => {
    draftsDirtyRef.current = true;
    setPlanDrafts((prev) => ({ ...prev, [planId]: next }));
  }, []);

  const validateReviseActionComments = (): string | null => {
    for (const p of [...needsChangePlans, ...deprecatedPlans]) {
      const comment = (planDrafts[p.id]?.comment || '').trim();
      const action = planDrafts[p.id]?.status === 'deprecated' ? '废弃原因' : '评审意见';
      if (comment.length < MIN_PLAN_COMMENT_LEN) {
        return `「${p.title || p.module_name}」的${action}至少 ${MIN_PLAN_COMMENT_LEN} 字`;
      }
    }
    return null;
  };

  const handleDecision = async (decision: 'approve' | 'revise') => {
    if (decision === 'approve') {
      if (!allApproved) {
        message.warning('请先逐条勾选全部改造方案为「通过」');
        return;
      }
      if (overallComment.trim().length < MIN_OVERALL_COMMENT_LEN) {
        message.warning(`总体评审意见至少 ${MIN_OVERALL_COMMENT_LEN} 字`);
        return;
      }
    } else {
      if (reviseActionCount === 0) {
        message.warning('请对需处理的改造方案点击「废弃」或「请求变更」并填写意见');
        return;
      }
      const commentErr = validateReviseActionComments();
      if (commentErr) {
        message.warning(commentErr);
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitFuncSolutionReviewDecision(synapseApiBase, roomId, {
        decision,
        comment: overallComment.trim(),
        plans: planUpdates(),
      });

      if (decision === 'revise') {
        message.success('已提交修订意见，正在按 marked plans 增量修订…');
      } else {
        message.success('函数级方案评审已通过');
      }
      draftsDirtyRef.current = false;
      overallCommentDirtyRef.current = false;
      onDecided?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '提交失败';
      if (msg.includes('no_plans_need_change')) {
        message.warning('请至少标记一条改造方案为「废弃」或「请求变更」');
      } else if (msg.includes('plan_comment_required')) {
        message.warning('每条「需调整」或「待废弃」方案须填写意见');
      } else {
        message.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !payload) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载函数级方案评审…
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="p-6">
        <Alert
          type="warning"
          showIcon
          message="未找到 func_solution_review.json，请先完成小鲸函数级方案技能产出"
        />
      </div>
    );
  }

  const overview = payload.overview;
  const consistency = payload.consistency_analysis;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--panel)]">
      <div className="shrink-0 border-b border-border/50 bg-gradient-to-r from-violet-500/10 via-cyan-500/5 to-[rgba(0,217,165,0.08)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-violet-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] font-medium uppercase tracking-wider">函数级方案评审</span>
            </div>
            <Title level={4} className="!mb-1 !text-foreground">
              {payload.requirement_name || '函数级改造方案'}
            </Title>
            <Text type="secondary" className="text-[12px]">
              每条改造方案展示<strong>改造内容</strong>与<strong>设计逻辑</strong>；
              右上角「通过」胶囊按钮一键确认；不通过可「废弃」（完全移除）或「请求变更」（覆盖修订）并填写意见
            </Text>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-black/20 px-4 py-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-[#00ffb2]">
                {approvedCount}/{plans.length}
              </div>
              <div className="text-[10px] text-muted-foreground">方案已通过</div>
            </div>
            {needsChangePlans.length > 0 ? (
              <div className="text-center">
                <div className="text-lg font-semibold text-amber-400">{needsChangePlans.length}</div>
                <div className="text-[10px] text-muted-foreground">待调整</div>
              </div>
            ) : null}
            {deprecatedPlans.length > 0 ? (
              <div className="text-center">
                <div className="text-lg font-semibold text-red-400">{deprecatedPlans.length}</div>
                <div className="text-[10px] text-muted-foreground">待废弃</div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
        {readOnly ? <NodeProcessingMetricsSection metrics={nodeMetrics} /> : null}

        {blocked ? (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            message="上次评审要求修订方案"
            description="系统将保留已通过改造方案；标记「请求变更」的按意见覆盖修订，标记「废弃」的将从清单完全移除；完成后会再次进入本评审面板。"
          />
        ) : null}

        {(overview?.architecture_summary || (overview?.diagrams?.length ?? 0) > 0) && (
          <section className="mb-6 overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.05] via-transparent to-violet-500/[0.04]">
            <div className="flex items-center gap-2.5 border-b border-cyan-500/15 bg-cyan-500/[0.06] px-5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15">
                <GitBranch className="h-4 w-4 text-cyan-300" />
              </div>
              <div>
                <Text strong className="!text-[13px]">方案总览</Text>
                <div className="text-[10px] text-muted-foreground">改造在系统中的位置与主链路</div>
              </div>
              {(overview?.diagrams?.length ?? 0) > 0 ? (
                <span className="ml-auto rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] text-cyan-200/90">
                  {overview?.diagrams?.length} 张架构图
                </span>
              ) : null}
            </div>
            <div className="space-y-4 p-5">
              {overview?.architecture_summary ? (
                <div className="rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3">
                  <ReviewMarkdown content={overview.architecture_summary} compact className="text-[12px]" />
                </div>
              ) : null}
              {(overview?.diagrams || []).map((d) =>
                d.mermaid ? (
                  <MermaidDiagramCard
                    key={d.id || d.title}
                    title={d.title}
                    kind={d.kind}
                    source={d.mermaid}
                    isDark={isDark}
                  />
                ) : null,
              )}
            </div>
          </section>
        )}

        {consistency?.summary ||
        (consistency?.compatibility_notes?.length ?? 0) > 0 ||
        (consistency?.contradiction_checks?.length ?? 0) > 0 ? (
          <section className="mb-6 overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
            <div className="flex items-center gap-2.5 border-b border-amber-500/15 bg-amber-500/[0.05] px-5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15">
                <Target className="h-4 w-4 text-amber-300" />
              </div>
              <div>
                <Text strong className="!text-[13px]">合理性与兼容性分析</Text>
                <div className="text-[10px] text-muted-foreground">改造方案之间的一致性与对现有功能的影响</div>
              </div>
            </div>
            <div className="space-y-3 p-5">
              {consistency.summary ? (
                <p className="m-0 text-[12px] leading-relaxed text-foreground/90">{consistency.summary}</p>
              ) : null}
              {(consistency.compatibility_notes?.length ?? 0) > 0 ? (
                <ul className="m-0 space-y-1.5 p-0">
                  {(consistency.compatibility_notes || []).map((line) => (
                    <li key={line} className="flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00d9a5]" />
                      <span className="min-w-0">{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {(consistency.contradiction_checks || []).map((line) => (
                <p key={line} className="m-0 flex gap-2 text-[11.5px] text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00d9a5]" />
                  <span className="min-w-0">{line}</span>
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/15">
                <Layers className="h-4 w-4 text-violet-300" />
              </div>
              <div>
                <Text strong className="!text-[13px]">改造方案清单</Text>
                <div className="text-[10px] text-muted-foreground">
                  按 需求 → 模块 逐条评审，共 {plans.length} 条
                </div>
              </div>
            </div>
            {plans.length > 0 ? (
              <div className="flex min-w-[160px] flex-1 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#00d9a5] to-[#00ffb2] transition-all duration-500"
                    style={{ width: `${Math.round((approvedCount / plans.length) * 100)}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {approvedCount}/{plans.length}
                </span>
              </div>
            ) : null}
            {readOnly ? null : (
              <Tooltip title="保存当前逐条评审状态">
                <Button size="small" type="link" onClick={() => void persistPlans()}>
                  保存进度
                </Button>
              </Tooltip>
            )}
          </div>

          <div className="space-y-3">
            {plans.map((plan, i) => (
              <PlanReviewCard
                key={plan.id}
                plan={plan}
                index={i}
                draft={planDrafts[plan.id] || planDraftFromPayload(plan)}
                isDark={isDark}
                readOnly={readOnly}
                onChange={(next) => updatePlanDraft(plan.id, next)}
              />
            ))}
          </div>
        </section>

        {readOnly && overallComment.trim() ? (
          <section className="mt-6 rounded-2xl border border-border/50 bg-black/15 p-5">
            <Text className="!mb-2 block text-[11px] font-medium text-muted-foreground">总体评审意见</Text>
            <p className="text-[12px] leading-relaxed text-foreground/90">{overallComment.trim()}</p>
          </section>
        ) : null}
      </div>

      {readOnly ? null : (
      <div className="shrink-0 border-t border-border/50 bg-black/20 px-6 py-4">
        <div className="flex flex-col gap-4">
          <Text className="!mb-0 block text-[11px] text-muted-foreground">
            总体评审意见（全部通过时必填，≥{MIN_OVERALL_COMMENT_LEN} 字）
          </Text>
          <TextArea
            rows={2}
            value={overallComment}
            onChange={(e) => {
              overallCommentDirtyRef.current = true;
              setOverallComment(e.target.value);
            }}
            placeholder="总结方案整体合理性；全部通过时说明同意推进的理由…"
            className="text-[12px]"
          />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button
            danger
            icon={<XCircle className="h-4 w-4" />}
            loading={submitting}
            disabled={reviseActionCount === 0}
            onClick={() => void handleDecision('revise')}
          >
            提交修订并重跑 ({reviseActionCount})
          </Button>
          <Button
            type="primary"
            icon={<CheckCircle2 className="h-4 w-4" />}
            loading={submitting}
            disabled={!allApproved}
            onClick={() => void handleDecision('approve')}
          >
            全部通过并推进
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
