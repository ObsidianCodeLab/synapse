/**
 * LeaderReviewView — 研发组长评审中心
 *
 * 替代原「代码沙盒」占位视图，提供惊艳的多方协同评审体验：
 *   · 左侧：当前用户所有「研发组长评审」阶段的工单列表
 *   · 中间：完整 HTML 报告 iframe 嵌入预览
 *   · 右侧：评审人员状态 + 操作面板，含自动轮询
 *   · 底部全局状态：所有人通过后显示代码合并入口
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Avatar, Button, Spin, Tag, Tooltip, Progress, Badge, Input, Empty } from 'antd';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Users,
  GitMerge,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Send,
  MessageSquare,
  Eye,
  EyeOff,
  Sparkles,
  Activity,
  Shield,
  Code,
  Search,
  Zap,
  Star,
} from 'lucide-react';

import {
  fetchRdManageDemands,
  type DemandListItem,
  type OwnedWorkItem,
} from '../../api/rdManageService';
import {
  fetchIwhalecloudUserinfoSummary,
} from '../../api/rdUnifiedService';
import {
  submitRdViewReport,
  searchRdViewReport,
  reviewRdViewReport,
  triggerCodeMerge,
  markTaskComplete,
  generateRdReportHtml,
  buildRdReportDataFromDemand,
  REVIEWER_ROLE_LABEL,
  type Reviewer,
  type ReportRecord,
  type ReviewerInfo,
} from '../../api/rdViewReportService';

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface CurrentUser {
  employee_id: string;
  name:        string;
}

interface DemandReviewState {
  demandNo:     string;
  demandTitle:  string;
  taskNos:      string[];
  reportRecord: ReportRecord | null;
  reviewers:    Reviewer[];
  overallState: 'not_submitted' | 'pending' | 'approved' | 'rejected';
  reportHtml:   string;
  loading:      boolean;
}

// ── 色彩 & 工具 ───────────────────────────────────────────────────────────────

const STATE_CONFIG = {
  not_submitted: { label: '未提交',  color: '#64748b', bg: 'bg-slate-500/20', text: 'text-slate-400' },
  pending:       { label: '评审中',  color: '#f59e0b', bg: 'bg-amber-500/20',  text: 'text-amber-400' },
  approved:      { label: '全员通过', color: '#22c55e', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  rejected:      { label: '有人拒绝', color: '#ef4444', bg: 'bg-red-500/20',     text: 'text-red-400' },
} as const;

const ROLE_COLOR: Record<string, string> = {
  submitter:    '#6366f1',
  product_lead: '#f59e0b',
  team_lead:    '#3b82f6',
  internal:     '#8b5cf6',
};

function avatarColor(role: string) {
  return ROLE_COLOR[role] || '#64748b';
}

// ── 子组件：左侧工单列表 ──────────────────────────────────────────────────────

function DemandListPanel({
  demands,
  selected,
  onSelect,
  loading,
}: {
  demands:  DemandListItem[];
  selected: string | null;
  onSelect: (no: string) => void;
  loading:  boolean;
}) {
  const [search, setSearch] = useState('');
  const filtered = (demands ?? []).filter((d) =>
    !search || d.demand_no.includes(search) || d.demand_title.includes(search),
  );

  return (
    <div className="flex h-full flex-col">
      {/* 搜索框 */}
      <div className="px-4 py-3 border-b border-white/8">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/8 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索需求单…"
            className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none"
          />
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spin size="small" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            {search ? '无匹配结果' : '暂无研发组长评审工单'}
          </div>
        ) : (
          filtered.map((d) => {
            const isActive = d.demand_no === selected;
            return (
              <motion.button
                key={d.demand_no}
                layout
                onClick={() => onSelect(d.demand_no)}
                className={`w-full text-left rounded-xl px-3.5 py-3 transition-all duration-150 border ${
                  isActive
                    ? 'border-indigo-500/40 bg-indigo-500/12 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]'
                    : 'border-white/6 bg-white/3 hover:bg-white/6 hover:border-white/12'
                }`}
              >
                <div className="text-xs font-mono text-slate-400 mb-0.5">
                  #{d.demand_no}
                </div>
                <div className="text-sm font-medium text-slate-200 line-clamp-2 leading-snug">
                  {d.demand_title}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span>{d.demand_create_time?.slice(0, 10)}</span>
                  {d.owned_work_items?.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/6">
                      {d.owned_work_items.length} 研发单
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── 子组件：评审人员行 ────────────────────────────────────────────────────────

function ReviewerCard({
  reviewer,
  isSelf,
  onApprove,
  onReject,
  approving,
}: {
  reviewer:  Reviewer;
  isSelf:    boolean;
  onApprove: () => void;
  onReject:  (comment: string) => void;
  approving: boolean;
}) {
  const [rejectMode, setRejectMode] = useState(false);
  const [comment, setComment]       = useState('');
  const isPending  = reviewer.conclusion === 'pending';
  const isApproved = reviewer.conclusion === 'approved';
  const isRejected = reviewer.conclusion === 'rejected';
  const roleLabel  = REVIEWER_ROLE_LABEL[reviewer.role] ?? reviewer.role;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className={`rounded-2xl border p-4 transition-colors ${
        isApproved
          ? 'border-emerald-500/25 bg-emerald-500/6'
          : isRejected
          ? 'border-red-500/25 bg-red-500/6'
          : 'border-white/8 bg-white/3'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* 头像 + 信息 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar
              size={42}
              style={{
                backgroundColor: avatarColor(reviewer.role),
                flexShrink: 0,
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              {(reviewer.reviewer_name || reviewer.employee_id).slice(0, 1)}
            </Avatar>
            {isApproved && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0f172a]">
                <CheckCircle2 className="h-2.5 w-2.5 text-white" />
              </span>
            )}
            {isRejected && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 ring-2 ring-[#0f172a]">
                <XCircle className="h-2.5 w-2.5 text-white" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                {reviewer.reviewer_name || reviewer.employee_id}
              </span>
              {isSelf && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                  本人
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{roleLabel}</div>
          </div>
        </div>

        {/* 状态 / 操作 */}
        <div className="shrink-0">
          {isApproved ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4" />
              已通过
            </div>
          ) : isRejected ? (
            <div className="flex items-center gap-1.5 text-red-400 text-xs font-medium">
              <XCircle className="h-4 w-4" />
              已拒绝
            </div>
          ) : isSelf ? (
            rejectMode ? null : (
              <div className="flex items-center gap-1.5">
                <Button
                  size="small"
                  onClick={() => setRejectMode(true)}
                  className="rounded-lg border-red-500/40 text-red-400 text-xs hover:bg-red-500/10"
                >
                  拒绝
                </Button>
                <Button
                  type="primary"
                  size="small"
                  loading={approving}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  onClick={onApprove}
                  className="rounded-lg border-none bg-emerald-600 hover:bg-emerald-500 text-xs"
                >
                  通过
                </Button>
              </div>
            )
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Clock className="h-3.5 w-3.5 animate-pulse" />
              待评审
            </div>
          )}
        </div>
      </div>

      {/* 拒绝理由输入 */}
      <AnimatePresence>
        {rejectMode && isSelf && isPending && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="请填写拒绝理由（可选）…"
                rows={2}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 resize-none outline-none focus:border-indigo-500/50 transition-colors"
              />
              <div className="flex items-center gap-2 justify-end">
                <Button size="small" onClick={() => setRejectMode(false)} className="text-xs rounded-lg">
                  取消
                </Button>
                <Button
                  danger
                  size="small"
                  onClick={() => { onReject(comment); setRejectMode(false); }}
                  className="text-xs rounded-lg"
                >
                  确认拒绝
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 评审意见展示 */}
      {(isApproved || isRejected) && reviewer.comments && (
        <div className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-400 italic">
          "{reviewer.comments}"
        </div>
      )}
      {(isApproved || isRejected) && reviewer.reviewed_at && (
        <div className="mt-1.5 text-[10px] text-slate-600">
          {reviewer.reviewed_at.slice(0, 16)}
        </div>
      )}
    </motion.div>
  );
}

// ── 子组件：中间报告预览 ──────────────────────────────────────────────────────

function ReportPreviewPanel({
  html,
  loading,
  demandNo,
}: {
  html:     string;
  loading:  boolean;
  demandNo: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Spin size="default" />
          <p className="mt-3 text-sm text-slate-400">正在加载报告…</p>
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-500">
        <FileText className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">报告尚未生成</p>
        <p className="text-xs mt-1 text-slate-600">请先在工单面板完成自评</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <FileText className="h-3.5 w-3.5 text-blue-400" />
          <span className="font-mono">需求单 #{demandNo}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-slate-500">实时报告</span>
        </div>
      </div>
      {/* iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={html}
        className="flex-1 w-full border-none"
        title={`研发报告 #${demandNo}`}
        sandbox="allow-scripts"
      />
    </div>
  );
}

// ── 主视图 ────────────────────────────────────────────────────────────────────

export function LeaderReviewView({ synapseApiBase }: { synapseApiBase?: string }) {
  const base = (synapseApiBase || 'http://127.0.0.1:18900').replace(/\/$/, '');

  const [demandsLoading, setDemandsLoading] = useState(true);
  const [demands,        setDemands]        = useState<DemandListItem[]>([]);
  const [selectedNo,     setSelectedNo]     = useState<string | null>(null);
  const [currentUser,    setCurrentUser]    = useState<CurrentUser>({ employee_id: 'local', name: '当前用户' });
  const [reviewState,    setReviewState]    = useState<DemandReviewState | null>(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [approving,      setApproving]      = useState(false);
  const [merging,        setMerging]        = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 拉取当前用户信息
  useEffect(() => {
    fetchIwhalecloudUserinfoSummary(base)
      .then((info) => {
        if (info?.employee_id) {
          setCurrentUser({ employee_id: info.employee_id, name: info.name || info.employee_id });
        }
      })
      .catch(() => {});
  }, [base]);

  // 拉取处于「研发组长评审」阶段的工单
  const loadDemands = useCallback(async () => {
    setDemandsLoading(true);
    try {
      const payload = await fetchRdManageDemands(base, { allowMockFallback: true });
      const leaderReviewDemands = (payload.list ?? []).filter(
        (d) =>
          d.sop_node === '研发组长评审' ||
          d.sop_node === 'leader_review' ||
          d.local_process_state === '处理中',
      );
      setDemands(leaderReviewDemands);
      if (!selectedNo && leaderReviewDemands.length > 0) {
        setSelectedNo(leaderReviewDemands[0].demand_no);
      }
    } finally {
      setDemandsLoading(false);
    }
  }, [base, selectedNo]);

  useEffect(() => { void loadDemands(); }, []);

  // 当选中工单变化时，加载评审状态
  const loadReviewState = useCallback(async (demandNo: string, silent = false) => {
    const demand = demands.find((d) => d.demand_no === demandNo);
    if (!demand) return;
    const taskNos = demand.owned_work_items?.map((w) => w.task_no) || [];

    if (!silent) {
      setReviewState((prev) => prev ? { ...prev, loading: true } : null);
    }

    try {
      const res = await searchRdViewReport(base, demandNo);

      let html = res.report?.report_html || '';
      if (!html) {
        const data = buildRdReportDataFromDemand({
          demandNo,
          demandTitle: demand.demand_title,
          taskNos,
          assigneeName: currentUser.name,
        });
        html = generateRdReportHtml(data);
      }

      setReviewState({
        demandNo,
        demandTitle:  demand.demand_title,
        taskNos,
        reportRecord: res.report,
        reviewers:    res.report?.reviewers ?? [],
        overallState: res.overall_state,
        reportHtml:   html,
        loading:      false,
      });
    } catch {
      if (!silent) {
        toast.error('加载评审状态失败');
      }
      setReviewState((prev) => prev ? { ...prev, loading: false } : null);
    }
  }, [base, currentUser, demands]);

  useEffect(() => {
    if (!selectedNo) return;
    void loadReviewState(selectedNo);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadReviewState(selectedNo, true), 15_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedNo, loadReviewState]);

  // 自评 / 通过
  const handleApprove = async () => {
    if (!reviewState) return;
    setApproving(true);
    try {
      let reportId = reviewState.reportRecord?.report_id;
      if (!reportId) {
        const reviewers: ReviewerInfo[] = [{
          employee_id:   currentUser.employee_id,
          reviewer_name: currentUser.name,
          role:          'submitter',
        }];
        const submitResult = await submitRdViewReport(base, {
          demand_no:      reviewState.demandNo,
          submitter_id:   currentUser.employee_id,
          submitter_name: currentUser.name,
          report_html:    reviewState.reportHtml,
          reviewers,
        });
        reportId = submitResult.report_id;
        if (!reportId) {
          throw new Error('报告提交成功但未返回 report_id');
        }
        toast.success('报告已提交到统一服务');
      }
      await reviewRdViewReport(base, {
        report_id:   reportId,
        demand_no:   reviewState.demandNo,
        employee_id: currentUser.employee_id,
        conclusion:  'approved',
        comments:    '评审通过',
      });
      toast.success('评审意见已提交');
      await loadReviewState(reviewState.demandNo);
    } catch (err: unknown) {
      toast.error(`操作失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApproving(false);
    }
  };

  // 拒绝
  const handleReject = async (comment: string) => {
    if (!reviewState) return;
    const reportId = reviewState.reportRecord?.report_id;
    if (!reportId) {
      toast.warning('请先提交报告后再评审');
      return;
    }
    try {
      await reviewRdViewReport(base, {
        report_id:   reportId,
        demand_no:   reviewState.demandNo,
        employee_id: currentUser.employee_id,
        conclusion:  'rejected',
        comments:    comment || '评审未通过',
      });
      toast.warning('已提交拒绝意见');
      await loadReviewState(reviewState.demandNo);
    } catch (err: unknown) {
      toast.error(`操作失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // 代码合并
  const handleMerge = async () => {
    if (!reviewState) return;
    const firstTask = reviewState.taskNos[0] || '';
    if (!firstTask) { toast.warning('未找到研发单号'); return; }
    setMerging(true);
    try {
      const res = await triggerCodeMerge(base, {
        username: currentUser.employee_id,
        password: '',
        taskNo:   firstTask,
      });
      if (res.success) {
        // 更新 userwork.json 任务状态
        await markTaskComplete(base, {
          demand_no: reviewState.demandNo,
          task_nos:  reviewState.taskNos,
        }).catch(() => {});
        toast.success('代码合并完成，任务已标记为已完成！');
        await loadDemands();
      } else {
        toast.error(`合并失败：${res.message}`);
      }
    } finally {
      setMerging(false);
    }
  };

  const isAllApproved = reviewState?.overallState === 'approved';
  const stateConf = reviewState ? STATE_CONFIG[reviewState.overallState] : null;

  const passCount = (reviewState?.reviewers ?? []).filter((r) => r.conclusion === 'approved').length;
  const totalCount = reviewState?.reviewers?.length ?? 0;

  return (
    <div className="flex h-full overflow-hidden bg-[#09090f] text-slate-100">

      {/* ── 左侧工单列表 ── */}
      <div className="w-[240px] shrink-0 flex flex-col border-r border-white/6 bg-white/[0.015]">
        {/* 标题栏 */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/8">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600/30 to-purple-600/30 border border-indigo-500/20">
            <Shield className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">研发组长评审</div>
            <div className="text-[10px] text-slate-500">
              {demandsLoading ? '加载中…' : `${demands.length} 个工单`}
            </div>
          </div>
        </div>
        <DemandListPanel
          demands={demands}
          selected={selectedNo}
          onSelect={setSelectedNo}
          loading={demandsLoading}
        />
      </div>

      {/* ── 中间报告预览 ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ReportPreviewPanel
          html={reviewState?.reportHtml || ''}
          loading={reviewState?.loading === true}
          demandNo={selectedNo || ''}
        />
      </div>

      {/* ── 右侧评审操作面板 ── */}
      <div className="w-[320px] shrink-0 flex flex-col border-l border-white/6 bg-white/[0.015] overflow-hidden">

        {!reviewState ? (
          <div className="flex flex-1 items-center justify-center text-slate-500 text-sm">
            {selectedNo ? <Spin size="small" /> : '请选择工单'}
          </div>
        ) : (
          <>
            {/* 顶部工单信息 */}
            <div className="px-5 py-4 border-b border-white/8 bg-gradient-to-b from-white/[0.025] to-transparent">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-sm font-semibold text-slate-100 line-clamp-2 leading-snug flex-1">
                  {reviewState.demandTitle}
                </div>
                {stateConf && (
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${stateConf.bg} ${stateConf.text}`}>
                    {stateConf.label}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mb-3">#{reviewState.demandNo}</div>

              {/* 进度条 */}
              {totalCount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>评审进度</span>
                    <span className="font-medium text-slate-300">{passCount}/{totalCount}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${totalCount > 0 ? (passCount / totalCount) * 100 : 0}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${isAllApproved ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 评审人员列表 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <Users className="h-3 w-3 text-violet-400" />
                  评审人员
                </div>
                <button
                  onClick={() => selectedNo && loadReviewState(selectedNo)}
                  className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  刷新
                </button>
              </div>

              {(reviewState.reviewers ?? []).length > 0 ? (
                (reviewState.reviewers ?? []).map((rv) => (
                  <ReviewerCard
                    key={rv.id ?? rv.employee_id}
                    reviewer={rv}
                    isSelf={rv.employee_id === currentUser.employee_id}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    approving={approving}
                  />
                ))
              ) : (
                /* 未提交报告 — 自评入口 */
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  <div className="rounded-2xl border border-white/8 bg-white/3 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <Avatar
                        size={42}
                        style={{ backgroundColor: avatarColor('开发者'), flexShrink: 0 }}
                      >
                        {currentUser.name.slice(0, 1)}
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-100">{currentUser.name}</span>
                          <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-medium text-indigo-300">本人</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">开发者</div>
                      </div>
                    </div>
                    <Button
                      type="primary"
                      block
                      loading={approving}
                      icon={<Send className="h-4 w-4" />}
                      onClick={handleApprove}
                      className="rounded-xl border-none bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-semibold h-9"
                    >
                      自评通过 · 提交报告
                    </Button>
                  </div>

                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs text-amber-300/80">
                    <AlertTriangle className="mr-1.5 mb-0.5 inline-block h-3.5 w-3.5" />
                    自评通过后，报告将自动推送给产品负责人及团队负责人进行评审。
                  </div>
                </motion.div>
              )}
            </div>

            {/* 底部：全员通过 → 代码合并 */}
            <AnimatePresence>
              {isAllApproved && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  className="px-4 py-4 border-t border-emerald-500/20 bg-gradient-to-t from-emerald-950/30 to-transparent"
                >
                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-400 mb-0.5">
                      <Sparkles className="h-4 w-4" />
                      全员评审通过！
                    </div>
                    <p className="text-xs text-slate-400">
                      可将特性分支代码合并到主干，完成本研发任务。
                    </p>
                  </div>
                  <Button
                    type="primary"
                    block
                    loading={merging}
                    icon={<GitMerge className="h-4 w-4" />}
                    onClick={handleMerge}
                    className="rounded-xl border-none bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold h-10 text-sm shadow-lg shadow-emerald-900/40"
                  >
                    完成任务 · 代码合并
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
