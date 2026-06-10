/**
 * 函数级方案评审面板：按 需求 → 模块 → 改造方案 维度展示与 GitHub 式逐条评审
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  CheckCircle2,
  ChevronDown,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';

import {
  fetchFuncSolutionReview,
  saveFuncSolutionPlanReviews,
  submitFuncSolutionReviewDecision,
  type FuncSolutionReviewPayload,
  type FuncSolutionTransformationPlan,
} from '../../../api/meetingRoomService';
import { MermaidPreviewBlock } from '@/components/product/MermaidPreviewBlock';
import { ReviewMarkdown } from './ReviewMarkdown';

const { TextArea } = Input;
const { Text, Title } = Typography;

const MIN_OVERALL_COMMENT_LEN = 20;

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
};

function groupPlans(plans: FuncSolutionTransformationPlan[]) {
  const groups: Record<string, Record<string, FuncSolutionTransformationPlan[]>> = {};
  for (const plan of plans) {
    const req = (plan.requirement_ref || plan.requirement_summary || '未标注需求').trim();
    const mod = (plan.module_name || '未标注模块').trim();
    groups[req] = groups[req] || {};
    groups[req][mod] = groups[req][mod] || [];
    groups[req][mod].push(plan);
  }
  return groups;
}

function planDraftFromPayload(plan: FuncSolutionTransformationPlan): PlanDraft {
  const st = plan.human_review?.status || 'pending';
  const status = st === 'approved' ? 'approved' : st === 'needs_change' ? 'needs_change' : 'pending';
  return {
    status,
    comment: plan.human_review?.comment || '',
    collapsed: status === 'approved',
  };
}

const PlanReviewCard: React.FC<{
  plan: FuncSolutionTransformationPlan;
  draft: PlanDraft;
  onChange: (next: PlanDraft) => void;
  isDark: boolean;
}> = ({ plan, draft, onChange, isDark }) => {
  const approved = draft.status === 'approved';

  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        approved
          ? 'border-emerald-500/40 bg-emerald-500/[0.06] shadow-[inset_0_1px_0_rgba(16,185,129,0.15)]'
          : 'border-border/60 bg-gradient-to-br from-white/[0.03] to-white/[0.01]'
      }`}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={() => onChange({ ...draft, collapsed: !draft.collapsed })}
      >
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            approved
              ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
              : 'border-border/70 bg-muted/30 text-muted-foreground'
          }`}
        >
          {approved ? <CheckCircle2 className="h-4 w-4" /> : <MessageSquare className="h-3.5 w-3.5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text strong className="text-[13px]">
              {plan.title || plan.module_name}
            </Text>
            {approved ? (
              <Tag color="success" className="m-0 text-[10px]">
                已通过
              </Tag>
            ) : draft.status === 'needs_change' ? (
              <Tag color="warning" className="m-0 text-[10px]">
                待调整
              </Tag>
            ) : (
              <Tag className="m-0 text-[10px]">待评审</Tag>
            )}
          </div>
          {plan.design_rationale ? (
            <Text type="secondary" className="mt-1 block text-[11px] line-clamp-2">
              {plan.design_rationale}
            </Text>
          ) : null}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            draft.collapsed ? '-rotate-90' : ''
          }`}
        />
      </button>

      {!draft.collapsed ? (
        <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
          {plan.requirement_summary ? (
            <div>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">满足的需求</Text>
              <p className="mt-1 text-[12px] text-foreground/90">{plan.requirement_summary}</p>
            </div>
          ) : null}
          {plan.design_evidence && plan.design_evidence.length > 0 ? (
            <div>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">设计依据</Text>
              <ul className="mt-1 list-disc pl-4 text-[11px] text-foreground/85">
                {plan.design_evidence.map((ev) => (
                  <li key={ev}>{ev}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.expected_effect ? (
            <div>
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">预期效果</Text>
              <p className="mt-1 text-[12px] text-foreground/90">{plan.expected_effect}</p>
            </div>
          ) : null}
          {plan.content_markdown ? (
            <div className="rounded-lg border border-border/50 bg-black/10 p-3">
              <ReviewMarkdown content={plan.content_markdown} compact />
            </div>
          ) : null}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Text className="text-[10px] text-muted-foreground">评审意见（需调整时填写）</Text>
              <TextArea
                rows={2}
                value={draft.comment}
                placeholder="说明不合理之处或改进建议…"
                className="mt-1 text-[12px]"
                onChange={(e) =>
                  onChange({
                    ...draft,
                    comment: e.target.value,
                    status: e.target.value.trim() ? 'needs_change' : draft.status,
                  })
                }
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="small"
                type={approved ? 'default' : 'primary'}
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={() =>
                  onChange({
                    ...draft,
                    status: approved ? 'pending' : 'approved',
                    collapsed: !approved,
                  })
                }
              >
                {approved ? '取消通过' : '标记通过'}
              </Button>
            </div>
          </div>
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
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';

  const reload = useCallback(async () => {
    if (!synapseApiBase || !roomId) return;
    setLoading(true);
    try {
      const res = await fetchFuncSolutionReview(synapseApiBase, roomId);
      setPayload(res.payload);
      const drafts: Record<string, PlanDraft> = {};
      for (const p of res.payload.transformation_plans || []) {
        if (p.id) drafts[p.id] = planDraftFromPayload(p);
      }
      setPlanDrafts(drafts);
      setOverallComment(res.payload.human_review?.comment || '');
    } catch {
      message.error('加载函数级方案评审数据失败');
    } finally {
      setLoading(false);
    }
  }, [synapseApiBase, roomId]);

  useEffect(() => {
    if (!initialPayload) void reload();
    else {
      const drafts: Record<string, PlanDraft> = {};
      for (const p of initialPayload.transformation_plans || []) {
        if (p.id) drafts[p.id] = planDraftFromPayload(p);
      }
      setPlanDrafts(drafts);
    }
  }, [initialPayload, reload]);

  const plans = payload?.transformation_plans || [];
  const grouped = useMemo(() => groupPlans(plans), [plans]);
  const approvedCount = plans.filter((p) => planDrafts[p.id]?.status === 'approved').length;
  const allApproved = plans.length > 0 && approvedCount === plans.length;

  const persistPlans = useCallback(async () => {
    const updates = plans.map((p) => ({
      id: p.id,
      status: planDrafts[p.id]?.status || 'pending',
      comment: planDrafts[p.id]?.comment || '',
    }));
    const res = await saveFuncSolutionPlanReviews(synapseApiBase, roomId, updates);
    setPayload(res.payload);
  }, [plans, planDrafts, synapseApiBase, roomId]);

  const handleDecision = async (decision: 'approve' | 'revise') => {
    if (decision === 'approve' && !allApproved) {
      message.warning('请先逐条标记全部改造方案为「通过」');
      return;
    }
    if (overallComment.trim().length < MIN_OVERALL_COMMENT_LEN) {
      message.warning(`总体评审意见至少 ${MIN_OVERALL_COMMENT_LEN} 字`);
      return;
    }
    setSubmitting(true);
    try {
      const planUpdates = plans.map((p) => ({
        id: p.id,
        status: planDrafts[p.id]?.status || 'pending',
        comment: planDrafts[p.id]?.comment || '',
      }));
      await submitFuncSolutionReviewDecision(synapseApiBase, roomId, {
        decision,
        comment: overallComment.trim(),
        plans: planUpdates,
      });
      message.success(decision === 'approve' ? '函数级方案评审已通过' : '已提交修订意见，等待方案调整');
      onDecided?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '提交失败';
      message.error(msg);
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
      <div className="shrink-0 border-b border-border/50 bg-gradient-to-r from-violet-500/10 via-cyan-500/5 to-emerald-500/10 px-6 py-5">
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
              按 <strong>需求 → 模块 → 改造方案</strong> 逐条确认；通过项可折叠，未通过项请填写评审意见
            </Text>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-black/20 px-4 py-2">
            <div className="text-center">
              <div className="text-lg font-semibold text-emerald-400">
                {approvedCount}/{plans.length}
              </div>
              <div className="text-[10px] text-muted-foreground">方案已通过</div>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
        {blocked ? (
          <Alert
            type="error"
            showIcon
            className="mb-4"
            message="上次评审要求修订方案，请小鲸根据评审意见调整后重新提交"
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
            <Text strong>改造方案清单（分）</Text>
            <Tooltip title="保存当前逐条评审状态">
              <Button size="small" type="link" onClick={() => void persistPlans()}>
                保存进度
              </Button>
            </Tooltip>
          </div>

          <div className="space-y-6">
            {Object.entries(grouped).map(([reqKey, modules]) => (
              <div key={reqKey} className="rounded-xl border border-violet-500/20 bg-violet-500/[0.03] p-4">
                <Text className="mb-3 block text-[11px] font-semibold uppercase tracking-wide text-violet-300">
                  需求 · {reqKey}
                </Text>
                {Object.entries(modules).map(([modName, modPlans]) => (
                  <div key={modName} className="mb-4 last:mb-0">
                    <Text className="mb-2 block text-[12px] font-medium text-foreground/90">
                      模块 · {modName}
                    </Text>
                    <div className="space-y-3">
                      {modPlans.map((plan) => (
                        <PlanReviewCard
                          key={plan.id}
                          plan={plan}
                          draft={planDrafts[plan.id] || planDraftFromPayload(plan)}
                          isDark={isDark}
                          onChange={(next) =>
                            setPlanDrafts((prev) => ({ ...prev, [plan.id]: next }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-border/50 bg-black/20 px-6 py-4">
        <Text className="mb-2 block text-[11px] text-muted-foreground">
          总体评审意见（必填，≥{MIN_OVERALL_COMMENT_LEN} 字）
        </Text>
        <TextArea
          rows={3}
          value={overallComment}
          onChange={(e) => setOverallComment(e.target.value)}
          placeholder="总结方案整体合理性；若要求修订，请说明优先调整的方向…"
          className="mb-3 text-[12px]"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            danger
            icon={<XCircle className="h-4 w-4" />}
            loading={submitting}
            onClick={() => void handleDecision('revise')}
          >
            需修订方案
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
