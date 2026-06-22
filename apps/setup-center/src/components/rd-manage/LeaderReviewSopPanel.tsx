/**
 * LeaderReviewSopPanel — 研发组长评审 SOP 节点专用面板
 *
 * 替代 OrderManagement.tsx 中 leader_review case 的占位内容，提供：
 *   1. 自动化研发报告生成与预览（HTML 模板）
 *   2. 用户自评确认（通过后触发报告提交到统一服务）
 *   3. 评审人员状态展示（用户+产品负责人+团队负责人+首选系统内部人员）
 *   4. 所有人通过后，显示「完成任务」按钮，调用 code_merge
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Avatar,
  Badge,
  Button,
  Spin,
  Tag,
  Tooltip,
} from 'antd';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Users,
  Send,
  Eye,
  GitMerge,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';

import {
  submitRdViewReport,
  searchRdViewReport,
  reviewRdViewReport,
  triggerCodeMerge,
  markTaskComplete,
  generateRdReportHtml,
  buildRdReportDataFromDemand,
  type ReportReviewer,
  type ReportRecord,
  type ReviewerInfo,
} from '@/api/rdViewReportService';
import type { Ticket } from './OrderManagement';

// ── 类型 ─────────────────────────────────────────────────────────────────────

interface CurrentUser {
  employee_id: string;
  name:        string;
}

interface LeaderReviewSopPanelProps {
  synapseApiBase: string;
  ticket:         Ticket;
  currentUser:    CurrentUser;
  /** 点击「打开完整评审中心」跳转 */
  onOpenReviewCenter?: () => void;
  /** 任务完成回调 */
  onTaskComplete?: () => void;
}

// ── 角色颜色 / 图标 ───────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  '开发者':       '#6366f1',
  '产品负责人':   '#f59e0b',
  '团队负责人':   '#3b82f6',
  '系统内部人员': '#8b5cf6',
};

function avatarColor(role: string): string {
  return ROLE_COLOR[role] || '#64748b';
}

// ── ReviewerRow ───────────────────────────────────────────────────────────────

function ReviewerRow({
  reviewer,
  isSelf,
  onSelfApprove,
  approving,
}: {
  reviewer:      ReportReviewer;
  isSelf:        boolean;
  onSelfApprove: () => void;
  approving:     boolean;
}) {
  const isPending  = reviewer.review_state === 'pending';
  const isApproved = reviewer.review_state === 'approved';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between rounded-xl border border-border/60 bg-[color-mix(in_srgb,var(--panel2)_60%,transparent)] p-3.5 backdrop-blur-sm"
    >
      <div className="flex items-center gap-3">
        <Avatar
          size={36}
          style={{ backgroundColor: avatarColor(reviewer.reviewer_role), flexShrink: 0 }}
        >
          {(reviewer.reviewer_name || reviewer.reviewer_id).slice(0, 1)}
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {reviewer.reviewer_name || reviewer.reviewer_id}
            </span>
            {isSelf && (
              <Tag bordered={false} color="blue" className="text-[10px] px-1.5 py-0 leading-4">
                本人
              </Tag>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{reviewer.reviewer_role}</div>
        </div>
      </div>

      {/* 评审状态 / 操作 */}
      {isApproved ? (
        <div className="flex items-center gap-1.5 text-emerald-500">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs font-medium">已通过</span>
        </div>
      ) : reviewer.review_state === 'rejected' ? (
        <div className="flex items-center gap-1.5 text-red-400">
          <XCircle className="h-4 w-4" />
          <span className="text-xs font-medium">已拒绝</span>
        </div>
      ) : isSelf ? (
        <Button
          type="primary"
          size="small"
          loading={approving}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          onClick={onSelfApprove}
          className="rounded-lg border-none bg-emerald-600 hover:bg-emerald-500 text-xs"
        >
          自评通过
        </Button>
      ) : (
        <div className="flex items-center gap-1.5 text-slate-400">
          <Clock className="h-3.5 w-3.5 animate-pulse" />
          <span className="text-xs">待评审</span>
        </div>
      )}
    </motion.div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function LeaderReviewSopPanel({
  synapseApiBase,
  ticket,
  currentUser,
  onOpenReviewCenter,
  onTaskComplete,
}: LeaderReviewSopPanelProps) {
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]     = useState(false);
  const [approving,     setApproving]      = useState(false);
  const [merging,       setMerging]        = useState(false);
  const [reportRecord,  setReportRecord]   = useState<ReportRecord | null>(null);
  const [reviewers,     setReviewers]      = useState<ReportReviewer[]>([]);
  const [overallState,  setOverallState]   = useState<string>('not_submitted');
  const [reportHtml,    setReportHtml]     = useState('');
  const [showPreview,   setShowPreview]    = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const demandNo   = ticket.id;
  const taskNos    = ticket.ownedWorkItems.map((w) => w.task_no);
  const isAllApproved = overallState === 'approved';

  // 拉取评审状态
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await searchRdViewReport(synapseApiBase, demandNo, currentUser.employee_id);
      setReportRecord(res.report);
      setReviewers(res.reviewers);
      setOverallState(res.overall_state);
    } catch (err) {
      if (!silent) toast.error('获取评审状态失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [synapseApiBase, demandNo, currentUser.employee_id]);

  // 首次加载 + 轮询（每 15s）
  useEffect(() => {
    void fetchStatus();
    pollRef.current = setInterval(() => fetchStatus(true), 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchStatus]);

  // 生成报告 HTML（仅在首次未提交时预生成）
  useEffect(() => {
    if (!reportRecord) {
      const data = buildRdReportDataFromDemand({
        demandNo:    demandNo,
        demandTitle: ticket.title,
        taskNos,
        assigneeName: currentUser.name,
      });
      setReportHtml(generateRdReportHtml(data));
    } else {
      setReportHtml(reportRecord.report_html);
    }
  }, [reportRecord, demandNo, ticket.title, currentUser.name]);

  // 构造默认评审人列表（若报告未提交）
  const defaultReviewers = useMemo<ReviewerInfo[]>(() => {
    return [
      {
        reviewer_id:    currentUser.employee_id,
        reviewer_name:  currentUser.name,
        reviewer_role:  '开发者',
        is_self_review: true,
      },
      // 产品负责人、团队负责人占位（实际从 userinfo / prod 读取，此处为示意）
    ];
  }, [currentUser]);

  // 用户自评通过（首次会触发报告提交）
  const handleSelfApprove = async () => {
    setApproving(true);
    try {
      if (!reportRecord) {
        // 第一次：先提交报告
        await submitRdViewReport(synapseApiBase, {
          demand_no:    demandNo,
          task_nos:     taskNos,
          assignee_id:  currentUser.employee_id,
          assignee_name: currentUser.name,
          report_html:  reportHtml,
          diff_summary: '',
          diff_detail:  '{}',
          reviewers:    defaultReviewers,
        });
        toast.success('报告已提交，正在同步评审人员…');
      }
      // 提交自评
      await reviewRdViewReport(synapseApiBase, {
        demand_no:      demandNo,
        reviewer_id:    currentUser.employee_id,
        review_state:   'approved',
        review_comment: '自评通过',
      });
      toast.success('自评已确认通过');
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`操作失败：${msg}`);
    } finally {
      setApproving(false);
    }
  };

  // 代码合并
  const handleMerge = async () => {
    setMerging(true);
    try {
      const firstTask = taskNos[0] || '';
      if (!firstTask) { toast.warning('未找到研发单号，无法执行合并'); return; }
      const res = await triggerCodeMerge(synapseApiBase, {
        username: currentUser.employee_id,
        password: '',
        taskNo:   firstTask,
      });
      if (res.success) {
        // 同步更新 userwork.json 中任务状态
        await markTaskComplete(synapseApiBase, {
          demand_no: demandNo,
          task_nos:  taskNos,
        }).catch(() => {});
        toast.success('代码合并成功，任务已完成！');
        onTaskComplete?.();
      } else {
        toast.error(`合并失败：${res.message}`);
      }
    } finally {
      setMerging(false);
    }
  };

  // 自己是哪条评审人
  const selfReviewer = reviewers.find((r) => r.reviewer_id === currentUser.employee_id);
  const selfApproved = selfReviewer?.review_state === 'approved';

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spin size="small" />
        <span className="ml-3 text-sm text-muted-foreground">正在加载评审状态…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* 报告卡片 */}
      <div className="rounded-xl border border-border/60 bg-[color-mix(in_srgb,var(--panel2)_55%,transparent)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileText className="h-4 w-4 text-blue-400" />
            自动化研发报告
          </h4>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              icon={<Eye className="h-3.5 w-3.5" />}
              onClick={() => setShowPreview(true)}
              className="rounded-lg border-border text-xs"
            >
              预览报告
            </Button>
            {onOpenReviewCenter && (
              <Button
                size="small"
                type="primary"
                icon={<ChevronRight className="h-3.5 w-3.5" />}
                onClick={onOpenReviewCenter}
                className="rounded-lg border-none bg-violet-600 hover:bg-violet-500 text-xs"
              >
                评审中心
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${reportRecord ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            {reportRecord ? `已提交 · ${reportRecord.submit_time?.slice(0, 16)}` : '草稿（自评后提交）'}
          </span>
          {reportRecord && (
            <Tag
              bordered={false}
              color={isAllApproved ? 'success' : overallState === 'rejected' ? 'error' : 'warning'}
              className="text-[10px]"
            >
              {isAllApproved ? '全员通过' : overallState === 'rejected' ? '有人拒绝' : '评审中'}
            </Tag>
          )}
        </div>
      </div>

      {/* 评审人员列表 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-violet-400" />
            评审人员
          </h4>
          <button
            onClick={() => fetchStatus()}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            刷新
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {reviewers.length > 0 ? (
            reviewers.map((rv) => (
              <ReviewerRow
                key={rv.id}
                reviewer={rv}
                isSelf={rv.reviewer_id === currentUser.employee_id}
                onSelfApprove={handleSelfApprove}
                approving={approving}
              />
            ))
          ) : (
            /* 尚未提交报告 — 显示自评入口 */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col gap-2"
            >
              {defaultReviewers.map((rv, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-border/60 bg-[color-mix(in_srgb,var(--panel2)_60%,transparent)] p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <Avatar size={36} style={{ backgroundColor: avatarColor(rv.reviewer_role), flexShrink: 0 }}>
                      {(rv.reviewer_name || rv.reviewer_id).slice(0, 1)}
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {rv.reviewer_name || rv.reviewer_id}
                        </span>
                        {rv.is_self_review && (
                          <Tag bordered={false} color="blue" className="text-[10px] px-1.5 py-0 leading-4">本人</Tag>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{rv.reviewer_role}</div>
                    </div>
                  </div>
                  {rv.is_self_review && !selfApproved && (
                    <Button
                      type="primary"
                      size="small"
                      loading={approving}
                      icon={<Send className="h-3.5 w-3.5" />}
                      onClick={handleSelfApprove}
                      className="rounded-lg border-none bg-emerald-600 hover:bg-emerald-500 text-xs"
                    >
                      自评并提交报告
                    </Button>
                  )}
                </div>
              ))}

              <div className="mt-1 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80">
                <AlertTriangle className="mr-1.5 inline-block h-3.5 w-3.5" />
                自评通过后，报告将推送给团队负责人和产品负责人进行审阅。
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* 完成任务按钮（全员通过后显示） */}
      <AnimatePresence>
        {isAllApproved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  全员评审通过
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  可执行代码合并并完成本研发任务
                </p>
              </div>
              <Tooltip title={`合并研发单：${taskNos.join(', ')}`}>
                <Button
                  type="primary"
                  loading={merging}
                  icon={<GitMerge className="h-4 w-4" />}
                  onClick={handleMerge}
                  className="rounded-xl border-none bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-semibold"
                >
                  完成任务 · 代码合并
                </Button>
              </Tooltip>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 报告 HTML 预览弹层 */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.92, y: 24 }}
              animate={{ scale: 1,    y: 0  }}
              exit={{ scale: 0.92, y: 24 }}
              onClick={(e) => e.stopPropagation()}
              className="relative flex h-[88vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-border shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border bg-slate-900 px-5 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <FileText className="h-4 w-4 text-blue-400" />
                  自动化研发报告预览
                </div>
                <button
                  onClick={() => setShowPreview(false)}
                  className="text-slate-400 hover:text-white transition-colors text-lg leading-none"
                >
                  ×
                </button>
              </div>
              <iframe
                ref={iframeRef}
                srcDoc={reportHtml}
                className="flex-1 w-full border-none bg-slate-950"
                title="研发报告预览"
                sandbox="allow-scripts"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
