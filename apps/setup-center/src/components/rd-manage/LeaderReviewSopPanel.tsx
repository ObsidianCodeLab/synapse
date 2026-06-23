/**
 * LeaderReviewSopPanel — 研发组长评审 SOP 节点专用面板（重构版）
 *
 * 布局：
 *   上方 ~78% — 自动化研发报告内嵌 iframe 展示
 *   下方 ~22% — 评审面板（评审人表格 + 操作按钮）
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import {
  Button,
  Modal,
  Spin,
  Tooltip,
} from 'antd';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  GitMerge,
  MessageSquare,
  Plus,
  RefreshCw,
  SendHorizonal,
  Loader2,
  XOctagon,
  Star,
} from 'lucide-react';

import {
  submitRdViewReport,
  searchRdViewReport,
  reviewRdViewReport,
  addReviewer,
  resolveReportReviewers,
  triggerCodeMerge,
  markTaskComplete,
  generateRdReportHtml,
  buildRdReportDataFromDemand,
  prepareReportHtmlForDisplay,
  injectReportHtmlScrollbarStyles,
  REVIEWER_ROLE_LABEL,
  type Reviewer,
  type ReportRecord,
  type ReviewerInfo,
  type ReviewersResolveResult,
} from '@/api/rdViewReportService';
import { fetchIwhalecloudUserinfoSummary } from '@/api/rdUnifiedService';
import { fetchLeaderReviewPanel } from '@/api/meetingRoomService';
import { fetchRdManageDemands } from '@/api/rdManageService';
import type { Ticket } from './OrderManagement';

// ── 类型 ──────────────────────────────────────────────────────────────────────

interface CurrentUser {
  employee_id: string;
  name:        string;
}

interface LeaderReviewSopPanelProps {
  synapseApiBase:    string;
  /** 会议室 ID：有则拉取归档报告与 userwork 研发单号 */
  roomId?:           string;
  ticket?:           Ticket;
  demandNo?:         string;
  demandTitle?:      string;
  taskNos?:          string[];
  /** 产品标识 prod_info.prod，用于解析产品负责人 */
  prod?:             string;
  /** 归档 HTML 报告（会议室 pending_delivery.report_html） */
  initialReportHtml?: string;
  currentUser:       CurrentUser;
  onOpenReviewCenter?: () => void;
  onTaskComplete?:   () => void;
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

// ── 表格行数据类型 ────────────────────────────────────────────────────────────

/** 表格中的一行，可能是已提交的 Reviewer、也可能是待定/新增行 */
interface TableRow {
  /** 唯一标识：已提交行用 employee_id，新增行临时 id */
  key:           string;
  employee_id:   string;
  reviewer_name: string;
  role:          string;
  /** pending=待定/未提交；approved/rejected=已评审 */
  conclusion:    'pending' | 'approved' | 'rejected';
  comments:      string;
  reviewed_at?:  string;
  /** true 表示当前登录者 */
  isSelf:        boolean;
  /** true 表示这是还未写入后端的新增行 */
  isNew:         boolean;
}

// ── 子组件：CommentModal（评审意见编辑弹窗） ──────────────────────────────────

function CommentModal({
  open,
  initial,
  onOk,
  onCancel,
}: {
  open:     boolean;
  initial:  string;
  onOk:     (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(initial);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open, initial]);

  const charCount = text.length;
  const nearLimit = charCount >= 450;

  const handleOk = () => onOk(text.trim());

  return (
    <Modal
      open={open}
      centered
      width={440}
      destroyOnHidden
      closable={false}
      maskClosable
      footer={null}
      onCancel={onCancel}
      wrapClassName="rd-leader-review-comment-modal"
      styles={{
        mask:    { backdropFilter: 'blur(6px)', background: 'rgba(0, 0, 0, 0.58)' },
        content: { padding: 0, background: 'transparent', boxShadow: 'none' },
      }}
    >
      <div className="rd-leader-review-comment-modal-panel">
        <div className="rd-leader-review-comment-modal-header">
          <div className="rd-leader-review-comment-modal-icon" aria-hidden>
            <MessageSquare className="h-4 w-4" />
          </div>
          <div className="rd-leader-review-comment-modal-heading min-w-0 flex-1">
            <div className="rd-leader-review-comment-modal-title">填写评审意见</div>
            <div className="rd-leader-review-comment-modal-subtitle">推送前可补充说明，留空亦可</div>
          </div>
          <button
            type="button"
            className="rd-leader-review-comment-modal-close"
            onClick={onCancel}
            aria-label="关闭"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="rd-leader-review-comment-modal-body">
          <textarea
            ref={textareaRef}
            data-slot="rd-leader-review-comment"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleOk();
              }
            }}
            placeholder="请输入评审意见…"
            rows={5}
            className="rd-leader-review-comment-modal-textarea"
          />
          <div className="rd-leader-review-comment-modal-meta">
            <span className="rd-leader-review-comment-modal-hint">Ctrl + Enter 保存</span>
            <span
              className={`rd-leader-review-comment-modal-count${nearLimit ? ' rd-leader-review-comment-modal-count--warn' : ''}`}
            >
              {charCount} / 500
            </span>
          </div>
        </div>

        <div className="rd-leader-review-comment-modal-footer">
          <button
            type="button"
            className="rd-leader-review-comment-modal-btn rd-leader-review-comment-modal-btn--ghost"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="rd-leader-review-comment-modal-btn rd-leader-review-comment-modal-btn--primary"
            onClick={handleOk}
          >
            保存意见
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── 子组件：ReviewerPickerInput（原生 input，placeholder 与光标对齐） ───────────

function ReviewerPickerInput({
  candidates,
  onPick,
  onClose,
}: {
  candidates: ReviewerInfo[];
  onPick:       (info: ReviewerInfo) => void;
  onClose:      () => void;
}) {
  const [query, setQuery]       = useState('');
  const [open, setOpen]         = useState(true);
  const [dropPos, setDropPos]   = useState({ top: 0, left: 0, width: 0 });
  const rootRef                 = useRef<HTMLDivElement>(null);
  const dropRef                 = useRef<HTMLUListElement>(null);
  const inputRef                = useRef<HTMLInputElement>(null);
  const pickingRef              = useRef(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const roleLabel = REVIEWER_ROLE_LABEL[c.role] ?? c.role;
      return (
        c.reviewer_name.toLowerCase().includes(q)
        || c.employee_id.toLowerCase().includes(q)
        || roleLabel.toLowerCase().includes(q)
      );
    });
  }, [candidates, query]);

  const updateDropPos = useCallback(() => {
    if (!rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateDropPos();
    window.addEventListener('scroll', updateDropPos, true);
    window.addEventListener('resize', updateDropPos);
    return () => {
      window.removeEventListener('scroll', updateDropPos, true);
      window.removeEventListener('resize', updateDropPos);
    };
  }, [open, updateDropPos]);

  const handleBlur = () => {
    if (pickingRef.current) {
      pickingRef.current = false;
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    onClose();
  };

  return (
    <div ref={rootRef} className="rd-leader-review-picker relative">
      <input
        ref={inputRef}
        data-slot="rd-leader-review-picker-input"
        type="text"
        value={query}
        placeholder="搜索并选择评审人…"
        autoComplete="off"
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); updateDropPos(); }}
        onBlur={handleBlur}
        className="rd-leader-review-picker-input"
      />
      {open && createPortal(
        <ul
          ref={dropRef}
          className="rd-leader-review-picker-dropdown max-h-32 overflow-y-auto custom-scrollbar"
          style={{
            position: 'fixed',
            top: dropPos.top,
            left: dropPos.left,
            width: dropPos.width,
            zIndex: 2147483646,
          }}
        >
          {filtered.length > 0 ? filtered.map((c) => (
            <li key={c.employee_id}>
              <button
                type="button"
                className="rd-leader-review-picker-option"
                onMouseDown={() => { pickingRef.current = true; }}
                onClick={() => { onPick(c); setOpen(false); }}
              >
                <span className="font-medium">{c.reviewer_name}</span>
                <span className="opacity-55">{REVIEWER_ROLE_LABEL[c.role] ?? c.role}</span>
              </button>
            </li>
          )) : (
            <li className="px-3 py-2 text-[11px] text-muted-foreground/60">无可选人员</li>
          )}
        </ul>,
        document.body,
      )}
    </div>
  );
}

// ── 子组件：ReviewTable ────────────────────────────────────────────────────────

function ReviewTable({
  rows,
  disabled,
  selfReviewing,
  resolvedOptions,
  resolvedLoading,
  resolvedError,
  onSelfCommentChange,
  onAddRow,
  onRemoveNewRow,
  onSubmit,
  onTerminate,
  onMerge,
  isAllApproved,
  merging,
  isSubmitted,
}: {
  rows:                TableRow[];
  disabled:            boolean;
  selfReviewing:       boolean;
  resolvedOptions:     ReviewerInfo[];
  resolvedLoading:     boolean;
  resolvedError:       string | null;
  onSelfCommentChange: (comment: string) => void;
  onAddRow:            (info: ReviewerInfo) => void;
  onRemoveNewRow:      (key: string) => void;
  onSubmit:            () => void;
  onTerminate:         () => void;
  onMerge:             () => void;
  isAllApproved:       boolean;
  merging:             boolean;
  isSubmitted:         boolean;
}) {
  const [commentModalKey, setCommentModalKey] = useState<string | null>(null);
  const [commentDraft,    setCommentDraft]    = useState('');
  const [addingRow,       setAddingRow]       = useState(false);

  const existingIds = new Set(rows.map((r) => r.employee_id));

  const availableReviewers = resolvedOptions.filter((o) => !existingIds.has(o.employee_id));

  const canAddReviewer = !resolvedLoading && availableReviewers.length > 0;

  useEffect(() => {
    if (!canAddReviewer) setAddingRow(false);
  }, [canAddReviewer]);

  function conclusionBadge(row: TableRow) {
    if (row.conclusion === 'approved')
      return <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-medium"><CheckCircle2 className="h-3.5 w-3.5" />已通过</span>;
    if (row.conclusion === 'rejected')
      return <span className="inline-flex items-center gap-1 text-red-400 text-[11px] font-medium"><XOctagon className="h-3.5 w-3.5" />已驳回</span>;
    return <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]"><Clock className="h-3.5 w-3.5 animate-pulse" />待评审</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 解析加载/错误提示 */}
      {resolvedLoading && !isSubmitted && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          正在解析默认评审人员…
        </div>
      )}
      {resolvedError && !isSubmitted && (
        <div className="flex items-start gap-2 text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{resolvedError}</span>
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-xl border border-border/40 overflow-hidden">
        {/* 表头 */}
        <div
          className="grid text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
          style={{ gridTemplateColumns: '1fr 100px 90px 130px 1fr', background: 'rgba(0,0,0,0.35)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="px-3 py-1.5">姓名</div>
          <div className="px-2 py-1.5">工号</div>
          <div className="px-2 py-1.5">角色</div>
          <div className="px-2 py-1.5">评审结果</div>
          <div className="px-2 py-1.5">评审意见</div>
        </div>

        {/* 数据行 */}
        {rows.map((row) => {
          // 是否允许删除：非默认评审人（isNew=true）且非自评行
          const canDelete = row.isNew && !row.isSelf && !disabled;
          return (
            <div
              key={row.key}
              className="grid border-b border-border/20 last:border-b-0 items-center text-[12px]"
              style={{ gridTemplateColumns: '1fr 100px 90px 130px 1fr', background: row.isSelf ? 'rgba(99,102,241,0.04)' : 'transparent' }}
            >
              {/* 姓名（含可选删除按钮） */}
              <div className="px-3 py-1.5 flex items-center gap-1.5 min-w-0">
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => onRemoveNewRow(row.key)}
                    title="移除"
                    className="rd-leader-review-inline-btn group shrink-0"
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/35 transition-all duration-150 group-hover:bg-red-500/20 group-hover:text-red-400">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                        <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </span>
                  </button>
                )}
                <span className="font-medium text-foreground truncate">
                  {row.reviewer_name || row.employee_id}
                </span>
                {row.isSelf && (
                  <span className="shrink-0 text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full px-1.5 py-0 leading-4">本人</span>
                )}
              </div>
              {/* 工号 */}
              <div className="px-2 py-1.5 text-muted-foreground font-mono text-[11px] truncate">{row.employee_id}</div>
              {/* 角色 */}
              <div className="px-2 py-1.5 text-muted-foreground text-[11px]">{REVIEWER_ROLE_LABEL[row.role] ?? row.role}</div>
              {/* 评审结果：统一徽章，自评推送/终止后再显示结论 */}
              <div className="px-2 py-1">
                {conclusionBadge(row)}
              </div>
              {/* 评审意见 */}
              <div className="px-2 py-1 min-w-0">
                {row.isSelf && row.conclusion === 'pending' && !disabled ? (
                  <button
                    type="button"
                    onClick={() => { setCommentModalKey(row.key); setCommentDraft(row.comments); }}
                    className="rd-leader-review-inline-btn group inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] text-muted-foreground/65 transition-colors hover:bg-blue-500/10 hover:text-blue-300"
                  >
                    <MessageSquare className="h-3 w-3 shrink-0 opacity-55 group-hover:opacity-100" />
                    <span className="truncate">{row.comments ? row.comments.slice(0, 28) + (row.comments.length > 28 ? '…' : '') : '点击填写意见…'}</span>
                  </button>
                ) : row.comments ? (
                  <Tooltip title={row.comments}>
                    <span className="text-[11px] text-foreground/70 truncate block cursor-default max-w-full">
                      {row.comments.slice(0, 40)}{row.comments.length > 40 ? '…' : ''}
                    </span>
                  </Tooltip>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40">—</span>
                )}
              </div>
            </div>
          );
        })}

        {/* 新增行：仅一个姓名选择器，选中即添加 */}
        {addingRow && !disabled && (
          <div
            className="border-t border-border/20 px-3 py-2"
            style={{ background: 'rgba(59,130,246,0.04)' }}
          >
            <ReviewerPickerInput
              candidates={availableReviewers}
              onPick={(info) => {
                onAddRow(info);
                setAddingRow(false);
              }}
              onClose={() => setAddingRow(false)}
            />
          </div>
        )}
      </div>

      {/* 底部操作区 */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {isAllApproved ? (
          <button
            type="button"
            onClick={onMerge}
            disabled={merging}
            className="rd-leader-review-action-btn bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500"
          >
            <Star className="h-3.5 w-3.5 shrink-0" />
            完成任务 · 代码合并
          </button>
        ) : (
          <>
            {!disabled && (
              <Tooltip title={canAddReviewer ? '从同部门同团队添加评审人' : (resolvedLoading ? '正在加载可选人员…' : '暂无可选评审人员')}>
                <span className={`inline-flex ${canAddReviewer ? '' : 'cursor-not-allowed'}`}>
                  <button
                    type="button"
                    disabled={!canAddReviewer}
                    onClick={() => canAddReviewer && setAddingRow((v) => !v)}
                    className={`rd-leader-review-action-btn bg-gradient-to-r from-sky-600 to-blue-600 text-white hover:from-sky-500 hover:to-blue-500 ${addingRow ? 'ring-2 ring-sky-400/50' : ''}`}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    添加评审人
                  </button>
                </span>
              </Tooltip>
            )}
            {!disabled && (
              <Tooltip title="终止本次评审并置 SOP 节点为失败">
                <button
                  type="button"
                  onClick={onTerminate}
                  className="rd-leader-review-action-btn bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500"
                >
                  <XOctagon className="h-3.5 w-3.5 shrink-0" />
                  评审终止
                </button>
              </Tooltip>
            )}
            {!isSubmitted && (
              <button
                type="button"
                onClick={onSubmit}
                disabled={selfReviewing}
                className="rd-leader-review-action-btn bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500"
              >
                <SendHorizonal className="h-3.5 w-3.5 shrink-0" />
                评审推送
              </button>
            )}
          </>
        )}
      </div>

      {/* 评审意见弹窗 */}
      <CommentModal
        open={commentModalKey !== null}
        initial={commentDraft}
        onOk={(text) => { onSelfCommentChange(text); setCommentModalKey(null); }}
        onCancel={() => setCommentModalKey(null)}
      />
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function LeaderReviewSopPanel({
  synapseApiBase,
  roomId,
  ticket,
  demandNo:    demandNoProp,
  demandTitle: demandTitleProp,
  taskNos:     taskNosProp,
  prod:        prodProp,
  initialReportHtml,
  currentUser,
  onTaskComplete,
}: LeaderReviewSopPanelProps) {
  // ── 状态 ────────────────────────────────────────────────────────────────────
  const [loading,          setLoading]          = useState(true);
  const [selfReviewing,    setSelfReviewing]    = useState(false);
  const [merging,          setMerging]          = useState(false);
  const [adding,           setAdding]           = useState(false);
  const [report,           setReport]           = useState<ReportRecord | null>(null);
  const [overallState,     setOverallState]     = useState<'not_submitted' | 'pending' | 'approved' | 'rejected'>('not_submitted');
  const [reportHtml,       setReportHtml]       = useState('');
  const [resolved,         setResolved]         = useState<ReviewersResolveResult | null>(null);
  const [reviewersLoading, setReviewersLoading] = useState(true);
  const [reviewersError,   setReviewersError]   = useState<string | null>(null);
  const [panelTaskNos,     setPanelTaskNos]     = useState<string[]>([]);
  const [panelReportHtml,  setPanelReportHtml]  = useState('');
  const [panelProd,        setPanelProd]        = useState('');
  const [effectiveUser,    setEffectiveUser]    = useState<CurrentUser>(currentUser);
  const [userResolved,     setUserResolved]     = useState(
    Boolean(currentUser.employee_id && currentUser.employee_id !== 'local'),
  );
  /** 提交前手动暂存的评审人（提交时一并写入） */
  const [pendingReviewers, setPendingReviewers] = useState<ReviewerInfo[]>([]);
  /** 自评行展示用结论（推送/终止前为 pending） */
  const [selfDisplayConclusion, setSelfDisplayConclusion] = useState<'pending' | 'approved' | 'rejected'>('pending');
  /** 本地自评意见草稿 */
  const [selfDraftComment, setSelfDraftComment] = useState('');
  /** 是否已推送（提交后禁用所有交互） */
  const [pushed, setPushed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 已自动解析过的 assignee|prod，避免 prod 异步到位后重复请求 */
  const reviewersAutoKeyRef = useRef<string | null>(null);
  const [panelContextReady, setPanelContextReady] = useState(() => !roomId?.trim());

  // ── 解析当前登录用户（占位 local 时从本机 userinfo 读取） ─────────────────────
  useEffect(() => {
    if (currentUser.employee_id && currentUser.employee_id !== 'local') {
      setEffectiveUser(currentUser);
      setUserResolved(true);
      return;
    }
    setUserResolved(false);
    void fetchIwhalecloudUserinfoSummary(synapseApiBase)
      .then((info) => {
        if (info?.employee_id) {
          setEffectiveUser({ employee_id: info.employee_id, name: info.name || info.employee_id });
        } else {
          setReviewersError('未获取到本机工号，请先完成研发云引导验证');
        }
      })
      .catch(() => {
        setReviewersError('读取本机用户信息失败，无法解析审查人员');
      })
      .finally(() => {
        setUserResolved(true);
      });
  }, [synapseApiBase, currentUser]);

  // ── 派生值 ──────────────────────────────────────────────────────────────────
  const demandNo    = ticket?.id           ?? demandNoProp    ?? '';
  const demandTitle = ticket?.title        ?? demandTitleProp ?? demandNo;
  const taskNos     = useMemo(() => {
    const fromTicket = ticket
      ? (ticket.ownedWorkItems ?? []).map((w) => w.task_no).filter(Boolean)
      : (taskNosProp ?? []).filter(Boolean);
    const merged = [...fromTicket, ...panelTaskNos].filter(Boolean);
    return [...new Set(merged)];
  }, [ticket, taskNosProp, panelTaskNos]);
  const prod        = (ticket?.prod ?? prodProp ?? panelProd ?? '').trim();
  const reviewers   = report?.reviewers ?? [];
  const selfReviewer = reviewers.find((r) => r.employee_id === effectiveUser.employee_id);
  const selfApproved = selfReviewer?.conclusion === 'approved';
  const isAllApproved = overallState === 'approved';
  const isSubmitted   = !!report;

  // ── 解析审查人员（DB 关联，非 AI） ───────────────────────────────────────────
  const loadResolvedReviewers = useCallback(async (force = false) => {
    if (!userResolved) return;
    const eid = effectiveUser.employee_id?.trim();
    if (!eid || eid === 'local') {
      setReviewersLoading(false);
      setReviewersError('未获取到本机工号，请先完成研发云引导验证');
      return;
    }
    const resolveKey = `${eid}|${prod || ''}`;
    if (!force && reviewersAutoKeyRef.current === resolveKey) {
      return;
    }

    const showSpinner = force || reviewersAutoKeyRef.current === null;
    if (showSpinner) setReviewersLoading(true);
    if (force) setReviewersError(null);
    try {
      const data = await resolveReportReviewers(synapseApiBase, {
        assignee_id: eid,
        prod: prod || undefined,
      });
      setResolved(data);
      reviewersAutoKeyRef.current = resolveKey;
      setReviewersError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewersError(`解析审查人员失败：${msg}`);
      if (force) {
        setResolved(null);
        toast.error(`解析审查人员失败：${msg}`);
      } else {
        reviewersAutoKeyRef.current = resolveKey;
      }
    } finally {
      setReviewersLoading(false);
    }
  }, [synapseApiBase, effectiveUser.employee_id, prod, userResolved]);

  // ── 会议室 / userwork：拉取归档报告与研发单号 ───────────────────────────────
  useEffect(() => {
    if (!roomId?.trim()) {
      setPanelContextReady(true);
      return;
    }
    setPanelContextReady(false);
    void fetchLeaderReviewPanel(synapseApiBase, roomId)
      .then((data) => {
        if (Array.isArray(data.task_nos) && data.task_nos.length > 0) {
          setPanelTaskNos(data.task_nos.map((t) => String(t).trim()).filter(Boolean));
        }
        if (data.report_html?.trim()) {
          setPanelReportHtml(data.report_html);
        }
        if (data.prod?.trim()) {
          setPanelProd(data.prod.trim());
        }
      })
      .catch(() => {})
      .finally(() => {
        setPanelContextReady(true);
      });
  }, [synapseApiBase, roomId]);

  useEffect(() => {
    if (roomId?.trim() || ticket?.ownedWorkItems?.length || (taskNosProp?.length ?? 0) > 0) return;
    if (!demandNo) return;
    void fetchRdManageDemands(synapseApiBase, { allowMockFallback: false })
      .then((snap) => {
        const row = snap.list.find((d) => (d.demand_no || '').trim() === demandNo);
        const nos = (row?.owned_work_items ?? [])
          .map((w) => String(w.task_no || '').trim())
          .filter(Boolean);
        if (nos.length > 0) setPanelTaskNos(nos);
        if (!prodProp && row?.prod?.trim()) setPanelProd(row.prod.trim());
      })
      .catch(() => {});
  }, [synapseApiBase, demandNo, roomId, ticket, taskNosProp, prodProp]);

  // ── 拉取状态 ────────────────────────────────────────────────────────────────
  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await searchRdViewReport(synapseApiBase, demandNo);
      setReport(res.report);
      setOverallState(res.overall_state);
    } catch {
      if (!silent) toast.error('获取评审状态失败，请检查网络');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [synapseApiBase, demandNo]);

  // ── 生成报告 HTML ────────────────────────────────────────────────────────────
  useEffect(() => {
    const patch = (html: string) => prepareReportHtmlForDisplay(html, taskNos);
    const archivedHtml = panelReportHtml || initialReportHtml || '';
    if (report?.report_html) {
      setReportHtml(patch(report.report_html));
    } else if (archivedHtml.trim()) {
      setReportHtml(patch(archivedHtml));
    } else {
      const data = buildRdReportDataFromDemand({ demandNo, demandTitle, taskNos, assigneeName: effectiveUser.name });
      setReportHtml(injectReportHtmlScrollbarStyles(generateRdReportHtml(data)));
    }
  }, [report, panelReportHtml, initialReportHtml, demandNo, demandTitle, taskNos, effectiveUser.name]);

  // ── 首次加载 + 轮询（已提交后每 20s 刷新） ─────────────────────────────────
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!userResolved || !panelContextReady) return;
    void loadResolvedReviewers(false);
  }, [userResolved, panelContextReady, prod, effectiveUser.employee_id, loadResolvedReviewers]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (isSubmitted && !isAllApproved) {
      pollRef.current = setInterval(() => fetchStatus(true), 20_000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isSubmitted, isAllApproved, fetchStatus]);

  // ── 自评处理器（由 ReviewTable 中「评审推送」按钮触发） ─────────────────────
  const handleSelfReview = useCallback(async () => {
    const comment = selfDraftComment;
    setSelfDisplayConclusion('approved');
    setSelfReviewing(true);
    try {
      let reportId = report?.report_id;

      // 首次自评 → 先提交报告，并使用返回的 report_id（不能误用 demand_no）
      if (!reportId) {
        const baseReviewers: ReviewerInfo[] = resolved?.default_reviewers?.length
          ? resolved.default_reviewers
          : [{
              employee_id: effectiveUser.employee_id,
              reviewer_name: effectiveUser.name,
              role: 'submitter',
            }];
        const extraIds = new Set(baseReviewers.map((r) => r.employee_id));
        const reviewersToSubmit: ReviewerInfo[] = [
          ...baseReviewers,
          ...pendingReviewers.filter((r) => !extraIds.has(r.employee_id)),
        ];
        const submitResult = await submitRdViewReport(synapseApiBase, {
          demand_no:      demandNo,
          submitter_id:   effectiveUser.employee_id,
          submitter_name: effectiveUser.name,
          report_html:    reportHtml,
          reviewers:      reviewersToSubmit,
        });
        reportId = submitResult.report_id;
        if (!reportId) {
          throw new Error('报告提交成功但未返回 report_id');
        }
        toast.success('报告已推送服务器，审查人员已通知');
        setPushed(true);
      }

      // 提交自评结论
      await reviewRdViewReport(synapseApiBase, {
        report_id:   reportId,
        demand_no:   demandNo,
        employee_id: effectiveUser.employee_id,
        conclusion:  'approved',
        comments:    comment || undefined,
      });
      toast.success('自评通过，等待其他评审人审阅');
      await fetchStatus();
    } catch (e) {
      setSelfDisplayConclusion('pending');
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSelfReviewing(false);
    }
  }, [report, synapseApiBase, demandNo, reportHtml, effectiveUser, fetchStatus, resolved,
      selfDraftComment, pendingReviewers]);

  // ── 追加评审人 ───────────────────────────────────────────────────────────────
  const handleAddReviewer = useCallback(async (info: ReviewerInfo) => {
    if (!report) {
      setPendingReviewers((prev) => {
        if (prev.some((r) => r.employee_id === info.employee_id)) {
          toast.info(`${info.reviewer_name} 已在待定列表中`);
          return prev;
        }
        return [...prev, info];
      });
      return;
    }
    setAdding(true);
    try {
      await addReviewer(synapseApiBase, {
        report_id:     report.report_id,
        demand_no:     demandNo,
        employee_id:   info.employee_id,
        reviewer_name: info.reviewer_name,
        role:          info.role,
      });
      toast.success(`已添加评审人：${info.reviewer_name}`);
      await fetchStatus();
    } catch (e) {
      toast.error(`添加失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdding(false);
    }
  }, [report, synapseApiBase, demandNo, fetchStatus]);

  // ── 评审终止 ─────────────────────────────────────────────────────────────────
  const handleTerminate = useCallback(async () => {
    if (!roomId?.trim()) {
      toast.warning('无会议室 ID，无法终止评审');
      return;
    }
    Modal.confirm({
      title: '确认终止评审？',
      content: '终止后将置 SOP 节点为失败，研发流程需要重新处理。',
      okText: '确认终止',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setSelfDisplayConclusion('rejected');
        try {
          const { stopMeetingRoom } = await import('@/api/meetingRoomService');
          await stopMeetingRoom(synapseApiBase, roomId);
          toast.success('评审已终止，SOP 节点已置为失败');
          onTaskComplete?.();
        } catch (e) {
          setSelfDisplayConclusion('pending');
          toast.error(`终止失败：${e instanceof Error ? e.message : String(e)}`);
        }
      },
    });
  }, [roomId, synapseApiBase, onTaskComplete]);

  // ── 代码合并 ─────────────────────────────────────────────────────────────────
  const handleMerge = useCallback(async () => {
    const firstTask = taskNos[0] || '';
    if (!firstTask) { toast.warning('未找到研发单号，无法执行合并'); return; }
    setMerging(true);
    try {
      const res = await triggerCodeMerge(synapseApiBase, { username: effectiveUser.employee_id, password: '', taskNo: firstTask });
      if (res.success) {
        await markTaskComplete(synapseApiBase, { demand_no: demandNo, task_nos: taskNos }).catch(() => {});
        toast.success('代码合并成功，任务已完成！');
        onTaskComplete?.();
      } else {
        toast.error(`合并失败：${res.message}`);
      }
    } finally {
      setMerging(false);
    }
  }, [taskNos, synapseApiBase, effectiveUser.employee_id, demandNo, onTaskComplete]);

  // ── 整体状态 badge ────────────────────────────────────────────────────────────
  const overallBadge = {
    not_submitted: { label: '草稿',     cls: 'bg-slate-500/15 text-slate-300 border-slate-500/40' },
    pending:       { label: '评审中',   cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
    approved:      { label: '全员通过', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
    rejected:      { label: '有人拒绝', cls: 'bg-red-500/15 text-red-300 border-red-500/40' },
  }[overallState];

  // ── 构建表格行数据（须在任意 early return 之前，遵守 Hooks 规则） ─────────────
  const tableRows = useMemo<TableRow[]>(() => {
    // 已提交：从报告 reviewers 构建
    if (reviewers.length > 0) {
      return reviewers.map((rv) => ({
        key:           rv.employee_id,
        employee_id:   rv.employee_id,
        reviewer_name: rv.reviewer_name || rv.employee_id,
        role:          rv.role,
        conclusion:    rv.conclusion,
        comments:      rv.comments ?? '',
        reviewed_at:   rv.reviewed_at,
        isSelf:        rv.employee_id === effectiveUser.employee_id,
        isNew:         false,
      }));
    }

    // 未提交：自评行 + 自动解析默认评审人 + 手动待定评审人
    const rows: TableRow[] = [];

    // 1. 自评行（始终在第一行）
    rows.push({
      key:           effectiveUser.employee_id || '__self__',
      employee_id:   effectiveUser.employee_id,
      reviewer_name: effectiveUser.name,
      role:          'submitter',
      conclusion:    selfDisplayConclusion,
      comments:      selfDraftComment,
      isSelf:        true,
      isNew:         false,
    });

    // 2. 自动解析的默认评审人（team_lead / product_lead）
    const defaultIds = new Set([effectiveUser.employee_id]);
    const defaultReviewers = [
      ...(resolved?.team_lead    ? [{ ...resolved.team_lead,    role: 'team_lead'    as const }] : []),
      ...(resolved?.product_lead ? [{ ...resolved.product_lead, role: 'product_lead' as const }] : []),
    ];
    for (const dr of defaultReviewers) {
      if (defaultIds.has(dr.employee_id)) continue;
      defaultIds.add(dr.employee_id);
      rows.push({
        key:           dr.employee_id,
        employee_id:   dr.employee_id,
        reviewer_name: dr.reviewer_name || dr.employee_id,
        role:          dr.role,
        conclusion:    'pending',
        comments:      '',
        isSelf:        false,
        isNew:         false,
      });
    }

    // 3. 手动待定评审人
    for (const pr of pendingReviewers) {
      if (defaultIds.has(pr.employee_id)) continue;
      rows.push({
        key:           pr.employee_id,
        employee_id:   pr.employee_id,
        reviewer_name: pr.reviewer_name,
        role:          pr.role,
        conclusion:    'pending',
        comments:      '',
        isSelf:        false,
        isNew:         true,
      });
    }

    return rows;
  }, [reviewers, effectiveUser, resolved, pendingReviewers, selfDraftComment, selfDisplayConclusion]);

  // ── 加载中 ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">正在加载评审数据…</span>
      </div>
    );
  }

  // ── 渲染 ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden">

      {/* ── 上方：报告展示 ─────────────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0 flex-[77.5]" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {/* 报告标题栏 */}
        <div className="flex items-center gap-3 px-5 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.3)' }}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">自动化研发报告</div>
            <div className="text-[11px] text-muted-foreground truncate font-mono">
              {demandNo}{taskNos.length > 0 ? ` · ${taskNos.join(', ')}` : ''}
            </div>
          </div>
          <div className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium shrink-0 ${overallBadge.cls}`}>
            {overallBadge.label}
          </div>
          <Tooltip title="刷新评审状态">
            <button
              onClick={() => { void fetchStatus(); void loadResolvedReviewers(true); }}
              className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
          {isSubmitted && (
            <div className="text-[10px] text-muted-foreground shrink-0">
              {report!.created_at?.slice(0, 16)}
            </div>
          )}
        </div>

        {/* 报告内嵌 */}
        <div className="flex-1 min-h-0 relative">
          {reportHtml ? (
            <iframe
              key={reportHtml.slice(0, 40)}
              srcDoc={reportHtml}
              className="w-full h-full border-none"
              title="自动化研发报告"
              sandbox="allow-scripts"
              style={{ background: '#060d1a' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
              <Spin size="small" />
              正在生成报告…
            </div>
          )}
        </div>
      </div>

      {/* ── 下方：评审面板（表格式） ──────────────────────────────────────────── */}
      <div className="flex flex-col min-h-0 flex-[22.5] overflow-y-auto custom-scrollbar px-4 py-2" style={{ background: 'rgba(0,0,0,0.2)' }}>
        <ReviewTable
          rows={tableRows}
          disabled={pushed || isAllApproved}
          selfReviewing={selfReviewing || adding}
          resolvedOptions={resolved?.internal_options ?? []}
          resolvedLoading={reviewersLoading}
          resolvedError={reviewersError}
          onSelfCommentChange={setSelfDraftComment}
          onAddRow={handleAddReviewer}
          onRemoveNewRow={(key) => setPendingReviewers((prev) => prev.filter((r) => r.employee_id !== key))}
          onSubmit={handleSelfReview}
          onTerminate={handleTerminate}
          onMerge={handleMerge}
          isAllApproved={isAllApproved}
          merging={merging}
          isSubmitted={isSubmitted}
        />
      </div>
    </div>
  );
}

export default LeaderReviewSopPanel;
