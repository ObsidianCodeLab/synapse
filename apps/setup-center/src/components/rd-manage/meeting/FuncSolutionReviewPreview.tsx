/**
 * 函数级方案评审 payload 只读预览（方案评审产出物 · func_solution_review.json）
 */
import React from 'react';
import { Typography } from 'antd';
import { CheckCircle2, GitBranch, Layers, Target } from 'lucide-react';

import {
  type FuncSolutionReviewPayload,
  type FuncSolutionTransformationPlan,
} from '../../../api/meetingRoomService';
import { useAntThemeDark } from '../../rd-view/useAntThemeDark';
import { MermaidDiagramCard } from './MermaidDiagramCard';
import { PlanTransformationContent } from './PlanTransformationContent';
import { ReviewMarkdown } from './ReviewMarkdown';

const { Text } = Typography;

const DESIGN_DETAIL_TEXT_CLASS = 'mt-2 text-[11px] leading-relaxed text-muted-foreground';
const DESIGN_DETAIL_LABEL_CLASS = 'font-medium text-foreground/80';

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

const PlanPreviewCard: React.FC<{
  plan: FuncSolutionTransformationPlan;
  index: number;
}> = ({ plan, index }) => {
  const reqLabel = (plan.requirement_summary || plan.requirement_ref || '').trim();
  const moduleLabel = (plan.module_name || '').trim();
  const titleLabel = (plan.title || moduleLabel || `改造方案 ${index + 1}`).trim();

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-br from-white/[0.03] to-white/[0.01]">
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-500/35 bg-violet-500/12 font-mono text-[12px] font-semibold text-violet-200">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold leading-snug text-foreground">{titleLabel}</div>
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
      </div>

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
            <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">设计依据</Text>
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
      </div>
    </div>
  );
};

export function isFuncSolutionReviewArtifact(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
  const name = norm.slice(norm.lastIndexOf('/') + 1);
  return name === 'func_solution_review.json';
}

export function FuncSolutionReviewPreview({ payload }: { payload: FuncSolutionReviewPayload }) {
  const isDark = useAntThemeDark();
  const overview = payload.overview;
  const consistency = payload.consistency_analysis;
  const plans = payload.transformation_plans ?? [];

  return (
    <div className="space-y-5 px-1 py-2">
      {payload.requirement_name ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">需求名称</div>
          <div className="mt-0.5 text-[14px] font-semibold text-foreground">{payload.requirement_name}</div>
        </div>
      ) : null}

      {(overview?.architecture_summary || (overview?.diagrams?.length ?? 0) > 0) && (
        <section className="overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.05] via-transparent to-violet-500/[0.04]">
          <div className="flex items-center gap-2.5 border-b border-cyan-500/15 bg-cyan-500/[0.06] px-4 py-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/15">
              <GitBranch className="h-3.5 w-3.5 text-cyan-300" />
            </div>
            <div>
              <Text strong className="!text-[12px]">方案总览</Text>
              <div className="text-[10px] text-muted-foreground">改造在系统中的位置与主链路</div>
            </div>
            {(overview?.diagrams?.length ?? 0) > 0 ? (
              <span className="ml-auto rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-200/90">
                {overview?.diagrams?.length} 张架构图
              </span>
            ) : null}
          </div>
          <div className="space-y-3 p-4">
            {overview?.architecture_summary ? (
              <div className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2.5">
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
        <section className="overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
          <div className="flex items-center gap-2.5 border-b border-amber-500/15 bg-amber-500/[0.05] px-4 py-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/15">
              <Target className="h-3.5 w-3.5 text-amber-300" />
            </div>
            <div>
              <Text strong className="!text-[12px]">合理性与兼容性分析</Text>
            </div>
          </div>
          <div className="space-y-2.5 p-4">
            {consistency.summary ? (
              <p className="m-0 text-[12px] leading-relaxed text-foreground/90">{consistency.summary}</p>
            ) : null}
            {(consistency.compatibility_notes || []).map((line) => (
              <p key={line} className="m-0 flex gap-2 text-[11.5px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00d9a5]" />
                <span className="min-w-0">{line}</span>
              </p>
            ))}
            {(consistency.contradiction_checks || []).map((line) => (
              <p key={line} className="m-0 flex gap-2 text-[11.5px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00d9a5]" />
                <span className="min-w-0">{line}</span>
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {plans.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/15">
              <Layers className="h-3.5 w-3.5 text-violet-300" />
            </div>
            <div>
              <Text strong className="!text-[12px]">改造方案清单</Text>
              <div className="text-[10px] text-muted-foreground">共 {plans.length} 条</div>
            </div>
          </div>
          <div className="space-y-3">
            {plans.map((plan, i) => (
              <PlanPreviewCard key={plan.id || `plan-${i}`} plan={plan} index={i} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
