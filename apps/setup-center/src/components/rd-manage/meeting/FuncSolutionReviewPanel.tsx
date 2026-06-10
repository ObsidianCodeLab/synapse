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
  Check,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  Layers,
  Loader2,
  MessageSquareWarning,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';

import {
  fetchFuncSolutionReview,
  reprocessMeetingRoom,
  saveFuncSolutionPlanReviews,
  submitFuncSolutionReviewDecision,
  type FuncSolutionReviewPayload,
  type FuncSolutionTransformationPlan,
} from '../../../api/meetingRoomService';
import { MermaidPreviewBlock } from '@/components/product/MermaidPreviewBlock';
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
  initialPayload?: FuncSolutionReviewPayload | null;
  blocked?: boolean;
  onDecided?: () => void;
}

type PlanDraft = {
  status: 'pending' | 'approved' | 'needs_change';
  comment: string;
  collapsed: boolean;
  showRejectForm: boolean;
};

function planDraftFromPayload(plan: FuncSolutionTransformationPlan): PlanDraft {
  const st = plan.human_review?.status || 'pending';
  const status = st === 'approved' ? 'approved' : st === 'needs_change' ? 'needs_change' : 'pending';
  return {
    status,
    comment: plan.human_review?.comment || '',
    collapsed: status === 'approved',
    showRejectForm: status === 'needs_change',
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
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  isDark: boolean;
}> = ({ plan, draft, onChange, isDark }) => {
  const approved = draft.status === 'approved';
  const needsChange = draft.status === 'needs_change';
  const reqLabel = (plan.requirement_summary || plan.requirement_ref || '').trim();
  const moduleLabel = (plan.module_name || '').trim();

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

  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        approved
          ? 'border-[rgba(0,255,178,0.35)] bg-[rgba(0,217,165,0.08)]'
          : needsChange
            ? 'border-amber-500/45 bg-amber-500/[0.05]'
            : 'border-border/60 bg-gradient-to-br from-white/[0.03] to-white/[0.01]'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            {moduleLabel ? (
              <Tag color="purple" className="m-0 inline-flex items-center px-2.5 py-1 text-[13px] leading-snug">
                模块 · {moduleLabel}
              </Tag>
            ) : null}
            {reqLabel ? (
              <Tag color="blue" className="m-0 inline-flex items-center px-2.5 py-1 text-[13px] leading-snug">
                需求 · {reqLabel}
              </Tag>
            ) : null}
            {approved ? (
              <Tag
                className="m-0 inline-flex items-center border-[rgba(0,255,178,0.35)] bg-[rgba(0,217,165,0.15)] px-2.5 py-1 text-[13px] leading-snug text-[#5efecf]"
              >
                已通过
              </Tag>
            ) : needsChange ? (
              <Tag color="warning" className="m-0 inline-flex items-center px-2.5 py-1 text-[13px] leading-snug">
                需调整
              </Tag>
            ) : (
              <Tag className="m-0 inline-flex items-center px-2.5 py-1 text-[13px] leading-snug">待评审</Tag>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CollapseToggle
            collapsed={draft.collapsed}
            onToggle={() => onChange({ ...draft, collapsed: !draft.collapsed })}
          />
          <ApproveToggle approved={approved} onToggle={toggleApprove} />
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

          {!approved ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
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

          {draft.showRejectForm || needsChange ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-4">
              <Text className="block text-[10px] leading-relaxed text-amber-200/90">
                评审意见（必填，说明不合理之处或改进方向，≥{MIN_PLAN_COMMENT_LEN} 字）
              </Text>
              <TextArea
                rows={3}
                value={draft.comment}
                placeholder="例如：优先级调整应走现有 TaskService 扩展，不应新增并行入口…"
                className="mt-3.5 text-[12px]"
                onChange={(e) =>
                  onChange({
                    ...draft,
                    status: 'needs_change',
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
  initialPayload,
  blocked,
  onDecided,
}: Props) {
  const [payload, setPayload] = useState<FuncSolutionReviewPayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState(!initialPayload);
  const [submitting, setSubmitting] = useState(false);
  const [overallComment, setOverallComment] = useState('');
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>(() =>
    draftsFromPayload(initialPayload),
  );
  /** 本地逐条评审有未保存编辑时，禁止轮询 initialPayload 覆盖 planDrafts */
  const draftsDirtyRef = useRef(false);
  const overallCommentDirtyRef = useRef(false);
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

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
  }, [initialPayload, reload]);

  const plans = payload?.transformation_plans || [];
  const approvedCount = plans.filter((p) => planDrafts[p.id]?.status === 'approved').length;
  const needsChangePlans = plans.filter((p) => planDrafts[p.id]?.status === 'needs_change');
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

  const validateNeedsChangeComments = (): string | null => {
    for (const p of needsChangePlans) {
      const comment = (planDrafts[p.id]?.comment || '').trim();
      if (comment.length < MIN_PLAN_COMMENT_LEN) {
        return `「${p.title || p.module_name}」的评审意见至少 ${MIN_PLAN_COMMENT_LEN} 字`;
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
      if (needsChangePlans.length === 0) {
        message.warning('请对需调整的改造方案点击「请求变更」并填写评审意见');
        return;
      }
      const commentErr = validateNeedsChangeComments();
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
        message.success('已提交修订意见，正在触发方案重新设计…');
        try {
          const brief = needsChangePlans
            .map((p) => {
              const c = (planDrafts[p.id]?.comment || '').trim();
              return `【${p.title || p.module_name}】${c}`;
            })
            .join('\n');
          await reprocessMeetingRoom(
            synapseApiBase,
            roomId,
            'func_solution',
            brief || overallComment.trim() || undefined,
          );
          message.success('已触发函数级方案重新处理');
        } catch (e) {
          message.warning(
            e instanceof Error
              ? `评审意见已保存，但自动重跑失败：${e.message}。请手动点击「重新处理」。`
              : '评审意见已保存，请手动点击「重新处理」',
          );
        }
      } else {
        message.success('函数级方案评审已通过');
      }
      draftsDirtyRef.current = false;
      overallCommentDirtyRef.current = false;
      onDecided?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '提交失败';
      if (msg.includes('no_plans_need_change')) {
        message.warning('请至少标记一条改造方案为「请求变更」');
      } else if (msg.includes('plan_comment_required')) {
        message.warning('每条「需调整」方案须填写评审意见');
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
              右上角「通过」胶囊按钮一键确认；不通过请「请求变更」并填写意见
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
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
        {blocked ? (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            message="上次评审要求修订方案"
            description="小鲸将根据各条评审意见调整对应改造方案；若未自动重跑，请对本节点执行「重新处理」。"
          />
        ) : null}

        {(overview?.architecture_summary || (overview?.diagrams?.length ?? 0) > 0) && (
          <section className="mb-6 rounded-2xl border border-border/50 bg-gradient-to-br from-slate-500/5 to-transparent p-5">
            <div className="mb-3 flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-cyan-400" />
              <Text strong>方案总览（总）</Text>
            </div>
            {overview?.architecture_summary ? (
              <ReviewMarkdown content={overview.architecture_summary} compact className="mb-4 text-[12px]" />
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {(overview?.diagrams || []).map((d) => (
                <div
                  key={d.id || d.title}
                  className="overflow-hidden rounded-xl border border-border/40 bg-black/15 p-3"
                >
                  <Text className="mb-2 block text-[11px] font-medium text-muted-foreground">
                    {d.title || '流程/关系图'}
                  </Text>
                  {d.mermaid ? (
                    <MermaidPreviewBlock source={d.mermaid} isDark={isDark} />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}

        {consistency?.summary || (consistency?.contradiction_checks?.length ?? 0) > 0 ? (
          <section className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
            <div className="mb-2 flex items-center gap-2">
              <Target className="h-4 w-4 text-amber-400" />
              <Text strong>合理性与兼容性分析</Text>
            </div>
            {consistency.summary ? (
              <p className="mb-2 text-[12px] text-foreground/90">{consistency.summary}</p>
            ) : null}
            {(consistency.contradiction_checks || []).map((line) => (
              <p key={line} className="text-[11px] text-muted-foreground">
                ✓ {line}
              </p>
            ))}
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex items-center gap-2">
            <Layers className="h-4 w-4 text-violet-400" />
            <Text strong>改造方案清单</Text>
            <Tooltip title="保存当前逐条评审状态">
              <Button size="small" type="link" onClick={() => void persistPlans()}>
                保存进度
              </Button>
            </Tooltip>
          </div>

          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanReviewCard
                key={plan.id}
                plan={plan}
                draft={planDrafts[plan.id] || planDraftFromPayload(plan)}
                isDark={isDark}
                onChange={(next) => updatePlanDraft(plan.id, next)}
              />
            ))}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-border/50 bg-black/20 px-6 py-4">
        <Text className="mb-2 block text-[11px] text-muted-foreground">
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
          className="mb-3 text-[12px]"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            danger
            icon={<XCircle className="h-4 w-4" />}
            loading={submitting}
            disabled={needsChangePlans.length === 0}
            onClick={() => void handleDecision('revise')}
          >
            提交修订并重跑 ({needsChangePlans.length})
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
    </div>
  );
}
