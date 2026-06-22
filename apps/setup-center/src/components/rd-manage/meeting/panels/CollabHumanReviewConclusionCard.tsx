/**
 * 工单节点抽屉：协同节点（ai_human）人工评审结论摘要
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Tag } from 'antd';
import { ExternalLink, Loader2, MessageSquareQuote, ShieldCheck } from 'lucide-react';

import {
  fetchArtifactFile,
  fetchSolutionReview,
  type SolutionReviewPayload,
} from '@/api/meetingRoomService';
import type { MeetingNodeVisualState } from './MeetingNodeDetailPanel';

type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'escalated';

type ConclusionView = {
  status: ReviewStatus;
  comment: string;
  decidedAt?: string;
  score?: number;
  verdict?: string;
  patches?: string[];
  source: 'solution_review' | 'history' | 'artifact' | 'none';
};

const CONCLUSION_MD_BY_NODE: Record<string, string> = {
  solution_review: '方案评审结论.md',
  // leader_review 在评审过程中展示 AI 评审意见；人工全员通过后系统生成最终结论文档
  leader_review: 'ai_review.md',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: '待评审',
  approved: '已通过',
  rejected: '不通过',
  escalated: '异常介入',
};

const STATUS_COLOR: Record<ReviewStatus, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  escalated: 'warning',
};

function formatDecidedAt(raw?: string): string | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('zh-CN', { hour12: false });
}

function mapHumanReviewStatus(raw?: string): ReviewStatus {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'pending';
}

function extractHistoryConclusion(
  nodeId: string,
  history: Record<string, unknown>[] | undefined,
): ConclusionView | null {
  if (!history?.length) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (String(h.node_id || '').trim() !== nodeId) continue;
    const ev = String(h.event || '').trim();
    const comment = String(h.comment || '').trim();
    const decidedAt = String(h.ts || h.timestamp || '').trim() || undefined;
    if (ev === 'solution_review_approved' || ev === 'hitl_approved') {
      return { status: 'approved', comment, decidedAt, source: 'history' };
    }
    if (ev === 'solution_review_rejected' || ev === 'hitl_rejected') {
      return { status: 'rejected', comment, decidedAt, source: 'history' };
    }
    if (ev === 'hitl_escalated') {
      return { status: 'escalated', comment, decidedAt, source: 'history' };
    }
  }
  return null;
}

function buildFromSolutionPayload(payload: SolutionReviewPayload): ConclusionView {
  const human = payload.human_review;
  const status = mapHumanReviewStatus(human?.status);
  const patches = (payload.split_tasks_draft ?? [])
    .map((t) => (t.patchName || '').trim())
    .filter(Boolean);
  return {
    status,
    comment: (human?.comment || '').trim(),
    decidedAt: human?.decided_at ?? undefined,
    score: payload.whale_review?.score,
    verdict: payload.whale_review?.verdict,
    patches: patches.length ? [...new Set(patches)] : undefined,
    source: 'solution_review',
  };
}

function mergeConclusions(primary: ConclusionView | null, fallback: ConclusionView | null): ConclusionView {
  if (!primary && !fallback) {
    return { status: 'pending', comment: '', source: 'none' };
  }
  if (!primary) return fallback!;
  if (!fallback) return primary;
  if (primary.status === 'pending' && fallback.status !== 'pending') {
    return { ...fallback, score: primary.score ?? fallback.score, verdict: primary.verdict ?? fallback.verdict, patches: primary.patches ?? fallback.patches };
  }
  if (primary.comment.trim()) return primary;
  if (fallback.comment.trim()) return { ...primary, comment: fallback.comment, decidedAt: primary.decidedAt || fallback.decidedAt };
  return primary;
}

function excerptMarkdown(md: string, maxLen = 480): string {
  const lines = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('|') && !l.startsWith('---'));
  const text = lines.join('\n').trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export interface CollabHumanReviewConclusionCardProps {
  synapseApiBase: string;
  roomId: string;
  nodeId: string;
  nodeState: MeetingNodeVisualState;
  archiveFiles?: { name: string; relative_path: string; size: number }[];
  recentHistory?: Record<string, unknown>[];
  solutionReviewBlocked?: boolean;
  onOpenMeeting?: () => void;
}

export function CollabHumanReviewConclusionCard({
  synapseApiBase,
  roomId,
  nodeId,
  nodeState,
  archiveFiles = [],
  recentHistory,
  solutionReviewBlocked = false,
  onOpenMeeting,
}: CollabHumanReviewConclusionCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solutionPayload, setSolutionPayload] = useState<SolutionReviewPayload | null>(null);
  const [artifactExcerpt, setArtifactExcerpt] = useState('');

  const load = useCallback(async () => {
    if (!synapseApiBase || !roomId || !nodeId) return;
    if (nodeState === 'pending' || nodeState === 'skipped') return;
    setLoading(true);
    setError(null);
    setArtifactExcerpt('');
    try {
      let payload: SolutionReviewPayload | null = null;
      if (nodeId === 'solution_review') {
        const res = await fetchSolutionReview(synapseApiBase, roomId);
        payload = res.payload ?? null;
        setSolutionPayload(payload);
      } else {
        setSolutionPayload(null);
      }

      const conclusionName = CONCLUSION_MD_BY_NODE[nodeId];
      const conclusionFile = conclusionName
        ? archiveFiles.find((f) => f.name === conclusionName)
        : undefined;
      const primary = payload ? buildFromSolutionPayload(payload) : null;
      const historyView = extractHistoryConclusion(nodeId, recentHistory);
      const merged = mergeConclusions(primary, historyView);

      if (!merged.comment.trim() && conclusionFile?.relative_path && merged.status !== 'pending') {
        try {
          const file = await fetchArtifactFile(synapseApiBase, roomId, conclusionFile.relative_path);
          const excerpt = excerptMarkdown(file.content || '');
          if (excerpt) setArtifactExcerpt(excerpt);
        } catch {
          /* 结论文件可选 */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载人工评审结论失败');
      setSolutionPayload(null);
    } finally {
      setLoading(false);
    }
  }, [archiveFiles, nodeId, nodeState, recentHistory, roomId, synapseApiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const view = useMemo((): ConclusionView => {
    if (nodeState === 'pending' || nodeState === 'skipped') {
      return { status: 'pending', comment: '', source: 'none' };
    }
    const primary = solutionPayload ? buildFromSolutionPayload(solutionPayload) : null;
    const historyView = extractHistoryConclusion(nodeId, recentHistory);
    let merged = mergeConclusions(primary, historyView);
    if (solutionReviewBlocked && nodeId === 'solution_review' && merged.status !== 'approved') {
      merged = { ...merged, status: 'rejected' };
    }
    if (!merged.comment.trim() && artifactExcerpt) {
      merged = { ...merged, comment: artifactExcerpt, source: 'artifact' };
    }
    return merged;
  }, [artifactExcerpt, nodeId, nodeState, recentHistory, solutionPayload, solutionReviewBlocked]);

  const decidedLabel = formatDecidedAt(view.decidedAt);
  const showPendingHint =
    view.status === 'pending' && (nodeState === 'processing' || nodeState === 'completed');
  const bodyText = view.comment.trim();

  return (
    <div className="rd-order-node-drawer__human-review">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-violet-400" />
          人工评审结论
        </h4>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden />
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : nodeState === 'skipped' ? (
        <p className="text-sm text-muted-foreground">本节点未开启，无人工评审记录。</p>
      ) : nodeState === 'pending' ? (
        <p className="text-sm text-muted-foreground">节点尚未执行，暂无人工评审结论。</p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Tag color={STATUS_COLOR[view.status]} bordered={false} className="m-0 text-xs">
              {STATUS_LABEL[view.status]}
            </Tag>
            {decidedLabel ? (
              <span className="text-[11px] text-muted-foreground">{decidedLabel}</span>
            ) : null}
            {typeof view.score === 'number' && Number.isFinite(view.score) ? (
              <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200">
                小鲸 {Math.round(view.score)} 分
              </span>
            ) : null}
          </div>

          {bodyText ? (
            <div className="flex gap-2 rounded-lg border border-border/35 bg-black/20 px-3 py-2.5">
              <MessageSquareQuote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300/80" />
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap line-clamp-6">
                {bodyText}
              </p>
            </div>
          ) : showPendingHint ? (
            <p className="text-sm text-amber-200/90">
              协同评审尚未完成。请进入研发会议室「人工干预」页完成评审并填写意见。
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">暂无评审意见正文。</p>
          )}

          {view.patches?.length ? (
            <div className="text-[12px] text-muted-foreground">
              <span className="text-foreground/70">补丁计划：</span>
              {view.patches.join('、')}
            </div>
          ) : null}

          {showPendingHint && onOpenMeeting ? (
            <Button
              type="link"
              size="small"
              className="h-auto p-0 text-violet-300"
              icon={<ExternalLink className="h-3 w-3" />}
              onClick={onOpenMeeting}
            >
              前往研发会议室评审
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
